# Proveedores de notificación

## In-app

Fuente de verdad de la etapa 1. Cada evento crea una notificación idempotente y entregas por canal.

## Correo

El administrador del tenant configura el proveedor desde **Configuración → Canales**. La pantalla admite host, puerto, SSL/TLS, STARTTLS, usuario, contraseña o API key y remitente. La validación usa una conexión SMTP real y comprueba DNS, negociación TLS y autenticación antes de habilitar la prueba de entrega. La segunda prueba envía un mensaje MIME real y conserva ambos resultados por separado. En local puede usarse Mailpit. Un fallo SMTP se registra como `FAILED`; nunca se marca como enviado. La suite de contrato levanta un servidor SMTP local, verifica la conexión, recibe un mensaje MIME real y comprueba la deduplicación del evento.

Las variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM` son únicamente valores iniciales para tenants que todavía no han guardado su configuración en la interfaz.

## WhatsApp

El modo predeterminado local es `WHATSAPP_MODE=simulated`, presentado en la interfaz como canal desactivado: no genera una entrega externa ni se presenta como éxito. Desde **Configuración → Canales**, el administrador puede activar Producción real, registrar Phone Number ID, tokens, App Secret, plantilla, idioma y versión de Graph API. Antes de enviar, GestionChurch consulta directamente Meta Graph API y valida la identidad del número empresarial. La aplicación genera una URL de webhook específica para el tenant y permite una entrega real controlada a un número E.164.

El adaptador de Meta Cloud API está implementado. Para modo real deben configurarse:

- `WHATSAPP_PHONE_NUMBER_ID`;
- `WHATSAPP_ACCESS_TOKEN` desde secret manager;
- `WHATSAPP_VERIFY_TOKEN`;
- `WHATSAPP_TEMPLATE_NAME` y `WHATSAPP_TEMPLATE_LANGUAGE` para una plantilla aprobada, o una conversación abierta para mensajes de texto;
- validación de firma de webhook;
- `PUBLIC_API_URL` con una URL HTTPS pública, no loopback ni red privada;
- consentimiento y teléfonos E.164 en el perfil de cada usuario.

La respuesta inicial de Meta se registra como `SENT` o `FAILED`, con el identificador del proveedor y el error. Los webhooks HMAC válidos actualizan estados `SENT`, `DELIVERED`, `READ` o `FAILED`. Las entregas que agotan cinco intentos aparecen en la cola de atención administrativa y admiten reintento auditado. La entrega real continúa dependiendo de credenciales, número, plantillas aprobadas y configuración del webhook de Meta.

## Seguridad y acceso

- solo `TENANT_ADMIN` puede consultar, guardar o probar la configuración de su iglesia;
- `GLOBAL_ADMIN` puede hacerlo únicamente después de seleccionar un tenant;
- la API aplica la autorización aunque se invoque directamente;
- contraseñas y tokens se cifran con AES-256-GCM antes de persistirse y nunca se devuelven al navegador;
- configure `CONFIG_ENCRYPTION_KEY` en el secret manager del entorno de producción y manténgala estable durante respaldos y restauraciones;
- `notification-service` rechaza el arranque de producción si `CONFIG_ENCRYPTION_KEY` no existe o tiene menos de 32 caracteres;
- la activación de WhatsApp real se rechaza hasta que el webhook use HTTPS público y existan todas las credenciales;
- cada cambio y cada prueba quedan registrados en la auditoría del tenant, sin incluir el valor de los secretos.
