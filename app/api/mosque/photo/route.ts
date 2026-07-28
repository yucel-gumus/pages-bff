import { NextRequest } from 'next/server';
import {
  corsHeadersForRequest,
  corsPreflight,
  gatewayFetch,
  jsonWithCors,
} from '@/lib/gateway';

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

/**
 * Mosque photo proxy (Places → directed Street View → Static).
 *
 * Never returns Google URLs with embedded API keys.
 * Default mode=image streams opaque image bytes.
 *
 * Query: name (required), lat, lng, district?, city?, mode=image|json
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const rawName = (searchParams.get('name') || '').trim();
    if (!rawName) {
      return jsonWithCors(req, { success: false, error: 'name is required' }, 400);
    }

    const lat = searchParams.get('lat') || undefined;
    const lng = searchParams.get('lng') || searchParams.get('lon') || undefined;
    const district = (searchParams.get('district') || '').trim();
    const city = (searchParams.get('city') || 'İstanbul').trim();
    const mode = (searchParams.get('mode') || 'image').toLowerCase();
    const cors = corsHeadersForRequest(req);

    // Richer Places query for Istanbul mosques
    const nameParts = [rawName, district, city].filter(Boolean);
    const name = nameParts.join(' ');

    if (mode === 'redirect') {
      return jsonWithCors(
        req,
        { success: false, error: 'mode=redirect is disabled; use mode=image' },
        400
      );
    }

    if (mode === 'json') {
      const params = new URLSearchParams({ name: rawName, mode: 'image' });
      if (lat) params.set('lat', lat);
      if (lng) params.set('lng', lng);
      if (district) params.set('district', district);
      if (city) params.set('city', city);
      return jsonWithCors(
        req,
        { success: true, url: `/api/mosque/photo?${params.toString()}` },
        200
      );
    }

    const upstreamParams = new URLSearchParams({ name });
    if (lat) upstreamParams.set('lat', lat);
    if (lng) upstreamParams.set('lng', lng);

    const res = await gatewayFetch(`/api/places/photo?${upstreamParams.toString()}`, {
      method: 'GET',
    });

    let data: { success?: boolean; url?: string | null; detail?: string; error?: string } = {};
    try {
      data = await res.json();
    } catch {
      return jsonWithCors(req, { success: false, error: 'Invalid upstream response' }, 502);
    }

    if (!res.ok) {
      return jsonWithCors(
        req,
        {
          success: false,
          error:
            (typeof data?.error === 'string' && data.error) ||
            (typeof data?.detail === 'string' && data.detail) ||
            'Mosque photo lookup failed',
        },
        res.status
      );
    }

    const photoUrl = data?.url;
    if (!photoUrl) {
      return jsonWithCors(req, { success: false, error: 'No photo found' }, 404);
    }

    const imgRes = await fetch(photoUrl);
    if (!imgRes.ok) {
      return jsonWithCors(req, { success: false, error: 'Photo fetch failed' }, 502);
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
      return jsonWithCors(req, { success: false, error: 'Upstream did not return an image' }, 502);
    }

    const buffer = await imgRes.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'X-Content-Type-Options': 'nosniff',
        ...cors,
      },
    });
  } catch (error) {
    console.error('[GET /api/mosque/photo] Error:', error);
    return jsonWithCors(
      req,
      { success: false, error: 'Mosque photo service unavailable' },
      502
    );
  }
}
