'use client';

import { Modal } from '@/components/modal';

import { useCallback, useEffect, useState } from 'react';
import {
	Building2,
	Database,
	LoaderCircle,
	Plus,
	ScrollText,
	Search,
	Settings2,
	Vote,
	X,
} from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Badge, Empty, Notice, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useExperience } from '@/components/experience-provider';

type Tenant = {
	id: string;
	slug: string;
	name: string;
	timezone: string;
	status: string;
	created_at: string;
};
export default function GlobalPage() {
	const { tr } = useExperience();

	const [items, setItems] = useState<Tenant[] | null>(null);
	const [open, setOpen] = useState(false);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [search, setSearch] = useState('');
	const [launchingTenantId, setLaunchingTenantId] = useState('');
	const [form, setForm] = useState({
		slug: '',
		name: '',
		timezone: 'America/La_Paz',
		adminName: '',
		adminEmail: '',
		adminPassword: '',
	});
	const load = useCallback(
		() =>
			api<{ items: Tenant[] }>('/global/tenants')
				.then((r) => setItems(r.items))
				.catch((e) => setError(e.message)),
		[],
	);
	useEffect(() => {
		void load();
	}, [load]);
	async function create(e: React.FormEvent) {
		e.preventDefault();
		if (busy) return;
		setBusy(true);
		setError('');
		try {
			await api('/global/tenants', {
				method: 'POST',
				body: JSON.stringify(form),
			});
			setOpen(false);
			setForm((current) => ({ ...current, adminPassword: '' }));
			await load();
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: 'No fue posible provisionar el tenant.',
			);
		} finally { setBusy(false); }
	}
	async function launchNominations(tenantId: string) {
		setError('');
		setLaunchingTenantId(tenantId);
		try {
			const result = await api<{ launchUrl: string }>(
				'/integrations/nominations/launch',
				{ method: 'POST', body: JSON.stringify({ tenantId }) },
			);
			window.location.assign(result.launchUrl);
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: 'No fue posible abrir Nombramientos.',
			);
			setLaunchingTenantId('');
		}
	}
	const visibleItems = (items ?? []).filter(
		(tenant) =>
			!search.trim() ||
			`${tenant.name} ${tenant.slug} ${tenant.timezone} ${tenant.status}`
				.toLocaleLowerCase('es')
				.includes(search.trim().toLocaleLowerCase('es')),
	);
	return (
		<main className="global-page">
			<header className="global-header">
				<Logo />
				<div>
					<span className="eyebrow">{tr('Administración global')}</span>
					<h1>{tr('Iglesias y tenants')}</h1>
				</div>
				<div className="global-header-actions">
					<Link className="button button-ghost" href="/global/audit">
						<ScrollText size={17} />
						{tr(' Auditoría')}
					</Link>
					<button
						type="button"
						className="button button-primary"
						onClick={() => setOpen(true)}
					>
						<Plus size={17} />
						{tr(' Nueva iglesia')}
					</button>
				</div>
			</header>
			<div className="global-content">
				{error && (
					<Notice tone="danger" title={tr('Atención')}>
						{error}
					</Notice>
				)}
				{items && items.length > 0 && (
					<div className="global-search-bar">
						<label className="premium-search">
							<Search />
							<input
								aria-label={tr('Buscar iglesias y tenants')}
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder={tr('Buscar iglesia, subdominio o zona horaria…')}
							/>
							{search && (
								<button
									type="button"
									onClick={() => setSearch('')}
									aria-label={tr('Limpiar búsqueda de iglesias')}
								>
									<X />
								</button>
							)}
						</label>
						<span>
							{visibleItems.length}
							{tr(' de ')}
							{items.length}
							{tr(' iglesias')}
						</span>
					</div>
				)}
				{!items ? (
					error ? <button type="button" className="button button-secondary" onClick={() => { setError(''); void load(); }}>{tr('Reintentar')}</button> : <Spinner />
				) : items.length === 0 ? (
					<Empty
						icon={<Building2 />}
						title={tr('No hay tenants')}
						text={tr('Provisiona la primera iglesia.')}
					/>
				) : visibleItems.length === 0 ? (
					<Empty
						icon={<Search />}
						title={tr('No encontramos iglesias')}
						text={tr('Prueba con otro nombre, subdominio o zona horaria.')}
					/>
				) : (
					<div className="tenant-grid premium-scroll-list tenant-scroll-list">
						{visibleItems.map((tenant) => (
							<article className="tenant-card" key={tenant.id}>
								<span className="tenant-icon">
									<Building2 />
								</span>
								<div>
									<span className="eyebrow">
										{tenant.slug}
										{tr('.gestionchurch.com')}
									</span>
									<h2>{tenant.name}</h2>
									<p>{tenant.timezone}</p>
								</div>
								<div className="tenant-meta">
									<Badge status={tenant.status} />
									<span>
										<Database size={14} />
										{tr(' Base independiente')}
									</span>
									<Link
										className="button button-secondary"
										href={`/settings/channels?tenantId=${tenant.id}`}
									>
										<Settings2 size={16} />
										{tr(' Canales')}
									</Link>
									<button
										type="button"
										className="button button-secondary"
										disabled={
											launchingTenantId === tenant.id ||
											tenant.status !== 'ACTIVE'
										}
										onClick={() => void launchNominations(tenant.id)}
									>
										{launchingTenantId === tenant.id ? (
											<LoaderCircle className="spin" size={16} />
										) : (
											<Vote size={16} />
										)}
										{tr(' Nombramientos')}
									</button>
								</div>
							</article>
						))}
					</div>
				)}
			</div>
			{open && (
				<Modal
					busy={busy}
					label={tr('Provisionar nueva iglesia')}
					onClose={() => setOpen(false)}
				>
					<form className="modal-card" onSubmit={create}>
						{error && <Notice tone="danger" title={tr('No fue posible completar la acción')}>{error}</Notice>}
						<h2>{tr('Provisionar nueva iglesia')}</h2>
						<p>{tr('Se creará una base PostgreSQL física y aislada.')}</p>
						<label>
							{tr('Nombre de la iglesia')}
							<input
								required
								minLength={3}
								value={form.name}
								onChange={(e) => setForm({ ...form, name: e.target.value })}
							/>
						</label>
						<label>
							{tr('Subdominio')}
							<input
								required
								pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
								value={form.slug}
								onChange={(e) =>
									setForm({ ...form, slug: e.target.value.toLowerCase() })
								}
							/>
						</label>
						<label>
							{tr('Zona horaria')}
							<input
								required
								value={form.timezone}
								onChange={(e) => setForm({ ...form, timezone: e.target.value })}
							/>
						</label>
						<label>
							{tr('Nombre del administrador')}
							<input
								required
								value={form.adminName}
								onChange={(e) =>
									setForm({ ...form, adminName: e.target.value })
								}
							/>
						</label>
						<label>
							{tr('Correo del administrador')}
							<input
								type="email"
								required
								value={form.adminEmail}
								onChange={(e) =>
									setForm({ ...form, adminEmail: e.target.value })
								}
							/>
						</label>
						<label>
							{tr('Contraseña temporal')}
							<input
								type="password"
								required
								minLength={10}
								value={form.adminPassword}
								onChange={(e) =>
									setForm({ ...form, adminPassword: e.target.value })
								}
							/>
						</label>
						<div className="modal-actions">
							<button
								data-dialog-close
								type="button"
								className="button button-ghost"
								onClick={() => setOpen(false)}
							>
								{tr('Cancelar')}
							</button>
							<button type="submit" className="button button-primary" disabled={busy}>
								{busy ? tr('Guardando…') : tr('Provisionar')}
							</button>
						</div>
					</form>
				</Modal>
			)}
		</main>
	);
}
