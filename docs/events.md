# Eventos

Calendar escribe el evento y la mutación de dominio en una misma transacción dentro de `calendar.outbox_events`. Un despachador reintenta eventos no entregados y Notification deduplica por UUID.

Eventos implementados:

- `activity.submitted`
- `reservation.provisional_created`
- `activity.conflict_detected`
- `activity.alternative_available`
- `activity.changed`
- `activity.approved`
- `activity.cancelled`
- `review.requested`
- `review.recommendation_added`
- `review.decided`
- `auth.password_reset_requested`
- `activity.reminder_7_days`
- `activity.reminder_24_hours`

Envelope interno:

```json
{
  "id": "uuid-del-evento",
  "type": "activity.submitted",
  "aggregateId": "uuid-de-la-actividad",
  "payload": {}
}
```

El envelope publicado en NATS agrega `tenantId` y usa el subject `gc.events.<tenantId>.<type>`. El endpoint HTTP de contingencia requiere `x-internal-secret` y `x-tenant-id`; no se publica por el Gateway.

Notification registra primero el evento en `notifications.inbox_events`, deduplica por UUID y conserva estado por canal. Los fallos usan backoff exponencial y pasan a `DEAD_LETTER` tras cinco intentos; un administrador puede verlos y solicitar un reintento auditado. NATS JetStream usa publicación con `msgID`, consumidor durable, ack explícito y máximo de cinco entregas.
