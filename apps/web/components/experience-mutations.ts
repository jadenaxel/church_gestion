/** Coalesce DOM changes without losing a batch when React commits again before the next frame. */
export function createMutationQueue(
  translate: (mutations: MutationRecord[]) => void,
  requestFrame: (callback: FrameRequestCallback) => number,
  cancelFrame: (handle: number) => void
) {
  let frame: number | null = null;
  let pending: MutationRecord[] = [];
  let stopped = false;
  return {
    enqueue(mutations: MutationRecord[]) {
      if (stopped) return;
      pending.push(...mutations);
      if (frame !== null) return;
      frame = requestFrame(() => {
        if (stopped) return;
        frame = null;
        const batch = pending;
        pending = [];
        translate(batch);
      });
    },
    stop() {
      stopped = true;
      if (frame !== null) cancelFrame(frame);
      frame = null;
      pending = [];
    }
  };
}
