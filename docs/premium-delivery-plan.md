# Consolidación premium: plan de ejecución

> Actualización2oct: D10 fue autorizado, implementado y verificado localmente con navegador4/4, API/criptografía y cleanup read-only29recibos/0residuos. La evidencia separada y sus límites están en [el informe D10](premium-device-sessions-2026-10-02.md). Las referencias a D10 pendiente en el corte histórico inferior describen el estado anterior. Los demás requisitos, validaciones externas y gates de producción siguen exigibles; metadatafalse por una DB de propietario desconocido no se normaliza.

Inicio: 1 de octubre de 2026, America/La_Paz. Orden: ejecutar `prompt-ultra-premium-end-to-end.md`. Estado inicial: en ejecución, no aprobado para producción.

## Alcance y protección

GestionChurch y Nombramientos existentes, mismas capacidades, botones, contratos compatibles y autoridad. No rediseño de marca, no MFA nuevo, no ampliación de permisos reales, no publicación. Central/Ozama y cambios preexistentes se preservan. Nombramientos tiene cambios previos no atribuibles a esta ejecución.

Las auditorías de septiembre/octubre son antecedentes, no resultados de esta corrida. R01–R36 se mantienen obligatorios; no se reduce la matriz para declarar un porcentaje. La evidencia se recoge en `premium-evidence/2026-10-01/` y en el informe de entrega.

## Inventario inicial derivado de código

GestionChurch tiene 27 archivos de página: raíz; login/recuperación/reset; administración global/login/auditoría; dashboard; calendario; nueva actividad/detalle/edición; revisión; notificaciones; equipo; reportes; auditoría; documentos; hub ministerial; Ancianos; Ministerios Personales; Mujer; departamentos; padrón; diseñador de formulario; canales. El hub publica workspaces dinámicos por membresía/cargo y capacidades; su número depende del tenant, no del número de páginas. Se observaron 268 etiquetas de botón en páginas; los loops/componentes compartidos generan acciones adicionales. Este conteo no es cobertura de pruebas.

Servicios: gateway, identidad, tenancy, calendario, archivos, notificaciones, reportes, ancianos, ministerios personales, mujer y operaciones departamentales. Nombramientos: Web, API y worker; 13 áreas de navegación más rutas auxiliares encontradas por inventario. Cada inventario de acciones incluye formulario, estado, API, permiso y persistencia; una navegación no acredita una mutación.

## Línea base observada

- Existe `MutationObserver` como parte principal de traducción en GestionChurch; la traducción declarativa integral no está demostrada.
- No se encontró protección general de cambios sin guardar al navegar/cerrar/recargar.
- Dashboard no distingue todos los fallos de carga secundaria y usa lenguaje probabilístico para un score heurístico.
- Suites históricas de navegador/E2E usan Central; no ejecutarlas antes de reemplazar fixtures.
- Arranque oficial prepara migración/seed/sincronización: revisar efectos antes de reiniciar.
- Servicios locales, builds, pruebas y capturas actuales se comprobarán de nuevo; no reutilizar conteos históricos.

## Secuencia y responsabilidad

1. Root: lectura completa, autorización, matriz y fixtures; comprobar salud sin escribir en iglesias.
2. Frontend GestionChurch: inventario de acciones/idiomas; dashboard por permisos; estados, traducción, recuperación y responsive; pruebas de comportamiento.
3. Backend: inventario por dominio, persistencia/seguridad, forecast explicable y tests aislados. No cambiar gobernanza.
4. Nombramientos: inventario y flujo guiado, sesión de origen/revocación y recuperación E2EE; pruebas seguras en bases propias.
5. Root: harness de navegador aislado, baseline y regresiones visuales/API, operación y restore; integrar cambios sin solapamiento de archivos.
6. Ejecutar typecheck/lint/build/contratos/auditoría y recorridos finales sobre artefactos actuales.
7. Recoger pruebas humanas/físicas/productivas disponibles; registrar dependencias reales sin inventar aceptación.
8. Entregar matriz actualizada, notas por rol, riesgos, evidencia y estado de cierre; limpiar solo fixtures con propiedad acreditada.

## Decisiones no inferidas

MFA, nuevos aprobadores, privilegios globales, credenciales/infraestructura reales, envío a miembros y publicación permanecen fuera de autorización automática. Ver `premium-authorization-decisions.md`. Implementación local y aceptación productiva son estados separados.

