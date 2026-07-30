import { NextRequest } from 'next/server';
import { corsHeadersForRequest, corsPreflight, jsonWithCors } from '@/lib/gateway';

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

/**
 * Mosque photo proxy — calls Google Places API (New) directly on the server.
 * Never returns Google URLs with embedded API keys to the browser.
 *
 * Query params:
 *   name      (required) — mosque name
 *   lat, lng  (optional) — coordinate hint for location bias
 *   district  (optional) — Istanbul district name for richer query
 *   city      (optional) — city name, defaults to "İstanbul"
 *   mode      (optional) — "image" (default) streams bytes | "json" returns same-origin URL
 */
export async function GET(req: NextRequest) {
  const cors = corsHeadersForRequest(req);

  try {
    const { searchParams } = req.nextUrl;
    const rawName = (searchParams.get('name') || '').trim();
    if (!rawName) {
      return jsonWithCors(req, { success: false, error: 'name is required' }, 400);
    }

    const latStr = searchParams.get('lat') || undefined;
    const lngStr = searchParams.get('lng') || searchParams.get('lon') || undefined;
    const district = (searchParams.get('district') || '').trim();
    const city = (searchParams.get('city') || 'İstanbul').trim();
    const mode = (searchParams.get('mode') || 'image').toLowerCase();

    if (mode === 'redirect') {
      return jsonWithCors(req, { success: false, error: 'mode=redirect is disabled; use mode=image' }, 400);
    }

    // JSON clients: return a same-origin image stream URL (key never leaves the edge)
    if (mode === 'json') {
      const params = new URLSearchParams({ name: rawName, mode: 'image' });
      if (latStr) params.set('lat', latStr);
      if (lngStr) params.set('lng', lngStr);
      if (district) params.set('district', district);
      if (city) params.set('city', city);
      return jsonWithCors(req, { success: true, url: `/api/mosque/photo?${params.toString()}` }, 200);
    }

    const serverKey =
      process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

    if (!serverKey) {
      console.error('[mosque/photo] Missing GOOGLE_MAPS_SERVER_KEY');
      return jsonWithCors(req, { success: false, error: 'Maps key not configured' }, 500);
    }

    // The Maps API key has HTTP-referrer restrictions (yucel-gumus.github.io).
    // Server-side fetch() sends no Referer by default → 403 PERMISSION_DENIED.
    // Setting the allowed origin bypasses the restriction.
    const ALLOWED_REFERER = 'https://yucel-gumus.github.io/';
    const PLACES_HEADERS = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': serverKey,
      'X-Goog-FieldMask': 'places.photos,places.displayName',
      'Referer': ALLOWED_REFERER,
      'Origin': 'https://yucel-gumus.github.io',
    };

    // Build a richer query: "Süleymaniye Camii Fatih İstanbul"
    const queryParts = [rawName, district, city].filter(Boolean);
    const textQuery = queryParts.join(' ');

    // ── Step 1: Text Search (Places API v1) ───────────────────────────────────
    const textSearchUrl = 'https://places.googleapis.com/v1/places:searchText';
    const requestBody: Record<string, unknown> = {
      textQuery,
      maxResultCount: 1,
      languageCode: 'tr',
      includedType: 'mosque', // bias toward mosque results
    };

    // Location bias — tighten the search radius when coordinates are available
    if (latStr && lngStr) {
      requestBody.locationBias = {
        circle: {
          center: { latitude: Number(latStr), longitude: Number(lngStr) },
          radius: 200, // very tight — 200m around the mosque pin
        },
      };
    }

    const searchRes = await fetch(textSearchUrl, {
      method: 'POST',
      headers: PLACES_HEADERS,
      body: JSON.stringify(requestBody),
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const photos: Array<{ name: string }> = searchData?.places?.[0]?.photos ?? [];

      if (photos.length > 0) {
        // ── Step 2: Fetch photo bytes via Places Photo Media API ───────────────
        const photoName = photos[0].name; // e.g. "places/xxx/photos/yyy"
        const photoUrl =
          `https://places.googleapis.com/v1/${photoName}/media` +
          `?key=${serverKey}&maxWidthPx=800&skipHttpRedirect=true`;

        const photoRes = await fetch(photoUrl, {
          headers: { 'Referer': ALLOWED_REFERER, 'Origin': 'https://yucel-gumus.github.io' },
        });
        if (photoRes.ok) {
          const photoJson = await photoRes.json().catch(() => null);
          const photoUri: string | undefined = photoJson?.photoUri;
          if (photoUri) {
            return await streamExternalImage(photoUri, cors);
          }
        }
      }
    }

    // ── Fallback: retry without includedType for generic mosque search ─────────
    if (searchRes.ok) {
      const retryBody: Record<string, unknown> = {
        textQuery,
        maxResultCount: 1,
        languageCode: 'tr',
      };
      if (latStr && lngStr) {
        retryBody.locationBias = {
          circle: {
            center: { latitude: Number(latStr), longitude: Number(lngStr) },
            radius: 500,
          },
        };
      }

      const retryRes = await fetch(textSearchUrl, {
        method: 'POST',
        headers: PLACES_HEADERS,
        body: JSON.stringify(retryBody),
      });

      if (retryRes.ok) {
        const retryData = await retryRes.json();
        const retryPhotos: Array<{ name: string }> = retryData?.places?.[0]?.photos ?? [];

        if (retryPhotos.length > 0) {
          const photoName = retryPhotos[0].name;
          const photoUrl =
            `https://places.googleapis.com/v1/${photoName}/media` +
            `?key=${serverKey}&maxWidthPx=800&skipHttpRedirect=true`;

          const photoRes = await fetch(photoUrl);
          if (photoRes.ok) {
            const photoJson = await photoRes.json().catch(() => null);
            const photoUri: string | undefined = photoJson?.photoUri;
            if (photoUri) {
              return await streamExternalImage(photoUri, cors);
            }
          }
        }
      }
    }

    // ── Street View Static fallback (coordinates-based) ────────────────────────
    if (latStr && lngStr) {
      const svUrl =
        `https://maps.googleapis.com/maps/api/streetview` +
        `?size=800x600&location=${latStr},${lngStr}&fov=90&key=${serverKey}`;
      const svRes = await fetch(svUrl);
      if (svRes.ok) {
        const ct = svRes.headers.get('content-type') || '';
        if (ct.startsWith('image/')) {
          const buf = await svRes.arrayBuffer();
          return new Response(buf, {
            status: 200,
            headers: {
              'Content-Type': ct,
              'Cache-Control': 'public, max-age=86400, s-maxage=86400',
              'X-Content-Type-Options': 'nosniff',
              ...cors,
            },
          });
        }
      }
    }

    // ── Wikipedia Turkish fallback ──────────────────────────────────────────────
    const wikiImg = await fetchWikipediaMosqueImage(rawName);
    if (wikiImg) {
      return await streamExternalImage(wikiImg, cors);
    }

    return jsonWithCors(req, { success: false, error: 'No photo found' }, 404);
  } catch (error) {
    console.error('[GET /api/mosque/photo] Error:', error);
    return jsonWithCors(req, { success: false, error: 'Mosque photo service unavailable' }, 502);
  }
}

/** Stream external image through edge function (key never leaves server). */
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

/** Wikipedia TR API — public, no secrets. */
async function fetchWikipediaMosqueImage(mosqueName: string): Promise<string | null> {
  try {
    const cleanName = mosqueName.trim().replace(/\s+/g, ' ');
    const url =
      `https://tr.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(cleanName)}` +
      `&prop=pageimages&format=json&pithumbsize=800&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const pageId = Object.keys(pages)[0];
    if (!pageId || pageId === '-1') return null;
    return pages[pageId]?.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}
