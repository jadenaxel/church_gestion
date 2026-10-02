# Espacios de trabajo departamentales

## Propósito y límites de gobierno

GestionChurch ofrece un espacio operativo para cada departamento sin convertir el
software en autoridad eclesiástica. La plataforma prepara información, coordina el
trabajo y conserva evidencia; no sustituye la junta de iglesia, la reunión
administrativa, la autoridad pastoral ni los procesos definidos por la iglesia local.

La implementación toma como referencia operativa el **Manual de Iglesia Adventista
del Séptimo Día 2025, 21.ª edición**, publicado por la Asociación General. La matriz
final de permisos, cargos, aprobaciones y retención debe ser validada por la autoridad
eclesiástica de cada organización antes de una salida productiva. Fuente oficial:
<https://gc.adventist.org/wp-content/uploads/2025/10/Seventh-day_Adventist_Church_Manual-2025-10-13.pdf>.

## Arquitectura por dominios

El servicio `department-operations-service` es un microservicio desplegable e
independiente. Es propietario de la lógica operativa transversal de los departamentos,
pero reutiliza servicios compartidos para evitar copias inconsistentes de identidad,
calendario, documentos y notificaciones.

| Dominio | Propietario | Responsabilidad |
|---|---|---|
| Identidad y acceso | Identity | Usuarios, sesiones, roles y cargos múltiples |
| Tenancy | Tenant | Registro de tenants y conexión a su base física aislada |
| Operaciones departamentales | Department Operations | Planes, objetivos, iniciativas, tareas, presupuestos, reuniones, acuerdos, comentarios, KPI y registros específicos |
| Calendario | Calendar | Reservas, disponibilidad, conflictos, revisión y coexistencia aprobada |
| Documentos | File | Versiones, permisos, visor, integridad y trazabilidad |
| Notificaciones | Notification | In-app, correo, WhatsApp, consentimiento y estados de entrega |
| Reportes | Reports + Department Operations | Analítica general y reportes ejecutivos por departamento |
| Auditoría | Esquema compartido de auditoría por tenant | Registro inmutable de cada mutación y exportación relevante |
| Ministerios especializados | Elders, Personal Ministries, Women's Ministry | Flujos propios que exceden el modelo transversal |

El API Gateway es la única entrada del navegador. Propaga identidad firmada,
correlation ID y el contexto de tenant; ningún cliente selecciona una base de datos.

## Aislamiento multi-tenant

Cada tenant posee una base PostgreSQL física. El `tenantId` de la sesión autenticada
se resuelve en el registro de control y el servidor obtiene el pool correspondiente.
La aplicación nunca acepta un nombre de base, esquema o cadena de conexión enviado
por el navegador. Todas las relaciones, búsquedas, reportes, documentos y eventos se
ejecutan dentro de la base resuelta para esa sesión.

Las pruebas de integración comprueban que un usuario no puede consultar ni mutar
recursos de otro tenant. Los identificadores opacos no conceden acceso por sí solos.

## Modelo operativo

Cada departamento obtiene automáticamente un `workspace` conectado con su registro
de identidad. El espacio contiene:

- plan anual, objetivos medibles, responsables y progreso;
- programas, campañas e iniciativas conectables al calendario central;
- presupuesto planificado, comprometido, gastado y disponible;
- tablero de tareas, responsables, prioridad y vencimientos;
- reuniones, participantes, agenda, minutas y seguimiento;
- acuerdos formales con autoridad, aprobador, fecha, fundamento, versión y evidencia;
- documentos departamentales versionados y visibles en el visor seguro;
- equipo construido desde los cargos y membresías reales del tenant;
- comentarios, menciones y avisos por los canales configurados;
- KPI, reportes PDF/CSV y pronóstico basado en actividad reciente;
- bitácora de auditoría asociada al actor, recurso, acción y correlation ID.

Los registros específicos se implementan como capacidades tipadas, no como texto sin
estructura. Los paquetes actuales cubren Escuela Sabática, Música y Adoración,
Diaconado, Infantil/Jóvenes, Familia, Comunicación, Salud y
Tesorería/Mayordomía. Los departamentos restantes usan el paquete general y pueden
recibir nuevas capacidades sin duplicar la infraestructura compartida.

