const DEFAULT_GATEWAY_URL = 'https://api.yucelgumus.dev';

const DEFAULT_PAGES_ORIGINS = [
  'https://yucel-gumus.github.io',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
];

function allowedOrigins(): string[] {
  const raw = process.env.PAGES_BFF_ALLOWED_ORIGINS || '';
  const fromEnv = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_PAGES_ORIGINS;
}

export function getGatewayBaseUrl(): string {
  const url = process.env.AI_API_URL || process.env.GEMINI_GATEWAY_URL || DEFAULT_GATEWAY_URL;
  return url.replace(/\/$/, '');
}

export function getGatewayClientApiKey(): string {
  const key = process.env.GATEWAY_CLIENT_API_KEY || process.env.CLIENT_API_KEY || '';
  if (!key) throw new Error('GATEWAY_CLIENT_API_KEY is not configured.');
  return key;
}

export async function gatewayFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-API-Key', getGatewayClientApiKey());
  return fetch(`${getGatewayBaseUrl()}${path}`, { ...init, headers });
}

export function corsHeadersForRequest(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin) return {};
  const allowed = allowedOrigins();
  const match = allowed.includes(origin);
  if (!match) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export function corsPreflight(req: Request): Response {
  const headers = corsHeadersForRequest(req);
  if (!headers['Access-Control-Allow-Origin']) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers });
}

export function jsonWithCors(req: Request, data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: corsHeadersForRequest(req) });
}