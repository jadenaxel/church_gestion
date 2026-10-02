import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ connect: vi.fn(), publish: vi.fn(), manager: vi.fn() }));
vi.mock('@nats-io/transport-node', () => ({ connect: mocks.connect }));
vi.mock('@nats-io/jetstream', () => ({ AckPolicy: { Explicit: 'explicit' }, jetstream: () => ({ publish: mocks.publish }), jetstreamManager: mocks.manager }));

const event = { id: 'synthetic-event', tenantId: 'synthetic-tenant', type: 'fixture.recovery', aggregateId: 'synthetic-aggregate', payload: { synthetic: true } };
describe('NATS connection failures do not poison durable publication recovery', () => {
  beforeEach(() => {
    vi.resetModules(); vi.resetAllMocks(); vi.stubEnv('NATS_URL', 'nats://127.0.0.1:4222');
    mocks.manager.mockResolvedValue({ streams: { info: vi.fn().mockResolvedValue({}) } });
    mocks.publish.mockResolvedValue({});
  });
  afterEach(() => { vi.unstubAllEnvs(); });
  it('retries a rejected initial connection and preserves the original event ID', async () => {
    mocks.connect.mockRejectedValueOnce(new Error('Synthetic first connection failure')).mockResolvedValueOnce({});
    const { publishDomainEvent } = await import('../../packages/messaging/src/index.js');
    await expect(publishDomainEvent(event)).rejects.toThrow('Synthetic first connection failure');
    await expect(publishDomainEvent(event)).resolves.toBe(true);
    expect(mocks.connect).toHaveBeenCalledTimes(2);
    expect(mocks.publish).toHaveBeenCalledWith('gc.events.synthetic-tenant.fixture.recovery', JSON.stringify(event), { msgID: event.id });
  });
  it('shares an in-flight connection and permits a shared retry after rejection', async () => {
    let rejectInitial: ((error: Error) => void) | undefined;
    mocks.connect.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectInitial = reject; })).mockResolvedValueOnce({});
    const { publishDomainEvent } = await import('../../packages/messaging/src/index.js');
    const first = publishDomainEvent(event), second = publishDomainEvent(event);
    const results = Promise.allSettled([first, second]);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    rejectInitial?.(new Error('Synthetic concurrent connection failure'));
    expect((await results).map((result) => result.status)).toEqual(['rejected', 'rejected']);
    await expect(Promise.all([publishDomainEvent(event), publishDomainEvent(event)])).resolves.toEqual([true, true]);
    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });
  it('keeps the existing disabled-NATS fallback contract without connecting', async () => {
    vi.stubEnv('NATS_URL', '');
    const { publishDomainEvent } = await import('../../packages/messaging/src/index.js');
    await expect(publishDomainEvent(event)).resolves.toBe(false);
    expect(mocks.connect).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled();
  });
});
