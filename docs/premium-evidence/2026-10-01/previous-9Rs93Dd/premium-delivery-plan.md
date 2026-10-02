# Consolidación premium: plan de ejecución

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

Build local actual: `9Rs93DdT6H9Go53CnWtsV`; arranque nativo con `-SkipDataSetup -NoBuild`, sin demos/sincronización general. Typecheck, builds, lint final de 256 archivos, OpenAPI de 151 rutas y auditoría productiva pasan. Regresión actual: UNIT352, HTTP69+90, DB36 y navegador19 (16 GC+3 Nom), sin fallos/omitidas en esos conjuntos. Se corrigió también una desconexión de cliente PostgreSQL prestado que podía detener notificaciones y el stack; pruebas reales verifican rechazo sin falso COMMIT y conexión nueva sana. Reportes regenerados: 12 páginas inspeccionadas visualmente. Los resultados y límites están en el informe, sin convertir conteos en un porcentaje de cobertura.

DDL acotada aplicada a las dos bases originales: 10 columnas nullable + índice de fiabilidad, una tabla + índice de outbox departamental, y grants mínimos del nuevo rol NOLOGIN de tenancy. No hubo backfill, cambio de cargos/credenciales ni mensajes de QA a miembros reales. Nombramientos conserva las migraciones aditivas ya registradas y sus datos cifrados; no se sincronizaron todas las iglesias para validar el navegador.

Permanecen gates explícitos: D10 dispositivo/sesión; configuración y prueba productiva de credenciales/redes/proveedores; recuperación coordinada; reconciliación completa de todos los comandos y fallos de commit entre bases; revisión humana/física/independiente. Las 36 filas siguen exigibles. La respuesta D07 autoriza coordinar el piloto **después** de las correcciones, no inventar su aprobación. Servicios locales UP al cierre; una base no registrada de propiedad desconocida se preservó y el checker de metadata mantiene FAIL, distinto de su `servicesReady:true`. No se declara 100% ni autorización productiva.
