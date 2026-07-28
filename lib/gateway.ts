const DEFAULT_GATEWAY_URL = 'https://python-backend-270384591051.europe-west3.run.app';

const DEFAULT_PAGES_ORIGINS = [
  'https://www.yucelgumus.dev',
  'https://yucelgumus.dev',
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
  if (!key) {
    console.error('[gateway] Missing GATEWAY_CLIENT_API_KEY environment variable.');
    throw new Error('GATEWAY_CLIENT_API_KEY is not configured.');
  }
  return key;
}

export async function gatewayFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-API-Key', getGatewayClientApiKey());

  const targetUrl = `${getGatewayBaseUrl()}${path}`;
  try {
    return await fetch(targetUrl, { ...init, headers });
  } catch (error) {
    console.error(`[gatewayFetch] Connection error to ${targetUrl}:`, error);
    throw error;
  }
}

export function corsHeadersForRequest(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin) return {};
  const allowed = allowedOrigins();
  const isVercelDomain = origin.endsWith('.vercel.app');
  const isGithubPages = origin.endsWith('.github.io');
  const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const match = allowed.includes('*') || allowed.includes(origin) || isVercelDomain || isGithubPages || isLocalhost;
  if (!match) return {};

  const reqHeaders = req.headers.get('access-control-request-headers') || req.headers.get('Access-Control-Request-Headers');

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Allow-Headers': reqHeaders
      ? `${reqHeaders}, Content-Type, Authorization, X-API-Key, x-goog-api-key, x-goog-maps-api-signature, x-goog-maps-api-salt, x-goog-maps-session-id, x-goog-gmp-client-signals, x-user-agent, *`
      : '*',
    'Access-Control-Allow-Credentials': 'true',
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