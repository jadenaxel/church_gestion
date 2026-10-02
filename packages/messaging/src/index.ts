import { AckPolicy, jetstream, jetstreamManager } from '@nats-io/jetstream';
import { connect, type NatsConnection } from '@nats-io/transport-node';

export type DomainEnvelope = {
  id: string;
  tenantId: string;
  type: string;
  aggregateId: string;
  payload: unknown;
};

let connectionPromise: Promise<NatsConnection> | undefined;

export function subjectForDomainEvent(event: Pick<DomainEnvelope, 'tenantId' | 'type'>): string {
  const subjectType = event.type.replaceAll(/[^a-zA-Z0-9_.-]/g, '_');
  const tenant = event.tenantId.replaceAll(/[^a-zA-Z0-9_-]/g, '_');
  return `gc.events.${tenant}.${subjectType}`;
}

async function connection(): Promise<NatsConnection> {
  const url = process.env.NATS_URL;
  if (!url) throw new Error('NATS_DISABLED');
  if (!connectionPromise) {
    const pending = connect({ servers: url, name: process.env.SERVICE_NAME ?? 'gestionchurch' });
    connectionPromise = pending;
    // A rejected first connection must not poison every future publication.
    // Clear only this promise, never a newer successful connection.
    void pending.catch(() => { if (connectionPromise === pending) connectionPromise = undefined; });
  }
  return connectionPromise;
}

async function ensureTopology(nc: NatsConnection): Promise<void> {
  const manager = await jetstreamManager(nc);
  try { await manager.streams.info('GESTIONCHURCH_EVENTS'); }
  catch {
    try { await manager.streams.add({ name: 'GESTIONCHURCH_EVENTS', subjects: ['gc.events.>'], duplicate_window: 120_000_000_000 }); }
    catch (error) {
      if (!(error instanceof Error) || !/exist/i.test(error.message)) throw error;
    }
  }
}

export async function publishDomainEvent(event: DomainEnvelope): Promise<boolean> {
  if (!process.env.NATS_URL) return false;
  const nc = await connection();
  await ensureTopology(nc);
  const client = jetstream(nc);
  await client.publish(subjectForDomainEvent(event), JSON.stringify(event), { msgID: event.id });
  return true;
}

export async function startDomainEventConsumer(handler: (event: DomainEnvelope) => Promise<void>): Promise<void> {
  if (!process.env.NATS_URL) return;
  const nc = await connection();
  await ensureTopology(nc);
  const manager = await jetstreamManager(nc);
  try { await manager.consumers.info('GESTIONCHURCH_EVENTS', 'notification-service'); }
  catch {
    try {
      await manager.consumers.add('GESTIONCHURCH_EVENTS', {
        durable_name: 'notification-service', ack_policy: AckPolicy.Explicit,
        filter_subject: 'gc.events.>', max_deliver: 5, ack_wait: 30_000_000_000
      });
    } catch (error) {
      if (!(error instanceof Error) || !/exist/i.test(error.message)) throw error;
    }
  }
  const consumer = await jetstream(nc).consumers.get('GESTIONCHURCH_EVENTS', 'notification-service');
  const messages = await consumer.consume({ max_messages: 10 });
  for await (const message of messages) {
    try {
      const event = JSON.parse(new TextDecoder().decode(message.data)) as DomainEnvelope;
      await handler(event);
      message.ack();
    } catch {
      message.nak(1_000);
    }
  }
}
