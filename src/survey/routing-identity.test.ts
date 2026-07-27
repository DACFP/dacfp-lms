import { describe, expect, it } from 'vitest';
import source from './routing.ts?raw';

const copies = import.meta.glob('/supabase/functions/lms-submit-survey/routing.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

describe('survey routing edge copy', () => {
  it('is byte-identical to the learner routing implementation', () => {
    expect(Object.keys(copies)).toHaveLength(1);
    expect(Object.values(copies)[0]).toBe(source);
  });
});
