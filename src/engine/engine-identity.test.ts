/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest';
import source from './progression.ts?raw';

const copies = import.meta.glob('/supabase/functions/*/progression.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

describe('deployed progression engine identity', () => {
  it('keeps every Edge Function progression.ts byte-identical to the source', () => {
    expect(Object.keys(copies).length).toBeGreaterThanOrEqual(5);
    for (const [path, copy] of Object.entries(copies)) {
      expect(copy, path).toBe(source);
    }
  });
});
