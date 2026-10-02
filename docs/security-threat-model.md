# Modelo de amenazas resumido

| Amenaza | Control actual | Trabajo adicional de producción |
|---|---|---|
| Confusión de tenant/IDOR | JWT firmado + base física por tenant + roles PostgreSQL por servicio | Tests cruzados exhaustivos y dominio verificado |
| Robo de sesión | Cookie HttpOnly/SameSite, expiración, CSRF por origen y revocación | TLS, rotación refresh, detección de anomalías |
| Fuerza bruta | Argon2id, bloqueo temporal y rate limiting Redis/local | Lista de contraseñas comprometidas |
| Carrera de reserva | Advisory locks + revalidación transaccional | Métricas de lock/deadlock y stress test |
| Elevación de rol | Permisos granulares en backend | Flujo de aprobación para roles críticos |
| Archivo malicioso | Extensión + firma + hash + ClamAV, cuarentena, MinIO/S3 | CDR opcional para documentos complejos |
| Webhook falso | Firma HMAC de Meta y almacenamiento idempotente | Rotación periódica del secreto |
| Mensaje duplicado | Outbox + inbox/event UUID + NATS `msgID` + reintentos y DLQ visible | Doble control para reproceso masivo |
| Backup sustraído | AES-256-GCM, PBKDF2 con sal y frase fuera del manifiesto | Custodia/rotación en KMS y retención inmutable |
| XSS/CSRF | React escaping, Helmet, SameSite y verificación Origin | CSP con nonces si se agregan scripts externos |
| Fuga por logs | Mensajes estructurados mínimos | Redacción central y revisión de observabilidad |

MFA no está habilitado en esta etapa. La fase siguiente debe incorporar passkeys/WebAuthn y TOTP sin exponer controles incompletos.
