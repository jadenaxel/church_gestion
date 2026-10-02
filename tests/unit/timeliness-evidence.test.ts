import { describe, expect, it } from 'vitest';
import { timelinessDisplay } from '../../apps/web/components/timeliness-evidence.js';

describe('timeliness without invented evidence', () => {
  it('never displays a legacy100 without timing evidence or with zero eligible completions', () => {
    expect(timelinessDisplay(100).value).toBe('—');
    expect(timelinessDisplay(100,{sampleSize:0,untimedCompleted:3})).toEqual({value:'—',sampleSize:0,untimedCompleted:3});
  });
  it('shows only a finite rate with a positive eligible sample and retains untimed count', () => {
    expect(timelinessDisplay(50,{sampleSize:2,untimedCompleted:1})).toEqual({value:'50%',sampleSize:2,untimedCompleted:1});
    expect(timelinessDisplay(Number.NaN,{sampleSize:2,untimedCompleted:1}).value).toBe('—');
    expect(timelinessDisplay(150,{sampleSize:2,untimedCompleted:1}).value).toBe('—');
  });
});
