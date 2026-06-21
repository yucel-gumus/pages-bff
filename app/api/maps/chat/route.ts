import { NextRequest } from 'next/server';
import { corsPreflight, corsHeadersForRequest, gatewayFetch } from '@/lib/gateway';

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await gatewayFetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const cors = corsHeadersForRequest(req);
  if (!res.ok) {
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...cors,
    },
  });
}