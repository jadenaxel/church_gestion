# Validación de la integración GestionChurch ↔ Nombramientos

Fecha de ejecución: 28 de septiembre de 2026  
Entorno validado: Windows, modo nativo local, PostgreSQL 18 en `127.0.0.1:55432`

## Dictamen

La integración funcional local queda **aprobada** para el alcance implementado: acceso único desde GestionChurch, sesión federada, roles, selección de tenant, revalidación continua, navegación de escritorio/móvil, API operativa, persistencia, worker y arranque reproducible.

Esto **no equivale a una certificación de producción enterprise**. La salida productiva continúa condicionada por infraestructura externa, controles operativos y ceremonias administrativas descritas al final de este documento.

## Evidencia funcional

| Control | Resultado |
|---|---|
| Inicio desde el menú de GestionChurch | Aprobado en Chromium escritorio y móvil |
| Retorno desde Nombramientos | Botón visible y localizado; vuelve al dashboard de GestionChurch en escritorio y móvil |
| Sesión resultante | `authMethod=federated`; tenant y permisos vigentes |
| Tenant Admin | Acceso con rol Nombramientos `CHURCH_ADMIN` |
| Secretario | Acceso con rol `COMMITTEE_SECRETARY` |
| Global Admin | Selección explícita y acceso a `Iglesia Adventista Ozama` |
| Usuario sin rol Nombramientos | Rechazado con HTTP 403 |
| Intento cross-tenant de Tenant Admin | Rechazado con HTTP 403 |
| Reutilización del código de lanzamiento | Rechazada con HTTP 401 |
| Login local de Nombramientos | No existe en modo integrado; HTTP 404 |
| Ruta web de login anterior | Redirige con HTTP 307 a GestionChurch |
| Navegación funcional | Dashboard, ciclos, catálogo, miembros, organigrama y reportes respondieron HTTP 200 |
| MFA local de Nombramientos | Deshabilitado en modo integrado; la interfaz ya no lo presenta como requisito |
| PostgreSQL | Migraciones control 29/29 y tenant 39/39; `mismatchCount=0` |
| Worker Nombramientos | `running`, `healthy=true`, `lastErrorCode=null` |
| Reinicio integral | Build, migraciones, sincronización, verificación y health checks aprobados |

## Matriz automatizada ejecutada

- GestionChurch: 34/34 pruebas unitarias, integración y E2E.
- GestionChurch navegador: 34 aprobadas, 11 omisiones gobernadas, 0 fallos; incluye integración federada en escritorio y móvil.
- Nombramientos dominio: 41/41.
- Nombramientos E2EE: 31/31.
- Nombramientos base de datos: 439 aprobadas, 3 omisiones gobernadas, 0 fallos.
- Nombramientos API: 404 aprobadas, 13 omisiones gobernadas, 0 fallos.
- Nombramientos web: 228/228.
- Verificación de entrega Nombramientos: 39/39.
- Typecheck, lint y builds de producción: aprobados en ambos proyectos.

La cobertura permanente del puente vive en `tests/browser/core.spec.ts` y comprueba el intercambio SSO, tenant, método federado, catálogo, configuración E2EE y ausencia del requisito MFA local.

## Condiciones pendientes antes de afirmar “100% enterprise en producción”

1. Inicializar la custodia E2EE de cada tenant real desde Configuración, descargar y custodiar su backup de recuperación y conceder dispositivos autorizados. La bóveda de Central aún no tiene una generación activa y Ozama reporta `setupState=not_started`.
2. Configurar y probar entregas reales de SMTP y WhatsApp/Meta, incluyendo consentimiento, plantillas y webhooks. El entorno local usa adaptadores simulados o degradados.
3. Validar la topología de despliegue elegida con TLS, DNS, gestor de secretos, alta disponibilidad, Redis, NATS, almacenamiento de objetos, antivirus, observabilidad y alertamiento.
4. Ejecutar restauración/DR en infraestructura externa, pruebas de carga del conjunto integrado y pentest independiente.
5. Completar pruebas humanas WCAG en dispositivos y lectores de pantalla físicos.
6. Obtener la revisión denominacional/institucional del contenido y de la operación.
7. Implementar el 2FA global de GestionChurch en la fase futura ya definida. El retiro del MFA local de Nombramientos es correcto y no sustituye ese control futuro.

## Conclusión utilizable

- **Integración local y funcionalidad implementada:** aprobada.
- **Lista para demostración, QA funcional y onboarding controlado:** sí.
- **Certificación absoluta de producción enterprise:** no todavía; depende de los siete controles anteriores y de evidencia obtenida en el entorno productivo real.
