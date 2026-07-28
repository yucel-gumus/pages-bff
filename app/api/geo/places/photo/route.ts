import { NextRequest } from 'next/server';
import { corsPreflight, gatewayFetch, jsonWithCors } from '@/lib/gateway';

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const queryString = searchParams.toString();
    const path = queryString ? `/api/places/photo?${queryString}` : '/api/places/photo';

    const res = await gatewayFetch(path, {
      method: 'GET',
    });
    const data = await res.json();
    return jsonWithCors(req, data, res.status);
  } catch (error) {
    console.error('[GET /api/geo/places/photo] Error:', error);
    return jsonWithCors(
      req,
      { success: false, error: 'Place photo service unavailable' },
      502
    );
  }
}
