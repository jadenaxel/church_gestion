'use client';

import type { LucideIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';

export function SectionTabs<T extends string>({ tabs, value, onChange, label, className, prefix }: {
  tabs: ReadonlyArray<readonly [T, string, LucideIcon, number?]>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  className: string;
  prefix: string;
}) {
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next]![0]);
    const target = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  return <div className={className} role="tablist" aria-label={label}>
    {tabs.map(([id, title, Icon, count], index) => <button type="button" key={id} role="tab"
      id={`${prefix}-tab-${id}`} aria-controls={`${prefix}-panel`} aria-label={title}
      aria-selected={value === id} tabIndex={value === id ? 0 : -1}
      className={value === id ? 'active' : ''} onClick={() => onChange(id)} onKeyDown={(event) => move(event, index)}>
      <Icon aria-hidden="true" /><span>{title}</span>{count !== undefined && <b>{count}</b>}
    </button>)}
  </div>;
}