## Autorización basada en cargo y departamento

Los roles globales definen el techo de autoridad; la membresía y los cargos del
departamento determinan el alcance real.

- `TENANT_ADMIN` y `BOARD_SECRETARY`: administración operativa y aprobaciones dentro
  de su tenant.
- `PASTOR`: lectura transversal y aprobación conforme a su autoridad configurada.
- Director/a y cargos de dirección: administración del espacio de su departamento.
- Secretario/a, asistente y planificador/a departamental: colaboración según el
  cargo asignado.
- Integrantes: lectura y colaboración limitada al departamento al que pertenecen.

Una persona puede tener varios cargos y, por tanto, varios alcances simultáneos. La
autorización se recalcula en el servidor en cada petición; esconder un control en la
interfaz nunca se considera una defensa suficiente.

## Gobierno, privacidad y evidencia

Los acuerdos relevantes conservan `authorityType`, aprobador, fecha de decisión,
fecha efectiva, fundamento, versión y referencia de evidencia. Las aprobaciones no
reescriben el historial: cada cambio produce un evento de auditoría.

Los registros de menores, familia, salud, cuidado y finanzas se marcan como
restringidos. Los perfiles sin facultad administrativa reciben únicamente registros
de visibilidad de equipo. Salud se limita a iniciativas de bienestar y no almacena
historias clínicas ni diagnósticos.

Tesorería y Mayordomía aplican una capa reforzada de trazabilidad. La operación
productiva debe complementar esta base con la segregación de funciones y límites de
aprobación definidos por la organización correspondiente.

## Flujo de usuario

1. El usuario abre **Espacios de trabajo** y solo ve departamentos autorizados.
2. Selecciona el departamento; la interfaz carga su capacidad específica, equipo y
   estado anual en una sola vista.
3. Registra un plan o programa mediante formularios breves y contextualizados.
4. Si requiere fecha pública, continúa al calendario con el departamento ya
   seleccionado y se ejecuta el motor central de conflictos.
5. Las asignaciones, menciones y reuniones generan notificaciones reales según las
   preferencias y credenciales configuradas por el tenant.
6. Los acuerdos se formalizan con autoridad y evidencia; el sistema conserva el
   historial auditable.
7. Administración exporta el informe ejecutivo PDF o CSV del departamento.

La interfaz es mobile-first, navegable por teclado, compatible con modo de alto
contraste y preferencias de movimiento reducido. Los textos nuevos están disponibles
en español, inglés y francés mediante el proveedor global de idioma.

## Contratos e integración

El contrato público documenta rutas de contexto, planes, objetivos, iniciativas,
asignaciones, presupuesto, tareas, reuniones, decisiones, comentarios, KPI,
registros específicos y exportaciones. Los endpoints se publican a través de
`/api/v1/department-operations/*` y se validan junto al documento OpenAPI.

Las integraciones externas no se simulan como entregas reales. Correo usa SMTP y
WhatsApp usa Meta Cloud API cuando el administrador configura credenciales válidas,
consentimiento y una URL pública HTTPS. En desarrollo, los adaptadores degradados se
identifican explícitamente.

## Extensión de nuevos departamentos

Para agregar una capacidad específica se define un paquete con su tipo, campos,
privacidad, iconografía, guía operativa y reglas de autorización. El nuevo paquete
reutiliza planes, calendario, presupuesto, tareas, reuniones, documentos,
notificaciones, reportes y auditoría existentes. Solo se crea otro microservicio
cuando el dominio posee invariantes y ciclo de vida propios, no por diferencias
visuales.

## Evidencia de validación

La entrega se verifica mediante análisis estático, TypeScript estricto, build de
producción, validación OpenAPI, pruebas unitarias y E2E. El recorrido E2E departamental
cubre creación y aprobación de planes, objetivos, programas, asignaciones,
presupuesto, tareas, reuniones, actas, acuerdos, menciones, KPI, registros específicos,
PDF, CSV y auditoría. La suite transversal también valida aislamiento entre bases de
tenants, calendario, archivos, notificaciones, módulos especializados y
backup/restauración.

