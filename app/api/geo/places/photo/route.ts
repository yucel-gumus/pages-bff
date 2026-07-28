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
 * Proxies Google Places / Street View / Static photos.
 *
 * Security:
 * - Never return Google URLs that embed API keys to the browser.
 * - Default mode=image → stream image bytes (opaque to client).
 * - mode=json → same-origin relative stream URL only (no Google key).
 * - mode=redirect → disabled.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const name = (searchParams.get('name') || '').trim();
    if (!name) {
      return jsonWithCors(req, { success: false, error: 'name is required' }, 400);
    }

    const lat = searchParams.get('lat') || undefined;
    const lng = searchParams.get('lng') || undefined;
    const mode = (searchParams.get('mode') || 'image').toLowerCase();
    const cors = corsHeadersForRequest(req);

    if (mode === 'redirect') {
      return jsonWithCors(
        req,
        { success: false, error: 'mode=redirect is disabled; use mode=image' },
        400
      );
    }

    // JSON clients get a same-origin stream URL — never the upstream Google URL with key=
    if (mode === 'json') {
      const params = new URLSearchParams({ name, mode: 'image' });
      if (lat) params.set('lat', lat);
      if (lng) params.set('lng', lng);
      return jsonWithCors(
        req,
        {
          success: true,
          url: `/api/geo/places/photo?${params.toString()}`,
        },
        200
      );
    }

    // Resolve photo on backend (server-side only; response may contain Google key)
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
            'Place photo lookup failed',
        },
        res.status
      );
    }

    const photoUrl = data?.url;
    if (!photoUrl) {
      return jsonWithCors(req, { success: false, error: 'No photo found' }, 404);
    }

    // Fetch Google image server-side and stream bytes (key never leaves the edge)
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
    console.error('[GET /api/geo/places/photo] Error:', error);
    return jsonWithCors(
      req,
      { success: false, error: 'Place photo service unavailable' },
      502
    );
  }
}
