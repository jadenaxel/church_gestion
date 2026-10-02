# Auditoría de seguridad — GestionChurch y Nombramientos

Fecha local: 30 de septiembre de 2026. Entorno validado: Windows, Node.js 24.19.0, PostgreSQL local aislado y modo nativo. Este informe no contiene contraseñas, tokens ni datos personales del padrón.

## Resultado y alcance

Se corrigieron hallazgos confirmados de autorización, privacidad, sesiones federadas, protección de archivos, exportaciones y endurecimiento de producción. Ambos proyectos compilan; las comprobaciones descritas pasan; los servicios quedaron activos.

La inspección abarcó autenticación y recuperación de contraseña, permisos y pertenencia departamental, aislamiento entre bases, federación con Nombramientos, calendario y revisiones, documentos y fotografías, notificaciones/configuración/webhooks, exportaciones, auditoría, conexiones de base, encabezados HTTP, empaquetado y dependencias directas/transitivas. Se combinaron lectura de código, pruebas unitarias, peticiones reales a las API con fixtures aisladas, verificación de bases y navegación real.

Esto **no certifica ausencia absoluta de vulnerabilidades ni funcionamiento de cada combinación de cada módulo**. No equivale a un pentest del despliegue público ni a una aprobación de salida a producción. Las severidades siguientes son estimaciones de impacto, no puntuaciones CVSS certificadas.

## Hallazgos corregidos

