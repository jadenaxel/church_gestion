import { describe, expect, it, vi } from 'vitest';
import { maintainRouteTitle } from '../../apps/web/components/route-title.js';

function titleHarness() {
  type Observed = { node: unknown; options: MutationObserverInit };
  const observers: FakeObserver[] = [];
  class FakeObserver {
    observed: Observed | null = null;
    disconnect = vi.fn(() => { this.observed = null; });
    observe = vi.fn((node: unknown, options: MutationObserverInit) => { this.observed = { node, options }; });
    constructor(public callback: MutationCallback) { observers.push(this); }
    emit(mutations: MutationRecord[] = []) { this.callback(mutations, this as unknown as MutationObserver); }
  }
  let title = 'GestionChurch';
  let titleNode: { nodeName: string } | null = { nodeName: 'TITLE' };
  const write = vi.fn((next: string) => { title = next; });
  const head = { querySelector: () => titleNode };
  const target = {
    head,
    get title() { return title; },
    set title(next: string) { write(next); }
  } as unknown as Document;
  const change = (addedNodes: unknown[], removedNodes: unknown[] = []) => [{ addedNodes, removedNodes } as unknown as MutationRecord];
  return {
    target,
    head,
    observers,
    write,
    Observer: FakeObserver as unknown as typeof MutationObserver,
    overwrite(next: string) { title = next; observers[0]!.emit(); },
    replace() {
      const previous = titleNode;
      titleNode = { nodeName: 'TITLE' };
      title = 'GestionChurch';
      observers[1]!.emit(change([titleNode], [previous]));
      return titleNode;
    },
    unrelatedHeadUpdate() { observers[1]!.emit(change([{ nodeName: 'STYLE' }])); }
  };
}

describe('localized route titles survive streamed metadata', () => {
  it('restores the route title after Next overwrites the existing title text', () => {
    const browser = titleHarness();
    maintainRouteTitle('Centro de control · GestionChurch', browser.target, browser.Observer);
    expect(browser.target.title).toBe('Centro de control · GestionChurch');
    browser.overwrite('GestionChurch');
    expect(browser.target.title).toBe('Centro de control · GestionChurch');
    expect(browser.write).toHaveBeenCalledTimes(2);
  });

  it('rebinds to a replaced title node without watching the document body', () => {
    const browser = titleHarness();
    maintainRouteTitle('Dashboard · GestionChurch', browser.target, browser.Observer);
    const replacement = browser.replace();
    expect(browser.target.title).toBe('Dashboard · GestionChurch');
    expect(browser.observers[0]!.observed?.node).toBe(replacement);
    expect(browser.observers[1]!.observed).toEqual({ node: browser.head, options: { childList: true } });
  });

  it('ignores unrelated head updates and its own title mutation, avoiding an observer loop', () => {
    const browser = titleHarness();
    maintainRouteTitle('Reports · GestionChurch', browser.target, browser.Observer);
    browser.unrelatedHeadUpdate();
    browser.observers[0]!.emit();
    browser.observers[0]!.emit();
    expect(browser.write).toHaveBeenCalledTimes(1);
    expect(browser.observers[0]!.observe).toHaveBeenCalledTimes(1);
  });

  it('disconnects on route or language change and ignores late callbacks from the old route', () => {
    const browser = titleHarness();
    const stopSpanish = maintainRouteTitle('Inicio · GestionChurch', browser.target, browser.Observer);
    stopSpanish();
    maintainRouteTitle('Accueil · GestionChurch', browser.target, browser.Observer);
    browser.observers[0]!.emit();
    browser.observers[1]!.emit([{ addedNodes: [{ nodeName: 'TITLE' }], removedNodes: [] } as unknown as MutationRecord]);
    expect(browser.target.title).toBe('Accueil · GestionChurch');
    expect(browser.observers[0]!.observed).toBeNull();
    expect(browser.observers[1]!.observed).toBeNull();
  });
});
