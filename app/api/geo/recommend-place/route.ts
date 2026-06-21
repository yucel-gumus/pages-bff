import { NextRequest } from 'next/server';
import { corsPreflight, gatewayFetch, jsonWithCors } from '@/lib/gateway';

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await gatewayFetch('/api/recommend-place', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return jsonWithCors(req, data, res.status);
  } catch {
    return jsonWithCors(req, { success: false, error: 'BFF error' }, 500);
  }
}