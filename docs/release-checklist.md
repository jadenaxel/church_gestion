# Lista de salida

Los resultados del 26 de septiembre indicados abajo son históricos. Consulte la [auditoría del 30 de septiembre de 2026](security-audit-2026-09-30.md) para las verificaciones actuales y los requisitos pendientes de producción; las marcas de ejecución local no son una aprobación de salida pública.

## Calidad automatizada

- [x] `pnpm db:migrate` y `pnpm db:seed`
- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm validate:openapi`
- [x] `pnpm test`
- [x] `pnpm test:browser`
- [x] `pnpm test:performance`
- [x] `pnpm build`
- [x] `pnpm audit --prod`
- [x] `pnpm generate:sbom`
- [ ] `docker compose up --build` en un host con Docker

Última ejecución local: 26 de septiembre de 2026. Resultado: 25/25 pruebas Vitest, 6/6 Playwright, OpenAPI 47 rutas, Compose 15 servicios validado sintácticamente, build productivo correcto y cero vulnerabilidades conocidas en dependencias de producción. El arranque de contenedores permanece sin marcar porque esta estación no tiene Docker instalado.

## Operación y seguridad

- [ ] Reemplazar secretos de demostración y bloquear cuentas seed en producción.
- [ ] Configurar TLS, dominio `gestionchurch.com`, wildcard y redirección HTTPS.
- [ ] Configurar SMTP y comprobar entrega/retorno.
- [ ] Configurar Meta, plantillas aprobadas, firma de webhook y consentimiento.
- [ ] Configurar almacenamiento/retención de backups cifrados y ejecutar restauración.
- [ ] Revisar paneles de métricas, trazas y alertas sin etiquetas de tenant/persona.
- [ ] Validar Advent Sans, símbolo y línea gráfica con autorización institucional.
- [ ] Obtener revisión del Manual de Iglesia por la autoridad eclesiástica correspondiente.

## Aprobación

Registrar versión, hash del SBOM, responsable técnico, responsable de privacidad, evidencia de restauración, fecha de revisión denominacional y decisión de salida. MFA permanece planificado para la siguiente etapa y no debe presentarse como activo.