| Hallazgo | Impacto estimado | Corrección / evidencia |
|---|---|---|
| Adjuntos de actividades sin suficiente control de departamento, propietario y estado | Alto: modificación ajena o de programas aprobados | Autorización por membresía real; revalidación transaccional bajo bloqueo de actividad después del análisis antivirus; función de bloqueo con `search_path` fijo y ejecución limitada al servicio de archivos. Pruebas de cargas legítimas, ajenas y posteriores a aprobación. |
| Fotografías del padrón accesibles mediante rutas genéricas a usuarios sin la autorización específica | Alto: exposición de información personal | Se reutiliza la autorización del padrón en descarga y creación de enlaces temporales, además de la ruta de fotografía. No se concede acceso simplemente por ser director de cualquier departamento. |
| Visibilidad «Solo liderazgo» no aplicada de forma consistente en backend | Alto: filtración de actividades privadas | Política común para listados, detalle, dashboard, reportes, exportaciones, adjuntos, avisos y referencias de espacios ministeriales. Liderazgo autorizado y creador conservan acceso. En disponibilidad/conflictos se mantienen las reservas, horarios y prioridad temporal, pero se ocultan datos e identificadores privados. Prueba real de búsqueda, reporte, exportación, descarga y conflicto. |
| Comentarios y menciones de registros ministeriales restringidos sin heredar su privacidad | Alto: lectura lateral por integrantes de consulta | Comentarios y conteos de reportes respetan la visibilidad del registro. Se comprueban permisos del autor y roles/membresías vigentes de cada destinatario antes de guardar una mención. Los nuevos avisos restringidos no replican el contenido confidencial. Pruebas de rechazo sin escritura, acceso autorizado, colaboración normal de equipo y bloqueo entre tenants. |
| Solicitud de revisión sin comprobar la autoridad sobre la actividad | Alto: modificación del flujo de otro departamento | Se comprueba la membresía/rol y el estado de la actividad bajo bloqueo antes de crear la solicitud. Pruebas de rechazo de actividad ajena y aceptación de una propuesta legítima. |
| Sesión de Nombramientos no vinculada de extremo a extremo a la sesión de origen | Alto: persistencia de acceso después de revocación | Código de lanzamiento de un uso enlazado a la sesión GestionChurch; canje, autorización y proyección verifican sesión vigente, usuario y tenant. Nombramientos conserva la vinculación y rechaza sesiones antiguas sin vínculo. Migración aditiva 030 y permiso `UPDATE` de la columna específica, sin ampliar el grant a toda la tabla. Login federado y logout/revocación comprobados en navegador. |
| CSRF con cookie y `Origin` ausente o no confiable | Alto: acciones con sesión ajena | Peticiones inseguras con cookie exigen origen autorizado exacto; se rechazan orígenes ajenos, incluido login. Los clientes internos/bearer sin cookie siguen operativos. Pruebas positivas y negativas. |
| Rate limiting evadible mediante claves de sesión no validadas y fallos de Redis | Medio/alto: fuerza bruta y abuso de recursos | La clave de sesión deriva de JWT validado; las sesiones inválidas quedan en el bucket de IP. Contador local acotado siempre activo, combinado con Redis, sin reinicio de ventana al fallar Redis ni expulsión de buckets activos. Incluye login global y recuperación de contraseña. |
| ZIP/Office confiado al parser y MIME aportado por el cliente | Alto: agotamiento de memoria o contenido activo servido con tipo incorrecto | Validación de estructura, rutas, duplicados y tamaños; descompresión acotada para detectar tamaños falsificados; tipos Office canónicos. Cubre documentos y XLSX del padrón. Pruebas de archivo legítimo, archivo falso, traversal, tamaños mentirosos y MIME HTML falsificado. |
| Cuota comprobada fuera de la publicación transaccional | Medio: exceso de almacenamiento con cargas simultáneas | Se revalida la cuota con bloqueo transaccional por base antes de publicar un adjunto, documento o foto. Prueba concurrente: una carga aceptada, otra rechazada y uso total dentro de cuota. |
| Fórmulas en CSV e inyección de saltos de línea ICS | Medio: contenido activo en herramientas de oficina / eventos inyectados | Neutralización de fórmulas incluso con prefijos blancos o de control; escape consistente de CR, LF y CRLF en textos de calendario. Aplicado a exportaciones del calendario, reportes, auditoría y operaciones departamentales. |
| SMTP configurable con acceso a redes internas y transporte débil en producción | Alto condicionado a acceso administrativo | Resolución y clasificación de IP IPv4/IPv6, bloqueo de direcciones privadas/reservadas, excepción únicamente por allowlist de despliegue, dirección resuelta fijada para la conexión y SNI del host original. TLS directo o STARTTLS obligatorio y validación de certificado. Fallos devueltos de manera controlada. Pruebas de direcciones y allowlist; no se envió correo a terceros. |
| Secretos/documentación local susceptibles de llegar al artefacto de despliegue | Alto si se publicaba ese artefacto | Exclusión de `.env`, directorios locales, evidencias y salidas con credenciales en `.dockerignore`; protección correspondiente en `.gitignore`. El archivo local de distribución de credenciales solicitado anteriormente se conserva, pero no debe incluirse en imágenes ni distribuirse públicamente. |
| Secretos y contraseñas públicas de demostración utilizables en producción | Alto condicionado al despliegue | Inicio productivo rechaza secretos cortos, placeholders/de desarrollo y reutilización entre fines. Las contraseñas de demostración documentadas no autentican ni se aceptan como nueva contraseña en producción. El seed de demostración se bloquea en producción. No se rotaron credenciales reales de las iglesias. |
| Pools de runtime con login administrativo en un despliegue productivo | Alto: capacidad de saltar restricciones de rol ante compromiso del servicio | Guardas de producción verifican el login real y TLS en PostgreSQL; rechazan `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `BYPASSRLS`, falta de cifrado y membresía en otros roles de servicio. El entorno de desarrollo se conserva. Pruebas unitarias y rechazo real del login administrativo de fixtures; la configuración positiva debe validarse con los logins y certificados del despliegue real. |
| Errores ociosos de PostgreSQL no manejados | Medio: caída de servicios ante desconexiones | Manejo de errores de pool con registro limitado a tipo de pool/SQLSTATE; no se vuelcan objetos de conexión. Rollback fallido descarta la conexión sin ocultar el error original. Las API siguen activas después de cerrar las bases temporales de pruebas. |
| Dependencias con avisos de seguridad | Según cada aviso y función usada | Versiones y overrides corregidos en ambos lockfiles; auditoría completa, incluidas dependencias de desarrollo, sin avisos conocidos al cierre. No se afirma que todas las funciones vulnerables fueran explotables en esta aplicación. |

Se añadieron encabezados defensivos al frontend sin introducir una CSP de scripts incompatible con Next.js. No se modificó el diseño ni se habilitó MFA, que permanece diferido por la decisión previa del proyecto.

## Evidencia automatizada y manual

Conteos de la última ejecución relevante de cada suite, sin sumar repeticiones:

| Comprobación | Resultado |
|---|---|
| GestionChurch: pruebas unitarias | 87 aprobadas |
| GestionChurch: integración de seguridad HTTP y aislamiento físico | 16 aprobadas; tres bases temporales en conjunto, no datos reales de iglesia |
| Nombramientos: API | 412 aprobadas, 13 omitidas por condiciones de sus pruebas |
| Nombramientos: base de datos, selección sin suites live | 335 aprobadas, 1 omitida; suites live/integration no incluidas en este conteo |
| Nombramientos: pruebas unitarias web | 236 aprobadas |
| Nombramientos: dominio | 41 aprobadas |
| Nombramientos: E2EE | 31 aprobadas |
| Nombramientos: verificación y scanner | 39 aprobadas |
| Total de la selección anterior | 1.197 aprobadas; 14 omitidas, además de suites no seleccionadas |
| Typecheck/lint | Aprobados en ambos proyectos |
| Compilaciones | GestionChurch y Nombramientos aprobadas |
| OpenAPI | Documento válido, 147 rutas |
| `pnpm audit --json` GestionChurch | 0 avisos, 700 dependencias totales informadas |
| `pnpm audit --json` Nombramientos | 0 avisos, 933 dependencias totales informadas |
| Scanner de secretos Nombramientos | 716 archivos, sin hallazgos de alta confianza |
| Verificador de estado Nombramientos | Solo lectura, `pass=true`, `mismatchCount=0`, migraciones y grants consistentes |
| Compose local | YAML válido y todos sus puertos publicados ligados a loopback; Docker no disponible para ejecutar contenedores |
| Navegador real | GestionChurch → Nombramientos, permisos cargados sin errores de consola, retorno; tras logout en GestionChurch, el acceso anterior a Nombramientos volvió al login |
| Estado final local | Web 3000, gateway 4000, Nombramientos 3300/API 4100 y PostgreSQL 55432 activos |

Las pruebas de seguridad son reproducibles en `tests/unit/security.test.ts`, `tests/unit/department-authorization.test.ts`, `tests/integration/security-api.test.ts`, `tests/integration/tenant-isolation.test.ts` y `apps/api/test/gestionchurch-session-security.test.ts` del repositorio Nombramientos. No todas las 1.197 pruebas son de seguridad: varias son regresiones funcionales existentes.

El scanner de Nombramientos ejecutado sobre GestionChurch produjo candidatos que se revisaron: ejemplos y credenciales públicas de entorno local/CI, contactos públicos de paquetes, números binarios en PDF, rutas locales y el artefacto de credenciales mencionado arriba. No se presenta ese barrido como «cero secretos» ni se reproducen los valores encontrados. El SBOM de GestionChurch se regeneró en `docs/sbom.cdx.json`.

Las bases/directorios temporales creados por esta auditoría se eliminaron bajo comprobación de propiedad y ruta. Son datos sintéticos de prueba; no se eliminaron usuarios, cargos, documentos ni actividades de Ozama. Las migraciones de seguridad son aditivas. Se cerró únicamente la sesión de navegador utilizada para pruebas. Una sesión federada anterior sin la nueva vinculación debe abrir de nuevo Nombramientos desde GestionChurch.

La comprobación final de solo lectura encontró cero tenants `security-*` remanentes y cero avisos históricos coincidentes con comentarios de registros restringidos en Central y Ozama. También encontró una base con prefijo `gc_tenant_` vacía, sin tablas de aplicación y sin entrada en el registro: no es enrutable mediante las API de tenant. Se conservó porque no se pudo acreditar su propiedad; su eliminación requiere una revisión administrativa explícita, no una limpieza indiscriminada.

## Reproducción segura

Desde GestionChurch, con los servicios locales activos:

```powershell
pnpm typecheck
pnpm lint
pnpm exec vitest run tests/unit
$env:RUN_SECURITY_API_TESTS='1'
pnpm exec vitest run tests/integration/security-api.test.ts tests/integration/tenant-isolation.test.ts
pnpm audit --json
pnpm validate:openapi
.\start-gestionchurch.ps1 -Action Status
```

La selección HTTP es opt-in y usa sus propias bases. No ejecutar suites genéricas de escritura contra bases reales sin revisar sus condiciones y fixtures.

## Condiciones antes de producción y límites de la revisión

1. **No publicar el stack de desarrollo.** `docker-compose.yml` y el arranque nativo local son de desarrollo, aunque compilen frontends optimizados. Debe existir un despliegue productivo con secretos reales y `NODE_ENV=production`; no se debe cambiar a `development` para evadir las guardas.
2. Configurar HTTPS/certificados para el dominio público, TLS de PostgreSQL con verificación de CA/hostname, firewall y redes privadas. Proveer logins de runtime por servicio y permisos mínimos por base; reservar credenciales administrativas para migración/provisionamiento controlado. Para contener un compromiso con ejecución arbitraria, completar segmentación y credenciales por tenant conforme al modelo de despliegue. La revisión de la aplicación no configura automáticamente la infraestructura pública.
3. Crear/custodiar secretos separados y rotarlos de forma planificada. Bloquear o retirar cuentas/tenants de demostración de la instalación pública. No subir el archivo local de distribución de contraseñas; considerar credenciales temporales individuales y cambio obligatorio al primer acceso como etapa de endurecimiento.
4. Activar ClamAV operativo en producción y almacenamiento privado S3/MinIO con retención y permisos. La validación ZIP y de firma no es análisis antivirus ni CDR completo, y no garantiza la inocuidad de todo archivo Office/PDF/imagen.
5. Validar SMTP/Meta con credenciales reales, consentimiento, firma del webhook y entrega efectiva. En esta auditoría no se enviaron mensajes a personas ni se certificó la infraestructura de proveedores.
6. Ejecutar restauración de backups, pruebas de carga/agotamiento, observabilidad y alertas de seguridad, rotación/revocación y pentest externo en staging. No se realizó una campaña exhaustiva de fuzzing, cada ruta/rol ni todas las combinaciones de navegador, idioma y dispositivo.
7. MFA permanece deshabilitado por alcance de la primera etapa. Es riesgo residual conocido, especialmente en administración; no se presenta como ya implementado. Evaluar su siguiente etapa antes de abrir acceso administrativo a Internet.
8. La CSP del frontend mantiene compatibilidad; no es todavía una política estricta de scripts con nonces. Mantener la prohibición de contenido HTML no confiable y ampliar la política cuando se añadan scripts externos.

Estas condiciones deben formar parte de la aprobación de salida. «Cero avisos de dependencias» significa ausencia de avisos conocidos en la consulta realizada, no ausencia de vulnerabilidades desconocidas ni garantía del servicio completo.

## Referencias de avisos corregidos

Se consultaron avisos primarios para verificar el alcance y las versiones corregidas: [Next.js / ImageResponse SVG](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [Vitest / mock path](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), [Nodemailer / caché TLS](https://github.com/advisories/GHSA-6vj9-mwq6-2f5v). El inventario completo de dependencias está en el SBOM/lockfiles; el alcance de cada aviso depende del uso real de su función.
