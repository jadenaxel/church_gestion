import { describe, expect, it, vi } from 'vitest';
import { activeRequest } from '../../apps/web/components/active-request.js';

describe('stale UI request protection', () => {
  it('applies an active response and reports active failures', async () => {
    const controller = new AbortController(); const apply = vi.fn(); const error = vi.fn();
    await activeRequest(controller.signal, async () => 'available', apply, error);
    expect(apply).toHaveBeenCalledWith('available');
    await activeRequest(controller.signal, async () => { throw new Error('offline'); }, apply, error);
    expect(error).toHaveBeenCalledOnce();
  });
  it('does not apply an old availability response after dates change', async () => {
    const old = new AbortController(); const current = new AbortController(); const apply = vi.fn(); const error = vi.fn();
    let resolve: (value: string) => void = () => undefined;
    const pending = activeRequest(old.signal, () => new Promise<string>((done) => { resolve = done; }), apply, error);
    old.abort();
    await activeRequest(current.signal, async () => 'new date unavailable', apply, error);
    resolve('old date available'); await pending;
    expect(apply).toHaveBeenCalledExactlyOnceWith('new date unavailable');
    expect(error).not.toHaveBeenCalled();
  });
  it('does not paint cancellation as a failure', async () => {
    const controller = new AbortController(); const apply = vi.fn(); const error = vi.fn();
    controller.abort(); await activeRequest(controller.signal, async () => { throw new Error('aborted'); }, apply, error);
    expect(error).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled();
  });
});
