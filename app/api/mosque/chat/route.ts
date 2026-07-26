export const maxDuration = 60;
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { corsPreflight, corsHeadersForRequest, gatewayFetch, jsonWithCors } from '@/lib/gateway';

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function POST(req: NextRequest) {
  const cors = corsHeadersForRequest(req);
  try {
    const body = await req.json();
    const res = await gatewayFetch('/api/mosque/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });

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
  } catch (error) {
    console.error('[POST /api/mosque/chat] Error:', error);
    return jsonWithCors(
      req,
      { success: false, error: 'Gateway unavailable or connection failed' },
      502
    );
  }
}

