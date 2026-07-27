import { describe, expect, it } from 'vitest';
import configToml from '../../supabase/config.toml?raw';
import { corsHeaders } from '../../supabase/functions/lms-admin/cors';

const edgeEntries = import.meta.glob('../../supabase/functions/*/index.ts');
const corsImplementations = import.meta.glob<string>(
  '../../supabase/functions/*/cors.ts',
  { eager: true, import: 'default', query: '?raw' },
);

function functionName(path: string) {
  return path.split('/').at(-2) ?? '';
}

describe('F3 edge-function deployment controls', () => {
  it('declares verify_jwt=true for every edge-function directory', () => {
    const functionNames = Object.keys(edgeEntries).map(functionName).sort();
    expect(functionNames).toHaveLength(7);

    for (const name of functionNames) {
      expect(configToml).toMatch(
        new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt\\s*=\\s*true`),
      );
    }

    const configuredNames = [...configToml.matchAll(/\[functions\.([^\]]+)\]/g)]
      .map((match) => match[1])
      .sort();
    expect(configuredNames).toEqual(functionNames);
  });

  it('keeps automatic database seeding disabled', () => {
    expect(configToml).toMatch(/\[db\.seed\]\s+(?:#[^\n]*\n\s*)*enabled\s*=\s*false/);
  });

  it('uses the same allowlist implementation in all seven functions', () => {
    expect(Object.keys(corsImplementations)).toHaveLength(7);
    expect(new Set(Object.values(corsImplementations)).size).toBe(1);
    expect(Object.values(corsImplementations)
      .every((source) => !source.includes("'Access-Control-Allow-Origin': '*'")))
      .toBe(true);
  });

  it('echoes an allowed origin and refuses a foreign origin', () => {
    const allowedOrigin = 'https://lms-sandbox.example.test';
    const allowlist = [allowedOrigin, 'http://localhost:5173'];
    const allowed = corsHeaders(
      new Request('https://edge.example.test', {
        method: 'OPTIONS',
        headers: { Origin: allowedOrigin },
      }),
      allowlist,
    );
    const foreign = corsHeaders(
      new Request('https://edge.example.test', {
        method: 'OPTIONS',
        headers: { Origin: 'https://foreign.example.test' },
      }),
      allowlist,
    );

    expect(allowed['Access-Control-Allow-Origin']).toBe(allowedOrigin);
    expect(allowed.Vary).toBe('Origin');
    expect(foreign).not.toHaveProperty('Access-Control-Allow-Origin');
    expect(foreign.Vary).toBe('Origin');
  });

});