## Criterio de cierre

Cada requisito aplicable tiene ejecución positiva/negativa, evidencia final y datos preservados. Fallos corregibles se corrigen. Credenciales faltantes, dispositivos físicos, validadores humanos y pentest no se reemplazan por mocks ni capturas. Hasta cerrar estos requisitos no se declara 100% global.

## Ejecución técnica actual

El baseline anterior es histórico y no describe el estado final. Se sustituyó la traducción DOM por localización declarativa, se agregaron protección de borradores/recuperación de sesión en memoria, errores honestos, evidencia del pronóstico y puntualidad, presupuestos separados por moneda, idempotencia de actividades/archivos/pagos, privacidad efectiva de registros y transacciones de dominio con auditoría.

Los avisos de operaciones departamentales ahora entran en una outbox del propio dominio después del commit, con leases/fencing y recuperación administrativa. La UI distingue Calendario/Departamentos y errores independientes. Las asignaciones operativas explícitas de Nombramientos tienen GestionChurch como fuente central conforme a D11, sin otorgarlas automáticamente a administradores.

Build local actual: `m3K6tJtdsnu8HBjapaS00`; arranque nativo con `-SkipDataSetup -NoBuild`, sin demos/sincronización general. Typecheck, builds, lint posterior de305 archivos, OpenAPI de153 rutas y auditoría productiva pasan; el count de lint no es módulos ni cobertura. Regresión actual: UNIT395/57 archivos, HTTP69+103, DB66/9 archivos y navegador21 (18 GC+3 Nom), sin fallos/omitidas/flaky en esos conjuntos. El corte anterior9Rs/352/159HTTP/36DB/19browser se archivó por separado, no se suma. Se corrigió también una desconexión de cliente PostgreSQL prestado que podía detener notificaciones y el stack; pruebas reales verifican rechazo sin falso COMMIT y conexión nueva sana. Cuatro PDF exportados04:15–04:16UTC:12 páginas nuevamente inspeccionadas visualmente, no hashes/renders reutilizados. Los resultados y límites están en el informe, sin convertir conteos en un porcentaje de cobertura.

La continuación implementó guardado explícito de un formulario completo válido DRAFT sin envío/reserva; retry con misma clave/File ante ACK incierto y reapertura de lo ya confirmado. PATCH parcial no aplica defaults de creación ni borra información omitida; edición personalizada conserva snapshot histórico y niega cambios de campos ocultos/retirados. Formularios incompletos/operaciones inciertas tras cerrar la pestaña siguen pendientes R29.

Reset-password ahora registra token/auditoría/intención cifrada en la misma TX; worker recuperable con leases y cola metadata-only de Identidad. Configuración tenant tiene intención durable, versiones/receipts, worker y éxito200 solo confirmado: 12 DB y3 HTTP incluidos en los totales anteriores. No transacción distribuida, entrega externa ni UX completa de conflictos.

DDL acotada aplicada a las dos bases originales:10 columnas nullable + índice de fiabilidad, tabla/índice outbox departamental, grants mínimos del rol NOLOGIN tenancy y tabla/índice outbox Identidad. En control se añadió tabla/dos índices de conciliación. Las últimas dos adiciones se verificaron03:59:40UTC; cero grants nuevos, DML de negocio, backfill, cambio de cargos/credenciales o mensajes QA. Nombramientos conserva las migraciones aditivas registradas y datos cifrados; no se sincronizaron todas las iglesias para validar el navegador.

Permanecen gates explícitos: D10 dispositivo/sesión; configuración y prueba productiva de credenciales/redes/proveedores; recuperación coordinada; reconciliación completa de todos los comandos, storage prolongadamente caído y UX operativa de conflictos; revisión humana/física/independiente. Las36 filas siguen exigibles. D07 autoriza coordinar el piloto **después** de correcciones, no inventar aprobación. Snapshot04:21:49UTC/Status00:21:54-04serviciosUP; una base no registrada de propiedad desconocida se preservó y metadata mantiene FAIL, distinto de `servicesReady:true`. Smoke final80lecturas/25replaysloopback1: p9510,06/12,85ms, no SLO. No se declara100% ni autorización productiva.
