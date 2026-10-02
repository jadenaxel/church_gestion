import 'reflect-metadata';
import type { Request } from 'express';
import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	randomBytes,
} from 'node:crypto';
import type { Pool } from 'pg';
import nodemailer from 'nodemailer';
import {
	Body,
	Controller,
	Get,
	Headers,
	Module,
	Param,
	Patch,
	Post,
	Query,
	Req,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { z } from 'zod';
import type { AuthPrincipal } from '@gc/contracts';
import { controlPool, tenantPoolFromId, withTransaction } from '@gc/database';
import {
	activityReadPredicate,
	bootstrapNest,
	currentUser,
	HEALTH_RESPONSE,
	JwtAuthGuard,
	matchesSecret,
	Public,
	requirePermission,
} from '@gc/platform';
import { retryDelayMs } from '@gc/calendar-domain';
import { startDomainEventConsumer } from '@gc/messaging';
import { resolveSmtpTarget } from './outbound-security.js';
import { claimDelivery, claimReminder, finishDelivery, finishReminder, notificationEventHash, processInbox, recordWebhook, sendReminderEvent } from './reliability.js';
import {
	escapeNotificationHtml,
	extractMetaStatuses,
	renderNotification,
	validProviderSignature,
} from '@gc/notification-domain';

process.env.DATABASE_SERVICE_ROLE ??= 'gc_notification_service';

const productionMode = process.env.NODE_ENV === 'production';
if (
	productionMode &&
	(!process.env.CONFIG_ENCRYPTION_KEY ||
		process.env.CONFIG_ENCRYPTION_KEY.length < 32)
) {
	throw new Error(
		'CONFIG_ENCRYPTION_KEY debe contener al menos 32 caracteres en producción. Configure el secreto antes de iniciar notification-service.',
	);
}

const eventSchema = z.object({
	id: z.uuid(),
	type: z.string().min(3).max(120),
	aggregateId: z.uuid(),
	payload: z.record(z.string(), z.unknown()),
});

const preferenceSchema = z
	.object({
		emailEnabled: z.boolean().optional(),
		whatsappEnabled: z.boolean().optional(),
		remindersEnabled: z.boolean().optional(),
		optionalUpdatesEnabled: z.boolean().optional(),
		uiLocale: z.enum(['es', 'en', 'fr']).optional(),
		accessibilitySettings: z
			.object({
				fontScale: z.enum(['normal', 'large', 'xlarge']).optional(),
				highContrast: z.boolean().optional(),
				reduceMotion: z.boolean().optional(),
				enhancedFocus: z.boolean().optional(),
				readableFont: z.boolean().optional(),
				comfortableSpacing: z.boolean().optional(),
			})
			.strict()
			.optional(),
	})
	.refine(
		(value) => Object.keys(value).length > 0,
		'Indica al menos una preferencia.',
	);

const channelSettingsSchema = z.object({
	smtpHost: z.string().trim().min(2).max(255),
	smtpPort: z.number().int().min(1).max(65535),
	smtpSecure: z.boolean(),
	smtpRequireTls: z.boolean(),
	smtpUser: z.string().trim().max(255).nullable(),
	smtpPassword: z.string().max(1000).optional(),
	clearSmtpPassword: z.boolean().optional(),
	smtpFromName: z.string().trim().min(2).max(160),
	smtpFromEmail: z.email(),
	whatsappMode: z.enum(['simulated', 'live']),
	whatsappPhoneNumberId: z.string().trim().max(100).nullable(),
	whatsappAccessToken: z.string().max(4000).optional(),
	clearWhatsappAccessToken: z.boolean().optional(),
	whatsappVerifyToken: z.string().max(1000).optional(),
	clearWhatsappVerifyToken: z.boolean().optional(),
	whatsappAppSecret: z.string().max(1000).optional(),
	clearWhatsappAppSecret: z.boolean().optional(),
	whatsappTemplateName: z.string().trim().max(512).nullable(),
	whatsappTemplateLanguage: z.string().trim().min(2).max(20),
	metaGraphVersion: z
		.string()
		.trim()
		.regex(/^v\d+\.\d+$/),
});

const emailTestSchema = z.object({ recipient: z.email() });
const whatsappTestSchema = z.object({
	phone: z
		.string()
		.trim()
		.regex(
			/^\+[1-9]\d{7,14}$/,
			'Usa formato internacional E.164, por ejemplo +18095551234.',
		),
});

type ProviderDelivery = {
	status: 'SENT' | 'FAILED' | 'SIMULATED';
	providerMessageId?: string;
	error?: string;
};
type ProviderVerification = {
	status: 'VERIFIED' | 'FAILED';
	message: string;
	details?: {
		provider?: string;
		account?: string;
		phone?: string;
		quality?: string;
	};
};
type ChannelSettings = {
	smtpHost: string;
	smtpPort: number;
	smtpSecure: boolean;
	smtpRequireTls: boolean;
	smtpUser: string | null;
	smtpPassword: string | null;
	smtpFromName: string;
	smtpFromEmail: string;
	whatsappMode: 'simulated' | 'live';
	whatsappPhoneNumberId: string | null;
	whatsappAccessToken: string | null;
	whatsappVerifyToken: string | null;
	whatsappAppSecret: string | null;
	whatsappTemplateName: string | null;
	whatsappTemplateLanguage: string;
	metaGraphVersion: string;
	emailLastTestStatus: string | null;
	emailLastTestMessage: string | null;
	emailLastTestAt: string | null;
	whatsappLastTestStatus: string | null;
	whatsappLastTestMessage: string | null;
	whatsappLastTestAt: string | null;
	smtpLastVerifiedStatus: string | null;
	smtpLastVerifiedMessage: string | null;
	smtpLastVerifiedAt: string | null;
	whatsappLastVerifiedStatus: string | null;
	whatsappLastVerifiedMessage: string | null;
	whatsappLastVerifiedAt: string | null;
	updatedAt: string | null;
};

type ChannelSettingsRow = {
	managed: boolean;
	smtp_host: string | null;
	smtp_port: number | null;
	smtp_secure: boolean;
	smtp_require_tls: boolean;
	smtp_user: string | null;
	smtp_password_encrypted: string | null;
	smtp_from_name: string | null;
	smtp_from_email: string | null;
	whatsapp_mode: 'simulated' | 'live';
	whatsapp_phone_number_id: string | null;
	whatsapp_access_token_encrypted: string | null;
	whatsapp_verify_token_encrypted: string | null;
	whatsapp_app_secret_encrypted: string | null;
	whatsapp_template_name: string | null;
	whatsapp_template_language: string;
	meta_graph_version: string;
	email_last_test_status: string | null;
	email_last_test_message: string | null;
	email_last_test_at: string | null;
	whatsapp_last_test_status: string | null;
	whatsapp_last_test_message: string | null;
	whatsapp_last_test_at: string | null;
	smtp_last_verified_status: string | null;
	smtp_last_verified_message: string | null;
	smtp_last_verified_at: string | null;
	whatsapp_last_verified_status: string | null;
	whatsapp_last_verified_message: string | null;
	whatsapp_last_verified_at: string | null;
	updated_at: string | null;
};

function encryptionKey(): Buffer {
	const secret =
		process.env.CONFIG_ENCRYPTION_KEY ??
		(productionMode
			? ''
			: (process.env.JWT_SECRET ??
				process.env.INTERNAL_SERVICE_SECRET ??
				'gestionchurch-local-configuration-key'));
	if (secret.length < 32)
		throw new Error(
			'La clave de cifrado de configuración no está disponible o es demasiado corta.',
		);
	return createHash('sha256').update(secret).digest();
}

function publicApiUrl(): string {
	return (process.env.PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(
		/\/$/,
		'',
	);
}

function publicWebhookReady(): boolean {
	try {
		const url = new URL(publicApiUrl());
		const hostname = url.hostname.toLowerCase();
		const privateHost =
			hostname === 'localhost' ||
			hostname === '::1' ||
			hostname.endsWith('.local') ||
			/^127\./.test(hostname) ||
			/^10\./.test(hostname) ||
			/^192\.168\./.test(hostname) ||
			/^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
		return url.protocol === 'https:' && !privateHost;
	} catch {
		return false;
	}
}

function encryptSecret(value: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
	const ciphertext = Buffer.concat([
		cipher.update(value, 'utf8'),
		cipher.final(),
	]);
	return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
}

function decryptSecret(value: string | null): string | null {
	if (!value) return null;
	try {
		const [version, iv, tag, ciphertext] = value.split(':');
		if (version !== 'v1' || !iv || !tag || !ciphertext) return null;
		const decipher = createDecipheriv(
			'aes-256-gcm',
			encryptionKey(),
			Buffer.from(iv, 'base64url'),
		);
		decipher.setAuthTag(Buffer.from(tag, 'base64url'));
		return Buffer.concat([
			decipher.update(Buffer.from(ciphertext, 'base64url')),
			decipher.final(),
		]).toString('utf8');
	} catch {
		return null;
	}
}

function environmentFrom(): { name: string; email: string } {
	const configured =
		process.env.SMTP_FROM ?? 'GestionChurch <no-reply@gestionchurch.local>';
	const parsed = configured.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
	return parsed
		? { name: parsed[1] || 'GestionChurch', email: parsed[2]! }
		: { name: 'GestionChurch', email: configured };
}

async function loadChannelSettings(pool: Pool): Promise<ChannelSettings> {
	const result = await pool.query<ChannelSettingsRow>(
		`SELECT * FROM notifications.channel_settings WHERE singleton`,
	);
	const row = result.rows[0];
	const managed = row?.managed === true;
	const from = environmentFrom();
	return {
		smtpHost: managed
			? (row!.smtp_host ?? '127.0.0.1')
			: (process.env.SMTP_HOST ?? '127.0.0.1'),
		smtpPort: managed
			? (row!.smtp_port ?? 1025)
			: Number(process.env.SMTP_PORT ?? 1025),
		smtpSecure: managed ? row!.smtp_secure : process.env.SMTP_SECURE === 'true',
		smtpRequireTls: managed
			? row!.smtp_require_tls
			: process.env.SMTP_REQUIRE_TLS === 'true',
		smtpUser: managed ? row!.smtp_user : (process.env.SMTP_USER ?? null),
		smtpPassword: managed
			? decryptSecret(row!.smtp_password_encrypted)
			: (process.env.SMTP_PASSWORD ?? null),
		smtpFromName: managed
			? (row!.smtp_from_name ?? 'GestionChurch')
			: from.name,
		smtpFromEmail: managed
			? (row!.smtp_from_email ?? 'no-reply@gestionchurch.local')
			: from.email,
		whatsappMode: managed
			? row!.whatsapp_mode
			: process.env.WHATSAPP_MODE === 'live'
				? 'live'
				: 'simulated',
		whatsappPhoneNumberId: managed
			? row!.whatsapp_phone_number_id
			: (process.env.WHATSAPP_PHONE_NUMBER_ID ?? null),
		whatsappAccessToken: managed
			? decryptSecret(row!.whatsapp_access_token_encrypted)
			: (process.env.WHATSAPP_ACCESS_TOKEN ?? null),
		whatsappVerifyToken: managed
			? decryptSecret(row!.whatsapp_verify_token_encrypted)
			: (process.env.WHATSAPP_VERIFY_TOKEN ?? null),
		whatsappAppSecret: managed
			? decryptSecret(row!.whatsapp_app_secret_encrypted)
			: (process.env.WHATSAPP_APP_SECRET ?? null),
		whatsappTemplateName: managed
			? row!.whatsapp_template_name
			: (process.env.WHATSAPP_TEMPLATE_NAME ?? null),
		whatsappTemplateLanguage: managed
			? row!.whatsapp_template_language
			: (process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'es'),
		metaGraphVersion: managed
			? row!.meta_graph_version
			: (process.env.META_GRAPH_VERSION ?? 'v23.0'),
		emailLastTestStatus: row?.email_last_test_status ?? null,
		emailLastTestMessage: row?.email_last_test_message ?? null,
		emailLastTestAt: row?.email_last_test_at ?? null,
		whatsappLastTestStatus: row?.whatsapp_last_test_status ?? null,
		whatsappLastTestMessage: row?.whatsapp_last_test_message ?? null,
		whatsappLastTestAt: row?.whatsapp_last_test_at ?? null,
		smtpLastVerifiedStatus: row?.smtp_last_verified_status ?? null,
		smtpLastVerifiedMessage: row?.smtp_last_verified_message ?? null,
		smtpLastVerifiedAt: row?.smtp_last_verified_at ?? null,
		whatsappLastVerifiedStatus: row?.whatsapp_last_verified_status ?? null,
		whatsappLastVerifiedMessage: row?.whatsapp_last_verified_message ?? null,
		whatsappLastVerifiedAt: row?.whatsapp_last_verified_at ?? null,
		updatedAt: row?.updated_at ?? null,
	};
}

function publicChannelSettings(settings: ChannelSettings, tenantId: string) {
	return {
		smtpHost: settings.smtpHost,
		smtpPort: settings.smtpPort,
		smtpSecure: settings.smtpSecure,
		smtpRequireTls: settings.smtpRequireTls,
		smtpUser: settings.smtpUser,
		hasSmtpPassword: Boolean(settings.smtpPassword),
		smtpFromName: settings.smtpFromName,
		smtpFromEmail: settings.smtpFromEmail,
		whatsappMode: settings.whatsappMode,
		whatsappPhoneNumberId: settings.whatsappPhoneNumberId,
		hasWhatsappAccessToken: Boolean(settings.whatsappAccessToken),
		hasWhatsappVerifyToken: Boolean(settings.whatsappVerifyToken),
		hasWhatsappAppSecret: Boolean(settings.whatsappAppSecret),
		whatsappTemplateName: settings.whatsappTemplateName,
		whatsappTemplateLanguage: settings.whatsappTemplateLanguage,
		metaGraphVersion: settings.metaGraphVersion,
		webhookUrl: `${publicApiUrl()}/webhooks/meta?tenantId=${encodeURIComponent(tenantId)}`,
		runtimeMode: productionMode ? 'production' : 'development',
		dedicatedEncryptionKey: Boolean(
			process.env.CONFIG_ENCRYPTION_KEY &&
				process.env.CONFIG_ENCRYPTION_KEY.length >= 32,
		),
		publicWebhookReady: publicWebhookReady(),
		emailLastTestStatus: settings.emailLastTestStatus,
		emailLastTestMessage: settings.emailLastTestMessage,
		emailLastTestAt: settings.emailLastTestAt,
		whatsappLastTestStatus: settings.whatsappLastTestStatus,
		whatsappLastTestMessage: settings.whatsappLastTestMessage,
		whatsappLastTestAt: settings.whatsappLastTestAt,
		smtpLastVerifiedStatus: settings.smtpLastVerifiedStatus,
		smtpLastVerifiedMessage: settings.smtpLastVerifiedMessage,
		smtpLastVerifiedAt: settings.smtpLastVerifiedAt,
		whatsappLastVerifiedStatus: settings.whatsappLastVerifiedStatus,
		whatsappLastVerifiedMessage: settings.whatsappLastVerifiedMessage,
		whatsappLastVerifiedAt: settings.whatsappLastVerifiedAt,
		updatedAt: settings.updatedAt,
	};
}

function settingsTenantId(
	user: AuthPrincipal,
	requestedTenantId?: string,
): string {
	if (user.scope === 'global') {
		requirePermission(user, 'global.tenants.manage');
		return z.uuid().parse(requestedTenantId);
	}
	requirePermission(user, 'tenant.settings.manage');
	if (!user.tenantId)
		throw Object.assign(new Error('El usuario no pertenece a un tenant.'), {
			status: 403,
		});
	if (requestedTenantId && requestedTenantId !== user.tenantId)
		throw Object.assign(new Error('No puede configurar otro tenant.'), {
			status: 403,
		});
	return user.tenantId;
}

function maskedEmail(email: string): string {
	const [local, domain] = email.split('@');
	if (!local || !domain) return '••••';
	return `${local.slice(0, 2)}${'•'.repeat(Math.max(2, local.length - 2))}@${domain}`;
}

async function smtpTransport(settings: ChannelSettings) {
	if (productionMode && !settings.smtpSecure && !settings.smtpRequireTls) {
		throw new Error('El envío SMTP en producción requiere TLS directo o STARTTLS obligatorio.');
	}
	const target = await resolveSmtpTarget(settings.smtpHost);
	return nodemailer.createTransport({
		host: target,
		port: settings.smtpPort,
		secure: settings.smtpSecure,
		requireTLS: settings.smtpRequireTls,
		tls: { servername: settings.smtpHost, rejectUnauthorized: true },
		connectionTimeout: 10_000,
		greetingTimeout: 10_000,
		socketTimeout: 15_000,
		...(settings.smtpUser && settings.smtpPassword
			? { auth: { user: settings.smtpUser, pass: settings.smtpPassword } }
			: {}),
	});
}

async function verifyEmailProvider(
	settings: ChannelSettings,
): Promise<ProviderVerification> {
	let transport: Awaited<ReturnType<typeof smtpTransport>> | undefined;
	try {
		transport = await smtpTransport(settings);
		await transport.verify();
		return {
			status: 'VERIFIED',
			message: `Conexión SMTP verificada en ${settings.smtpHost}:${settings.smtpPort}; DNS, TLS y autenticación respondieron correctamente.`,
			details: {
				provider: settings.smtpHost,
				account: settings.smtpUser ?? 'Relay autenticado por red',
			},
		};
	} catch (error) {
		return {
			status: 'FAILED',
			message:
				error instanceof Error
					? error.message
					: 'No fue posible verificar el servidor SMTP.',
		};
	} finally {
		transport?.close();
	}
}

async function deliverEmail(
	settings: ChannelSettings,
	email: string | string[],
	title: string,
	body: string,
): Promise<ProviderDelivery> {
	let transport: Awaited<ReturnType<typeof smtpTransport>> | undefined;
	try {
		transport = await smtpTransport(settings);
		const result = await transport.sendMail({
			from: { name: settings.smtpFromName, address: settings.smtpFromEmail },
			to: email,
			subject: title,
			text: body,
			html: `<div style="font-family:Arial,sans-serif;max-width:560px"><h1 style="color:#0b5d52">${escapeNotificationHtml(title)}</h1><p>${escapeNotificationHtml(body)}</p><p style="color:#667085">GestionChurch · Coordinación con propósito</p></div>`,
		});
		return { status: 'SENT', providerMessageId: result.messageId };
	} catch (error) {
		return {
			status: 'FAILED',
			error:
				error instanceof Error
					? error.message
					: 'No fue posible contactar al servidor SMTP.',
		};
	} finally {
		transport?.close();
	}
}

async function verifyWhatsAppProvider(
	settings: ChannelSettings,
): Promise<ProviderVerification> {
	if (settings.whatsappMode !== 'live')
		return {
			status: 'FAILED',
			message: 'Activa Producción real antes de validar Meta Cloud API.',
		};
	if (!settings.whatsappPhoneNumberId || !settings.whatsappAccessToken) {
		return {
			status: 'FAILED',
			message: 'Faltan Phone Number ID o Access token.',
		};
	}
	if (!publicWebhookReady()) {
		return {
			status: 'FAILED',
			message:
				'PUBLIC_API_URL debe ser una URL HTTPS pública para que Meta pueda entregar webhooks.',
		};
	}
	try {
		const fields = 'id,display_phone_number,verified_name,quality_rating';
		const response = await fetch(
			`https://graph.facebook.com/${settings.metaGraphVersion}/${encodeURIComponent(settings.whatsappPhoneNumberId)}?fields=${encodeURIComponent(fields)}`,
			{
				headers: { authorization: `Bearer ${settings.whatsappAccessToken}` },
				signal: AbortSignal.timeout(15_000),
			},
		);
		const result = (await response.json()) as {
			id?: string;
			display_phone_number?: string;
			verified_name?: string;
			quality_rating?: string;
			error?: { message?: string; type?: string; code?: number };
		};
		if (!response.ok) {
			return {
				status: 'FAILED',
				message:
					result.error?.message ??
					`Meta Graph API respondió ${response.status}.`,
			};
		}
		if (result.id !== settings.whatsappPhoneNumberId) {
			return {
				status: 'FAILED',
				message:
					'Meta respondió con una identidad de número distinta a la configurada.',
			};
		}
		return {
			status: 'VERIFIED',
			message: `Meta confirmó ${result.verified_name ?? 'la cuenta empresarial'} (${result.display_phone_number ?? settings.whatsappPhoneNumberId}).`,
			details: {
				provider: 'Meta WhatsApp Cloud API',
				account: result.verified_name ?? 'Cuenta empresarial',
				phone: result.display_phone_number ?? settings.whatsappPhoneNumberId,
				quality: result.quality_rating ?? 'UNKNOWN',
			},
		};
	} catch (error) {
		return {
			status: 'FAILED',
			message:
				error instanceof Error
					? error.message
					: 'No fue posible verificar Meta Cloud API.',
		};
	}
}

async function deliverWhatsApp(
	settings: ChannelSettings,
	phone: string | null,
	title: string,
	body: string,
): Promise<ProviderDelivery> {
	if (settings.whatsappMode !== 'live') return { status: 'SIMULATED' };
	const phoneNumberId = settings.whatsappPhoneNumberId;
	const accessToken = settings.whatsappAccessToken;
	if (!phone || !phoneNumberId || !accessToken) {
		return {
			status: 'FAILED',
			error: 'Faltan número destinatario o credenciales de WhatsApp.',
		};
	}
	const graphVersion = settings.metaGraphVersion;
	const templateName = settings.whatsappTemplateName;
	const payload = templateName
		? {
				messaging_product: 'whatsapp',
				to: phone.replace(/^\+/, ''),
				type: 'template',
				template: {
					name: templateName,
					language: { code: settings.whatsappTemplateLanguage },
					components: [
						{
							type: 'body',
							parameters: [
								{ type: 'text', text: title },
								{ type: 'text', text: body },
							],
						},
					],
				},
			}
		: {
				messaging_product: 'whatsapp',
				to: phone.replace(/^\+/, ''),
				type: 'text',
				text: { preview_url: false, body: `*${title}*\n${body}` },
			};
	try {
		const response = await fetch(
			`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
			{
				method: 'POST',
				headers: {
					authorization: `Bearer ${accessToken}`,
					'content-type': 'application/json',
				},
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(15_000),
			},
		);
		const result = (await response.json()) as {
			messages?: Array<{ id: string }>;
			error?: { message?: string };
		};
		if (!response.ok)
			return {
				status: 'FAILED',
				error: result.error?.message ?? `Meta respondió ${response.status}.`,
			};
		const providerMessageId = result.messages?.[0]?.id;
		return providerMessageId
			? { status: 'SENT', providerMessageId }
			: { status: 'SENT' };
	} catch (error) {
		return {
			status: 'FAILED',
			error:
				error instanceof Error
					? error.message
					: 'No fue posible contactar a Meta.',
		};
	}
}

function linkFor(event: z.infer<typeof eventSchema>): string {
	if (
		event.type === 'auth.password_reset_requested' &&
		typeof event.payload.resetUrl === 'string'
	) {
		return event.payload.resetUrl;
	}
	if (event.type.startsWith('department_operations.')) return '/ministry-hub';
	if (event.type.startsWith('review.session_'))
		return `/reviews?sessionId=${event.aggregateId}`;
	if (event.type.startsWith('review.')) return '/reviews';
	return `/activities/${event.aggregateId}`;
}

@Controller()
class NotificationController {
	@Public()
	@Get('health/live')
	health() {
		return HEALTH_RESPONSE;
	}

	@Public()
	@Post('events')
	async receiveEvent(
		@Headers('x-internal-secret') secret: string,
		@Headers('x-tenant-id') tenantId: string,
		@Body() body: unknown,
	) {
		if (!matchesSecret(secret, process.env.INTERNAL_SERVICE_SECRET ?? 'gestionchurch-internal-development-secret')) {
			throw Object.assign(new Error('Credencial interna inválida.'), {
				status: 401,
			});
		}
		const event = eventSchema.parse(body);
		const userId =
			typeof event.payload.userId === 'string' ? event.payload.userId : null;
		const { pool, tenant } = await tenantPoolFromId(tenantId);
		return processInbox(pool, event, notificationEventHash(event), async (client) => {
      const preferences = userId
        ? await client.query<{ email_enabled: boolean; whatsapp_enabled: boolean; reminders_enabled: boolean; optional_updates_enabled: boolean; ui_locale: 'es' | 'en' | 'fr' }>('SELECT email_enabled,whatsapp_enabled,reminders_enabled,optional_updates_enabled,ui_locale FROM notifications.preferences WHERE user_id=$1', [userId])
        : { rows: [] };
      const preference = preferences.rows[0];
      const rendered = renderNotification(event.type, event.payload, preference?.ui_locale ?? 'es', tenant.timezone);
      const title = rendered.title, message = rendered.body;
			const inserted = await client.query<{ id: string }>(
				`INSERT INTO notifications.notifications(event_id,user_id,title,body,link,event_type,optional)
                 VALUES($1,$2,$3,$4,$5,$6,$7)
                 ON CONFLICT(event_id) DO UPDATE SET event_id=EXCLUDED.event_id RETURNING id`,
				[event.id, userId, title, message, linkFor(event), event.type, Boolean(event.payload.optional)],
			);
			const notificationId = inserted.rows[0]!.id;
			await client.query(`INSERT INTO notifications.deliveries(notification_id,channel,status,recipient_data) VALUES($1,'IN_APP','DELIVERED',$2::jsonb) ON CONFLICT DO NOTHING`, [notificationId, JSON.stringify({ eventPayload: event.payload })]);
			const contacts = userId
				? await client.query<{ email: string; phone: string | null; ui_locale?: 'es' | 'en' | 'fr' }>('SELECT email,phone FROM identity.users WHERE id=$1 AND active', [userId])
				: event.type === 'review.requested'
					? await client.query<{ email: string; phone: string | null; ui_locale?: 'es' | 'en' | 'fr' }>(`SELECT u.email,u.phone,p.ui_locale FROM identity.users u LEFT JOIN notifications.preferences p ON p.user_id=u.id WHERE u.active AND 'BOARD_SECRETARY'=ANY(u.roles)`)
					: { rows: [] as Array<{ email: string; phone: string | null; ui_locale?: 'es' | 'en' | 'fr' }> };
			const allowed = !Boolean(event.payload.optional) || preference?.optional_updates_enabled !== false;
			const reminderAllowed = !event.type.includes('reminder_') || preference?.reminders_enabled !== false;
			const explicitEmail = typeof event.payload.email === 'string' ? event.payload.email : null;
			const emails = [...new Set([...(explicitEmail ? [explicitEmail] : []), ...contacts.rows.map((contact) => contact.email)])];
			if (allowed && reminderAllowed && preference?.email_enabled !== false && emails.length) {
        const messages = emails.map((email) => ({ email, ...renderNotification(event.type, event.payload, preference?.ui_locale ?? contacts.rows.find((contact) => contact.email === email)?.ui_locale ?? 'es', tenant.timezone) }));
				await client.query(`INSERT INTO notifications.deliveries(notification_id,channel,status,recipient_data,next_attempt_at)
                    VALUES($1,'EMAIL','PENDING',$2::jsonb,now()) ON CONFLICT DO NOTHING`, [notificationId, JSON.stringify({ emails, messages })]);
			}
			const explicitPhone = typeof event.payload.phone === 'string' ? event.payload.phone : null;
			const phone = explicitPhone ?? contacts.rows.find((contact) => contact.phone)?.phone ?? null;
			if (allowed && reminderAllowed && preference?.whatsapp_enabled === true) {
				await client.query(`INSERT INTO notifications.deliveries(notification_id,channel,status,recipient_data,next_attempt_at)
                    VALUES($1,'WHATSAPP','PENDING',$2::jsonb,now()) ON CONFLICT DO NOTHING`, [notificationId, JSON.stringify({ phone })]);
			}
			// Providers run only from committed durable delivery rows. A failed
			// transaction cannot send an external message or poison deduplication.
			return { accepted: true, notificationId };
		});
	}

	@Get('notifications/preferences')
	async preferences(@Req() request: Request & { user?: AuthPrincipal }) {
		const user = currentUser(request);
		if (user.scope === 'global') {
			await controlPool.query(
				`INSERT INTO control.global_user_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING`,
				[user.sub],
			);
			const result = await controlPool.query(
				`SELECT true "emailEnabled",false "whatsappEnabled",true "remindersEnabled",true "optionalUpdatesEnabled",
                ui_locale "uiLocale",accessibility_settings "accessibilitySettings",updated_at "updatedAt"
           FROM control.global_user_preferences WHERE user_id=$1`,
				[user.sub],
			);
			return result.rows[0];
		}
		const { pool } = await tenantPoolFromId(user.tenantId!);
		await pool.query(
			`INSERT INTO notifications.preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING`,
			[user.sub],
		);
		const result = await pool.query(
			`SELECT email_enabled "emailEnabled",whatsapp_enabled "whatsappEnabled",reminders_enabled "remindersEnabled",
              optional_updates_enabled "optionalUpdatesEnabled",ui_locale "uiLocale",accessibility_settings "accessibilitySettings",
              consented_at "consentedAt",updated_at "updatedAt"
       FROM notifications.preferences WHERE user_id=$1`,
			[user.sub],
		);
		return result.rows[0];
	}

	@Patch('notifications/preferences')
	async updatePreferences(
		@Req() request: Request & { user?: AuthPrincipal },
		@Body() body: unknown,
	) {
		const user = currentUser(request);
		const input = preferenceSchema.parse(body);
		if (user.scope === 'global') {
			await controlPool.query(
				`INSERT INTO control.global_user_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING`,
				[user.sub],
			);
			await controlPool.query(
				`UPDATE control.global_user_preferences
            SET ui_locale=COALESCE($2::text,ui_locale),accessibility_settings=COALESCE($3::jsonb,accessibility_settings),updated_at=now()
          WHERE user_id=$1`,
				[
					user.sub,
					input.uiLocale,
					input.accessibilitySettings
						? JSON.stringify(input.accessibilitySettings)
						: undefined,
				],
			);
			const result = await controlPool.query(
				`SELECT true "emailEnabled",false "whatsappEnabled",true "remindersEnabled",true "optionalUpdatesEnabled",
                ui_locale "uiLocale",accessibility_settings "accessibilitySettings"
           FROM control.global_user_preferences WHERE user_id=$1`,
				[user.sub],
			);
			await controlPool.query(
				`INSERT INTO control.audit_log(actor_id,action,resource_type,resource_id,metadata)
         VALUES($1::uuid,'global.preferences.updated','global_preferences',$1::text,$2::jsonb)`,
				[
					user.sub,
					JSON.stringify({
						uiLocale: input.uiLocale,
						accessibilitySettings: input.accessibilitySettings,
						outcome: 'SUCCESS',
					}),
				],
			);
			return result.rows[0];
		}
		const { pool } = await tenantPoolFromId(user.tenantId!);
		const result = await pool.query(
			`INSERT INTO notifications.preferences(user_id,email_enabled,whatsapp_enabled,reminders_enabled,optional_updates_enabled,ui_locale,accessibility_settings,consented_at)
       VALUES($1,COALESCE($2::boolean,true),COALESCE($3::boolean,false),COALESCE($4::boolean,true),COALESCE($5::boolean,true),COALESCE($6::text,'es'),COALESCE($7::jsonb,'{}'::jsonb),CASE WHEN $3::boolean=true THEN now() END)
       ON CONFLICT(user_id) DO UPDATE SET
        email_enabled=COALESCE($2::boolean,notifications.preferences.email_enabled),
        whatsapp_enabled=COALESCE($3::boolean,notifications.preferences.whatsapp_enabled),
        reminders_enabled=COALESCE($4::boolean,notifications.preferences.reminders_enabled),
        optional_updates_enabled=COALESCE($5::boolean,notifications.preferences.optional_updates_enabled),
        ui_locale=COALESCE($6::text,notifications.preferences.ui_locale),
        accessibility_settings=COALESCE($7::jsonb,notifications.preferences.accessibility_settings),
        consented_at=CASE WHEN $3::boolean=true THEN COALESCE(notifications.preferences.consented_at,now()) WHEN $3::boolean=false THEN NULL ELSE notifications.preferences.consented_at END,
        updated_at=now()
       RETURNING email_enabled "emailEnabled",whatsapp_enabled "whatsappEnabled",reminders_enabled "remindersEnabled",
                 optional_updates_enabled "optionalUpdatesEnabled",ui_locale "uiLocale",accessibility_settings "accessibilitySettings",consented_at "consentedAt"`,
			[
				user.sub,
				input.emailEnabled,
				input.whatsappEnabled,
				input.remindersEnabled,
				input.optionalUpdatesEnabled,
				input.uiLocale,
				input.accessibilitySettings
					? JSON.stringify(input.accessibilitySettings)
					: undefined,
			],
		);
		await pool.query(
			`INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
       VALUES($1::uuid,'NOTIFICATION_PREFERENCES_UPDATED','notification_preferences',$1::text,$2::jsonb)`,
			[user.sub, JSON.stringify(input)],
		);
		return result.rows[0];
	}

	@Get('notifications/channels/settings')
	async channelSettings(
		@Req() request: Request & { user?: AuthPrincipal },
		@Query('tenantId') requestedTenantId?: string,
	) {
		const user = currentUser(request);
		const tenantId = settingsTenantId(user, requestedTenantId);
		const { tenant, pool } = await tenantPoolFromId(tenantId);
		const settings = await loadChannelSettings(pool);
		return {
			tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
			settings: publicChannelSettings(settings, tenantId),
		};
	}

	@Patch('notifications/channels/settings')
	async updateChannelSettings(
		@Req() request: Request & { user?: AuthPrincipal },
		@Query('tenantId') requestedTenantId: string | undefined,
		@Body() body: unknown,
	) {
		const user = currentUser(request);
		const tenantId = settingsTenantId(user, requestedTenantId);
		const input = channelSettingsSchema.parse(body);
		const { tenant, pool } = await tenantPoolFromId(tenantId);
		const existing = await pool.query<ChannelSettingsRow>(
			`SELECT * FROM notifications.channel_settings WHERE singleton`,
		);
		const current = existing.rows[0];
		const smtpPassword = input.clearSmtpPassword
			? null
			: input.smtpPassword
				? encryptSecret(input.smtpPassword)
				: (current?.smtp_password_encrypted ?? null);
		const whatsappAccessToken = input.clearWhatsappAccessToken
			? null
			: input.whatsappAccessToken
				? encryptSecret(input.whatsappAccessToken)
				: (current?.whatsapp_access_token_encrypted ?? null);
		const whatsappVerifyToken = input.clearWhatsappVerifyToken
			? null
			: input.whatsappVerifyToken
				? encryptSecret(input.whatsappVerifyToken)
				: (current?.whatsapp_verify_token_encrypted ?? null);
		const whatsappAppSecret = input.clearWhatsappAppSecret
			? null
			: input.whatsappAppSecret
				? encryptSecret(input.whatsappAppSecret)
				: (current?.whatsapp_app_secret_encrypted ?? null);
		if (
			input.whatsappMode === 'live' &&
			(!input.whatsappPhoneNumberId ||
				!whatsappAccessToken ||
				!whatsappVerifyToken ||
				!whatsappAppSecret ||
				!input.whatsappTemplateName)
		) {
			throw Object.assign(
				new Error(
					'Para activar WhatsApp real completa Phone Number ID, tokens, App Secret y plantilla aprobada.',
				),
				{ status: 400 },
			);
		}
		if (input.whatsappMode === 'live' && !publicWebhookReady()) {
			throw Object.assign(
				new Error(
					'Para activar WhatsApp real configura PUBLIC_API_URL con una URL HTTPS pública accesible por Meta.',
				),
				{ status: 400 },
			);
		}
		await withTransaction(pool, async (client) => {
			await client.query(
				`UPDATE notifications.channel_settings SET managed=true,
           smtp_host=$1,smtp_port=$2,smtp_secure=$3,smtp_require_tls=$4,smtp_user=$5,smtp_password_encrypted=$6,
           smtp_from_name=$7,smtp_from_email=$8,whatsapp_mode=$9,whatsapp_phone_number_id=$10,
           whatsapp_access_token_encrypted=$11,whatsapp_verify_token_encrypted=$12,whatsapp_app_secret_encrypted=$13,
           whatsapp_template_name=$14,whatsapp_template_language=$15,meta_graph_version=$16,updated_by=$17,updated_at=now(),
           email_last_test_status=NULL,email_last_test_message=NULL,email_last_test_at=NULL,
           whatsapp_last_test_status=NULL,whatsapp_last_test_message=NULL,whatsapp_last_test_at=NULL,
           smtp_last_verified_status=NULL,smtp_last_verified_message=NULL,smtp_last_verified_at=NULL,
           whatsapp_last_verified_status=NULL,whatsapp_last_verified_message=NULL,whatsapp_last_verified_at=NULL
         WHERE singleton`,
				[
					input.smtpHost,
					input.smtpPort,
					input.smtpSecure,
					input.smtpRequireTls,
					input.smtpUser || null,
					smtpPassword,
					input.smtpFromName,
					input.smtpFromEmail,
					input.whatsappMode,
					input.whatsappPhoneNumberId || null,
					whatsappAccessToken,
					whatsappVerifyToken,
					whatsappAppSecret,
					input.whatsappTemplateName || null,
					input.whatsappTemplateLanguage,
					input.metaGraphVersion,
					user.sub,
				],
			);
			await client.query(
				`INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
         VALUES($1,'notification.channels_updated','notification_settings',$2,$3::jsonb)`,
				[
					user.sub,
					tenantId,
					JSON.stringify({
						smtpHost: input.smtpHost,
						smtpPort: input.smtpPort,
						smtpSecure: input.smtpSecure,
						smtpRequireTls: input.smtpRequireTls,
						smtpUserConfigured: Boolean(input.smtpUser),
						smtpPasswordConfigured: Boolean(smtpPassword),
						smtpFromEmail: input.smtpFromEmail,
						whatsappMode: input.whatsappMode,
						whatsappPhoneNumberId: input.whatsappPhoneNumberId,
						whatsappAccessTokenConfigured: Boolean(whatsappAccessToken),
						whatsappVerifyTokenConfigured: Boolean(whatsappVerifyToken),
						whatsappAppSecretConfigured: Boolean(whatsappAppSecret),
						whatsappTemplateName: input.whatsappTemplateName,
						whatsappTemplateLanguage: input.whatsappTemplateLanguage,
						metaGraphVersion: input.metaGraphVersion,
						publicWebhookReady: publicWebhookReady(),
					}),
				],
			);
		});
		return {
			tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
			settings: publicChannelSettings(
				await loadChannelSettings(pool),
				tenantId,
			),
		};
	}

	@Post('notifications/channels/verify/email')
	async verifyEmailChannel(
		@Req() request: Request & { user?: AuthPrincipal },
		@Query('tenantId') requestedTenantId: string | undefined,
	) {
		const user = currentUser(request);
		const tenantId = settingsTenantId(user, requestedTenantId);
		const { pool } = await tenantPoolFromId(tenantId);
		const result = await verifyEmailProvider(await loadChannelSettings(pool));
		const verifiedAt = new Date().toISOString();
		await pool.query(
			`UPDATE notifications.channel_settings
          SET smtp_last_verified_status=$1,smtp_last_verified_message=$2,smtp_last_verified_at=$3
        WHERE singleton`,
			[result.status, result.message, verifiedAt],
		);
		await pool.query(
			`INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
       VALUES($1,'notification.smtp_verified','notification_settings',$2,$3::jsonb)`,
			[
				user.sub,
				tenantId,
				JSON.stringify({
					status: result.status,
					provider: result.details?.provider,
				}),
			],
		);
		return { channel: 'EMAIL', ...result, verifiedAt };
	}

	@Post('notifications/channels/verify/whatsapp')
	async verifyWhatsappChannel(
		@Req() request: Request & { user?: AuthPrincipal },
		@Query('tenantId') requestedTenantId: string | undefined,
	) {
		const user = currentUser(request);
		const tenantId = settingsTenantId(user, requestedTenantId);
		const { pool } = await tenantPoolFromId(tenantId);
		const result = await verifyWhatsAppProvider(
			await loadChannelSettings(pool),
		);
		const verifiedAt = new Date().toISOString();
		await pool.query(
			`UPDATE notifications.channel_settings
          SET whatsapp_last_verified_status=$1,whatsapp_last_verified_message=$2,whatsapp_last_verified_at=$3
        WHERE singleton`,
			[result.status, result.message, verifiedAt],
		);
		await pool.query(
			`INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
       VALUES($1,'notification.whatsapp_verified','notification_settings',$2,$3::jsonb)`,
			[
				user.sub,
				tenantId,
				JSON.stringify({
					status: result.status,
					provider: result.details?.provider,
					quality: result.details?.quality,
				}),
			],
		);
		return { channel: 'WHATSAPP', ...result, verifiedAt };
	}

	@Post('notifications/channels/test/email')
	async testEmailChannel(
		@Req() request: Request & { user?: AuthPrincipal },
		@Query('tenantId') requestedTenantId: string | undefined,
		@Body() body: unknown,
	) {
		const user = currentUser(request);
		const tenantId = settingsTenantId(user, requestedTenantId);
		const input = emailTestSchema.parse(body);
		const { tenant, pool } = await tenantPoolFromId(tenantId);
		const result = await deliverEmail(
			await loadChannelSettings(pool),
			input.recipient,
			'Prueba de correo · GestionChurch',
			`La configuración de correo de ${tenant.name} fue validada desde el centro de canales.`,
		);
		const message =
			result.status === 'SENT'
				? `El servidor SMTP aceptó el mensaje para ${input.recipient}.`
				: (result.error ?? 'La prueba SMTP falló.');
		await pool.query(
			`UPDATE notifications.channel_settings SET email_last_test_status=$1,email_last_test_message=$2,email_last_test_at=now() WHERE singleton`,
			[result.status, message],
		);
		await pool.query(
			`INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
       VALUES($1,'notification.email_tested','notification_settings',$2,$3::jsonb)`,
			[
				user.sub,
				tenantId,
				JSON.stringify({
					recipient: maskedEmail(input.recipient),
					status: result.status,
				}),
			],
		);
		return {
			channel: 'EMAIL',
			status: result.status,
			message,
			testedAt: new Date().toISOString(),
		};
	}

	@Post('notifications/channels/test/whatsapp')
	async testWhatsappChannel(
		@Req() request: Request & { user?: AuthPrincipal },
		@Query('tenantId') requestedTenantId: string | undefined,
		@Body() body: unknown,
	) {
		const user = currentUser(request);
		const tenantId = settingsTenantId(user, requestedTenantId);
		const input = whatsappTestSchema.parse(body);
		const { tenant, pool } = await tenantPoolFromId(tenantId);
		const result = await deliverWhatsApp(
			await loadChannelSettings(pool),
			input.phone,
			'Prueba de WhatsApp · GestionChurch',
			`El canal de ${tenant.name} está conectado correctamente.`,
		);
		const message =
			result.status === 'SIMULATED'
				? 'Prueba simulada: cambia el canal a modo real y configura Meta para enviar al teléfono.'
				: result.status === 'SENT'
					? `Meta aceptó el mensaje para ${input.phone}; el webhook actualizará su entrega.`
					: (result.error ?? 'La prueba de WhatsApp falló.');
		await pool.query(
			`UPDATE notifications.channel_settings SET whatsapp_last_test_status=$1,whatsapp_last_test_message=$2,whatsapp_last_test_at=now() WHERE singleton`,
			[result.status, message],
		);
		await pool.query(
			`INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
       VALUES($1,'notification.whatsapp_tested','notification_settings',$2,$3::jsonb)`,
			[
				user.sub,
				tenantId,
				JSON.stringify({
					phone: input.phone.replace(/.(?=.{4})/g, '•'),
					status: result.status,
				}),
			],
		);
		return {
			channel: 'WHATSAPP',
			status: result.status,
			message,
			providerMessageId: result.providerMessageId,
			testedAt: new Date().toISOString(),
		};
	}

	@Get('notifications')
	async list(@Req() request: Request & { user?: AuthPrincipal }) {
		const user = currentUser(request);
		const { pool, tenant } = await tenantPoolFromId(user.tenantId!);
    const preference = await pool.query<{ ui_locale: 'es' | 'en' | 'fr' }>('SELECT ui_locale FROM notifications.preferences WHERE user_id=$1', [user.sub]);
		const result = await pool.query(
			`SELECT n.id,n.title,n.body,n.link,n.read_at,n.created_at,n.event_type,
        (jsonb_agg(d.recipient_data) FILTER(WHERE d.channel='IN_APP'))->0->'eventPayload' source_payload,
        COALESCE(jsonb_object_agg(d.channel,d.status) FILTER(WHERE d.id IS NOT NULL),'{}'::jsonb) deliveries
       FROM notifications.notifications n LEFT JOIN notifications.deliveries d ON d.notification_id=n.id
       WHERE (n.user_id IS NULL OR n.user_id=$1)
         AND (n.link IS NULL OR n.link NOT LIKE '/activities/%' OR EXISTS(
           SELECT 1 FROM calendar.activities a WHERE n.link='/activities/' || a.id::text AND ${activityReadPredicate(user)}
         ))
       GROUP BY n.id ORDER BY n.created_at DESC LIMIT 100`,
			[user.sub],
		);
		return { items: result.rows.map(({ event_type, source_payload, ...item }) => source_payload && typeof source_payload === 'object'
      ? { ...item, ...renderNotification(event_type, source_payload, preference.rows[0]?.ui_locale ?? 'es', tenant.timezone) } : item) };
	}

	@Patch('notifications/:id/read')
	async markRead(
		@Req() request: Request & { user?: AuthPrincipal },
		@Param('id') id: string,
	) {
		const user = currentUser(request);
		const { pool } = await tenantPoolFromId(user.tenantId!);
		await pool.query(
			`UPDATE notifications.notifications n SET read_at=now() WHERE id=$1 AND (user_id IS NULL OR user_id=$2)
         AND (n.link IS NULL OR n.link NOT LIKE '/activities/%' OR EXISTS(
           SELECT 1 FROM calendar.activities a WHERE n.link='/activities/' || a.id::text AND ${activityReadPredicate(user)}
         ))`,
			[id, user.sub],
		);
		return { id, read: true };
	}

	@Get('notifications/dead-letter')
	async deadLetter(@Req() request: Request & { user?: AuthPrincipal }) {
		const user = currentUser(request);
		requirePermission(user, 'users.manage');
		const { pool } = await tenantPoolFromId(user.tenantId!);
		const result = await pool.query(
			`SELECT d.id,d.channel,d.attempts,d.error,d.updated_at,n.title,n.body,n.event_type
       FROM notifications.deliveries d JOIN notifications.notifications n ON n.id=d.notification_id
       WHERE d.status='DEAD_LETTER' ORDER BY d.updated_at DESC LIMIT 200`,
		);
		return { items: result.rows };
	}

	@Post('notifications/deliveries/:id/retry')
	async retryDelivery(
		@Req() request: Request & { user?: AuthPrincipal },
		@Param('id') id: string,
	) {
		const user = currentUser(request);
		requirePermission(user, 'users.manage');
		const { pool } = await tenantPoolFromId(user.tenantId!);
		const deliveryId = z.uuid().parse(id);
    return withTransaction(pool, async (client) => {
      const result = await client.query(
			`UPDATE notifications.deliveries SET status='FAILED',attempts=0,next_attempt_at=now(),error=NULL,lease_until=NULL,claim_token=NULL,updated_at=now()
       WHERE id=$1 AND status='DEAD_LETTER' RETURNING id`,
			[deliveryId],
		);
		if (!result.rowCount)
			throw Object.assign(
				new Error('La entrega no existe o no está en la cola de atención.'),
				{ status: 404 },
			);
		await client.query(
			`INSERT INTO audit.audit_events(actor_id,action,resource_type,resource_id,after_data)
       VALUES($1,'notification.delivery_retry_requested','notification_delivery',$2,'{}'::jsonb)`,
			[user.sub, deliveryId],
		);
		return { id: deliveryId, retryScheduled: true };
    });
	}

	@Public()
	@Get('webhooks/meta')
	async verifyMeta(
		@Req() request: Request,
		@Query('tenantId') requestedTenantId?: string,
		@Headers('x-tenant-id') legacyTenantId?: string,
	) {
		const query = request.query;
		const tenantId = requestedTenantId ?? legacyTenantId;
		let verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
		if (tenantId) {
			const { pool } = await tenantPoolFromId(z.uuid().parse(tenantId));
			verifyToken =
				(await loadChannelSettings(pool)).whatsappVerifyToken ?? undefined;
		}
		if (
			verifyToken &&
			query['hub.mode'] === 'subscribe' &&
			query['hub.verify_token'] === verifyToken
		) {
			return query['hub.challenge'];
		}
		throw Object.assign(new Error('Verificación de webhook inválida.'), {
			status: 403,
		});
	}

	@Public()
	@Post('webhooks/meta')
	async metaWebhook(
		@Req() request: Request & { rawBody?: Buffer },
		@Headers('x-hub-signature-256') signature: string,
		@Headers('x-tenant-id') legacyTenantId: string,
		@Query('tenantId') requestedTenantId: string | undefined,
		@Body() body: Record<string, unknown>,
	) {
		const tenantId = z.uuid().parse(requestedTenantId ?? legacyTenantId);
		const { pool } = await tenantPoolFromId(tenantId);
		const settings = await loadChannelSettings(pool);
		const signatureValid = validProviderSignature(
			request.rawBody,
			signature,
			settings.whatsappAppSecret ?? undefined,
		);
		if (!signatureValid)
			throw Object.assign(new Error('Firma de webhook inválida.'), {
				status: 401,
			});
		const eventId =
			typeof body.id === 'string'
				? body.id
				: createHmac('sha256', settings.whatsappAppSecret!)
						.update(request.rawBody!)
						.digest('hex');
		return recordWebhook(pool, eventId, body, extractMetaStatuses(body));
	}
}

@Module({
	controllers: [NotificationController],
	providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
class NotificationModule {}

await bootstrapNest(NotificationModule, 4015, 'notification-service');

let workerBusy = false;
async function processBackgroundWork() {
	if (workerBusy) return;
	workerBusy = true;
	try {
		const tenants = await controlPool.query<{ id: string }>(
			`SELECT id FROM control.tenants WHERE status='ACTIVE'`,
		);
		for (const tenant of tenants.rows) {
			try {
			const { pool } = await tenantPoolFromId(tenant.id);
			await pool.query(
				`INSERT INTO notifications.scheduled_reminders(activity_id,user_id,remind_at,kind)
         SELECT a.id,a.responsible_user_id,min(s.starts_at)-interval '7 days','7_DAYS'
         FROM calendar.activities a JOIN calendar.schedule_options o ON o.activity_id=a.id AND o.is_selected
         JOIN calendar.schedule_sessions s ON s.option_id=o.id
         WHERE a.status='APPROVED' GROUP BY a.id HAVING min(s.starts_at)>now()+interval '7 days'
         ON CONFLICT DO NOTHING`,
			);
			await pool.query(
				`INSERT INTO notifications.scheduled_reminders(activity_id,user_id,remind_at,kind)
         SELECT a.id,a.responsible_user_id,min(s.starts_at)-interval '24 hours','24_HOURS'
         FROM calendar.activities a JOIN calendar.schedule_options o ON o.activity_id=a.id AND o.is_selected
         JOIN calendar.schedule_sessions s ON s.option_id=o.id
         WHERE a.status='APPROVED' GROUP BY a.id HAVING min(s.starts_at)>now()+interval '24 hours'
         ON CONFLICT DO NOTHING`,
			);
			for (const kind of ['review', 'activity'] as const) {
				for (let index = 0; index < (kind === 'review' ? 50 : 25); index++) {
					const reminder = await claimReminder(pool, kind);
					if (!reminder) break;
					const type = kind === 'review'
						? ({ '24_HOURS': 'review.session_reminder_24_hours', '2_HOURS': 'review.session_reminder_2_hours', '1_HOUR': 'review.session_reminder_1_hour', '30_MINUTES': 'review.session_reminder_30_minutes', '15_MINUTES': 'review.session_reminder_15_minutes' } as Record<string, string>)[reminder.kind] ?? 'review.session_reminder_1_hour'
						: reminder.kind === '7_DAYS' ? 'activity.reminder_7_days' : 'activity.reminder_24_hours';
					try {
						await sendReminderEvent(`http://127.0.0.1:${process.env.NOTIFICATION_PORT ?? 4015}/events`, tenant.id, process.env.INTERNAL_SERVICE_SECRET ?? 'gestionchurch-internal-development-secret', {
							id: reminder.id, type, aggregateId: reminder.review_session_id ?? reminder.activity_id,
							payload: { title: reminder.title, ...(kind === 'review' ? { location: reminder.location } : {}), userId: reminder.user_id },
						});
						await finishReminder(pool, kind, reminder, true, 0);
					} catch {
						await finishReminder(pool, kind, reminder, false, retryDelayMs(reminder.attempts));
					}
				}
			}
			for (let index = 0; index < 50; index++) {
				const delivery = await claimDelivery(pool);
				if (!delivery) break;
				const channelSettings = await loadChannelSettings(pool);
				const emails = delivery.recipient_data?.emails ?? (delivery.email ? [delivery.email] : []);
				const phone = delivery.recipient_data?.phone ?? delivery.phone;
				const result = delivery.channel === 'EMAIL'
          ? delivery.recipient_data?.messages?.length
            ? await (async () => {
              for (const message of delivery.recipient_data!.messages!) {
                const result = await deliverEmail(channelSettings, message.email, message.title, message.body);
                if (result.status !== 'SENT') return result;
              }
              return { status: 'SENT' as const };
            })()
            : emails.length ? await deliverEmail(channelSettings, emails, delivery.title, delivery.body) : { status: 'FAILED' as const, error: 'El usuario no tiene correo.' }
					: await deliverWhatsApp(channelSettings, phone, delivery.title, delivery.body);
				await finishDelivery(pool, delivery, result, retryDelayMs(delivery.attempts));
			}
			} catch (error) {
				const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
				console.error(JSON.stringify({ level: 'warn', service: 'notification-service', event: 'tenant_work_deferred', code: typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'UNKNOWN' }));
			}
		}
	} catch (error) {
		console.error(
			JSON.stringify({
				level: 'error',
				service: 'notification-service',
				event: 'worker_failed',
				error: error instanceof Error ? error.message : String(error),
			}),
		);
	} finally {
		workerBusy = false;
	}
}
const workerTimer = setInterval(() => void processBackgroundWork(), 30_000);
workerTimer.unref();
void processBackgroundWork();
async function consumeEvents(): Promise<void> {
	while (process.env.NATS_URL) {
		try {
			await startDomainEventConsumer(async (event) => {
				const response = await fetch(
					`http://127.0.0.1:${process.env.NOTIFICATION_PORT ?? 4015}/events`,
					{
						method: 'POST',
						headers: {
							'content-type': 'application/json',
							'x-internal-secret':
								process.env.INTERNAL_SERVICE_SECRET ??
								'gestionchurch-internal-development-secret',
							'x-tenant-id': event.tenantId,
						},
						body: JSON.stringify(event),
					},
				);
				if (!response.ok)
					throw new Error(`Notification event rejected: ${response.status}`);
			});
		} catch (error) {
			console.error(
				JSON.stringify({
					level: 'error',
					service: 'notification-service',
					event: 'jetstream_consumer_failed',
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 5_000));
	}
}
void consumeEvents();
