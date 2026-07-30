import { NextRequest } from 'next/server';
import { corsHeadersForRequest, corsPreflight, jsonWithCors } from '@/lib/gateway';

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

/**
 * Geo/Places photo proxy — calls Google Places API (New) directly on the server.
 * Never returns Google URLs with embedded API keys to the browser.
 *
 * Query params:
 *   name  (required) — place name to search
 *   lat   (optional) — latitude hint
 *   lng   (optional) — longitude hint
 *   mode  (optional) — "image" (default) streams bytes | "json" returns same-origin URL
 */
export async function GET(req: NextRequest) {
  const cors = corsHeadersForRequest(req);

  try {
    const { searchParams } = req.nextUrl;
    const name = (searchParams.get('name') || '').trim();
    if (!name) {
      return jsonWithCors(req, { success: false, error: 'name is required' }, 400);
    }

    const latStr = searchParams.get('lat');
    const lngStr = searchParams.get('lng');
    const mode = (searchParams.get('mode') || 'image').toLowerCase();

    if (mode === 'redirect') {
      return jsonWithCors(req, { success: false, error: 'mode=redirect is disabled' }, 400);
    }

    // JSON clients get a same-origin image stream URL (key never leaves the edge)
    if (mode === 'json') {
      const params = new URLSearchParams({ name, mode: 'image' });
      if (latStr) params.set('lat', latStr);
      if (lngStr) params.set('lng', lngStr);
      return jsonWithCors(req, { success: true, url: `/api/geo/places/photo?${params.toString()}` }, 200);
    }

    const serverKey =
      process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

    if (!serverKey) {
      console.error('[geo/places/photo] Missing GOOGLE_MAPS_SERVER_KEY');
      return jsonWithCors(req, { success: false, error: 'Maps key not configured' }, 500);
    }

    // ── Step 1: Find Place (Places API v1 — Text Search) ─────────────────────
    const textSearchUrl = 'https://places.googleapis.com/v1/places:searchText';
    let locationBias: object | undefined;
    if (latStr && lngStr) {
      locationBias = {
        circle: {
          center: { latitude: Number(latStr), longitude: Number(lngStr) },
          radius: 50000,
        },
      };
    }

    const textSearchBody: Record<string, unknown> = {
      textQuery: name,
      maxResultCount: 1,
      languageCode: 'tr',
    };
    if (locationBias) textSearchBody.locationBias = locationBias;

    const searchRes = await fetch(textSearchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': serverKey,
        'X-Goog-FieldMask': 'places.photos,places.displayName',
      },
      body: JSON.stringify(textSearchBody),
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error('[geo/places/photo] textSearch error:', searchRes.status, errText);
      return jsonWithCors(req, { success: false, error: 'Place search failed' }, 502);
    }

    const searchData = await searchRes.json();
    const photos: Array<{ name: string }> = searchData?.places?.[0]?.photos ?? [];

    if (photos.length === 0) {
      // ── Fallback: Wikipedia image ─────────────────────────────────────────
      const wikiImg = await fetchWikipediaImage(name);
      if (wikiImg) {
        return await streamExternalImage(wikiImg, cors);
      }
      return jsonWithCors(req, { success: false, error: 'No photo found' }, 404);
    }

    // ── Step 2: Fetch photo bytes via Places Photo Media API ─────────────────
    const photoName = photos[0].name; // e.g. "places/xxx/photos/yyy"
    const photoUrl =
      `https://places.googleapis.com/v1/${photoName}/media` +
      `?key=${serverKey}&maxWidthPx=800&skipHttpRedirect=true`;

    const photoRes = await fetch(photoUrl);
    if (!photoRes.ok) {
      console.error('[geo/places/photo] photo fetch error:', photoRes.status);
      return jsonWithCors(req, { success: false, error: 'Photo fetch failed' }, 502);
    }

    // Places media API returns JSON with photoUri when skipHttpRedirect=true
    const photoJson = await photoRes.json().catch(() => null);
    const photoUri: string | undefined = photoJson?.photoUri;

    if (!photoUri) {
      return jsonWithCors(req, { success: false, error: 'No photo URI in response' }, 502);
    }

    return await streamExternalImage(photoUri, cors);
  } catch (err) {
    console.error('[GET /api/geo/places/photo] Unhandled error:', err);
    return jsonWithCors(req, { success: false, error: 'Photo service unavailable' }, 502);
  }
}

/** Stream an external image through the edge function (key never leaves server). */
async function streamExternalImage(
  url: string,
  cors: Record<string, string>
): Promise<Response> {
  const imgRes = await fetch(url);
  if (!imgRes.ok) {
    return Response.json({ success: false, error: 'Image stream failed' }, { status: 502, headers: cors });
  }
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
    return Response.json({ success: false, error: 'Not an image' }, { status: 502, headers: cors });
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
}

/** Wikipedia fallback: TR → EN */
async function fetchWikipediaImage(query: string): Promise<string | null> {
  for (const lang of ['tr', 'en'] as const) {
    try {
      const wikiUrl =
        `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search` +
        `&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&prop=pageimages` +
        `&pithumbsize=800&format=json&origin=*`;
      const res = await fetch(wikiUrl);
      if (!res.ok) continue;
      const data = await res.json();
      const pages = data?.query?.pages;
      if (!pages) continue;
      const firstPage = Object.values(pages)[0] as { thumbnail?: { source?: string } };
      const imgUrl = firstPage?.thumbnail?.source;
      if (imgUrl) return imgUrl;
    } catch {
      // next lang
    }
  }
  return null;
}
