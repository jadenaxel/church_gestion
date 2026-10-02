/** Keep the translated route title when streamed Next metadata updates or replaces its title node. */
export function maintainRouteTitle(
  expected: string,
  target: Document = document,
  Observer: typeof MutationObserver = MutationObserver
): () => void {
  let stopped = false;
  let titleNode: HTMLTitleElement | null = null;
  const write = () => {
    if (!stopped && target.title !== expected) target.title = expected;
  };
  const titleObserver = new Observer(write);
  const bindTitle = () => {
    if (stopped) return;
    const next = target.head.querySelector('title');
    if (next !== titleNode) {
      titleObserver.disconnect();
      titleNode = next;
      if (titleNode) titleObserver.observe(titleNode, { childList: true, characterData: true, subtree: true });
    }
    write();
  };
  const headObserver = new Observer((mutations) => {
    if (mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node.nodeName === 'TITLE'))) bindTitle();
  });
  // Watch direct title additions/replacements, then only text changes inside that title.
  headObserver.observe(target.head, { childList: true });
  bindTitle();
  return () => {
    stopped = true;
    headObserver.disconnect();
    titleObserver.disconnect();
  };
}
