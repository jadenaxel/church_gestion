# Seguridad de archivos

Formatos admitidos: PDF, Office moderno/legado, OpenDocument, TXT, CSV, PNG y JPEG.

Controles actuales:

- tamaño máximo configurable;
- extensión permitida;
- firma binaria básica coherente con la extensión;
- nombre de almacenamiento generado por servidor;
- `basename` en descarga;
- SHA-256;
- detección EICAR y cuarentena;
- consulta y descarga en la base del tenant autenticado;
- `Content-Disposition` y `nosniff`.
- permisos departamentales comprobados en backend y revalidados bajo bloqueo antes de publicar adjuntos;
- protección de actividades aprobadas y visibilidad `LEADERSHIP`, incluyendo listados, descargas y enlaces temporales;
- tipos MIME de Office determinados por el servidor, no por la declaración del cliente;
- prevalidación de ZIP/Office: rutas, metadatos, entradas duplicadas, tamaño expandido y descompresión acotada antes del visor/importador;
- cuota revalidada dentro de una transacción con bloqueo común a adjuntos, documentos y fotografías, evitando excesos por cargas simultáneas;
- descargas y fotografías privadas con `Cache-Control: private, no-store`.

## Biblioteca ministerial departamental

Cada documento está asociado a un departamento y a un tenant físico. Los directores,
asistentes, secretarios, planificadores y colaboradores departamentales pueden cargar
material para sus propios departamentos; el administrador y el secretario del tenant
pueden gestionar la biblioteca completa. La lectura respeta las visibilidades
`DEPARTMENT`, `LEADERSHIP` y `TENANT`.

La carga exige título, tipo, año ministerial, referencia de alineación, visibilidad y
una declaración explícita del responsable. La aplicación no afirma cumplimiento
doctrinal automáticamente: pastor, secretario o administrador registran la revisión
humana como `VERIFIED` o `NEEDS_CHANGES`, con responsable, fecha, fundamento y evento
de auditoría.

El visor integrado presenta PDF e imágenes directamente, convierte DOCX a texto
seguro, XLSX a tablas limitadas y TXT/CSV a contenido escapado. Formatos que no pueden
convertirse con seguridad conservan sus metadatos y requieren una descarga autorizada.
Las vistas HTML aplican una política CSP cerrada, `nosniff` y escape de contenido.

Los documentos se versionan por título y departamento, se filtran y buscan desde la
interfaz, y las eliminaciones son lógicas y auditadas.

Producción debe sustituir el filesystem local por S3/MinIO, analizar con ClamAV, usar URLs firmadas cortas y aplicar políticas de retención/cuarentena.
