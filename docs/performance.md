# Evidencia de rendimiento

La prueba `pnpm test:performance` ejecuta 80 lecturas reales alternando dashboard y lista paginada, más 25 comandos idempotentes contra el Gateway, los microservicios y PostgreSQL 18.

Resultado local del 26 de septiembre de 2026, Windows, Node.js 24, servicios en modo desarrollo y clúster PostgreSQL aislado:

| Operación | Muestras | p95 | Objetivo |
|---|---:|---:|---:|
| Lecturas comunes | 80 | 8,77 ms | < 300 ms |
| Comandos idempotentes | 25 | 6,90 ms | < 600 ms |

La prueba falla si excede los objetivos. No representa latencia pública, concurrencia sostenida ni análisis antivirus; antes de producción se debe repetir con datos volumétricos, TLS, infraestructura final y una herramienta de carga distribuida.
