type RuntimeGlobal = typeof globalThis & {
  Deno?: { env: { get(name: string): string | undefined } };
};

function configuredOrigins() {
  return ((globalThis as RuntimeGlobal).Deno?.env.get('LMS_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(
  req: Request,
  allowedOrigins: string[] = configuredOrigins(),
): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  const origin = req.headers.get('Origin');
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}
