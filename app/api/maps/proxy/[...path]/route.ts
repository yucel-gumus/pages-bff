import { NextRequest } from 'next/server';
import { corsPreflight, corsHeadersForRequest } from '@/lib/gateway';

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  const reqHeaders = req.headers.get('access-control-request-headers') || '*';
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
      'Access-Control-Allow-Headers': reqHeaders,
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  return handleProxy(req, await params);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  return handleProxy(req, await params);
}

async function handleProxy(req: NextRequest, resolvedParams: { path?: string[] }) {
  const pathSegments = resolvedParams.path || [];
  const pathStr = pathSegments.join('/');

  // Instant 204 No Content for Google Maps CSP test beacons (gen_204)
  if (pathStr.includes('gen_204')) {
    const origin = req.headers.get('origin') || '*';
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
    });
  }

  const serverKey =
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    '';

  if (!serverKey) {
    console.error('[maps-proxy] Missing GOOGLE_MAPS_SERVER_KEY environment variable.');
    return Response.json(
      { error: 'GOOGLE_MAPS_SERVER_KEY is not configured on server.' },
      { status: 500, headers: corsHeadersForRequest(req) }
    );
  }

  const reqUrl = new URL(req.url);
  const searchParams = new URLSearchParams(reqUrl.searchParams);

  // Remove any client key parameter if passed, substitute with server secret key
  searchParams.set('key', serverKey);

  // Construct target Google Maps URL
  let targetUrl = `https://maps.googleapis.com/maps/api/${pathStr}?${searchParams.toString()}`;
  if (pathStr.startsWith('$rpc') || pathStr.startsWith('mapsjs') || pathStr.startsWith('gen_204')) {
    targetUrl = `https://maps.googleapis.com/${pathStr}?${searchParams.toString()}`;
  }

  const outboundHeaders = new Headers();
  req.headers.forEach((val, key) => {
    const lowerKey = key.toLowerCase();
    if (!['host', 'connection', 'content-length', 'origin', 'referer'].includes(lowerKey)) {
      outboundHeaders.set(key, val);
    }
  });

  const clientReferer = req.headers.get('referer') || req.headers.get('origin') || 'https://pages-bff.vercel.app/';
  outboundHeaders.set('x-goog-api-key', serverKey);
  outboundHeaders.set('referer', clientReferer);
  if (!outboundHeaders.has('user-agent')) {
    outboundHeaders.set('user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
  }

  try {
    const bodyData = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer();
    const googleRes = await fetch(targetUrl, {
      method: req.method,
      headers: outboundHeaders,
      body: bodyData,
    });

    const cors = corsHeadersForRequest(req);
    const responseHeaders = new Headers(cors);

    googleRes.headers.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (!['content-encoding', 'transfer-encoding', 'content-length', 'x-goog-api-key'].includes(lowerKey)) {
        responseHeaders.set(key, val);
      }
    });

    let dataBuffer: ArrayBuffer | string = await googleRes.arrayBuffer();

    // If JavaScript file, dynamically rewrite maps.googleapis.com to pages-bff proxy URL
    const contentType = googleRes.headers.get('content-type') || '';
    if (contentType.includes('javascript') || contentType.includes('json')) {
      const decoder = new TextDecoder('utf-8');
      let code = decoder.decode(dataBuffer);

      const bffProxyBase = `${reqUrl.origin}/api/maps/proxy`;
      code = code.replace(/https:\/\/maps\.googleapis\.com\/maps\/api/g, bffProxyBase);
      code = code.replace(/https:\/\/maps\.googleapis\.com/g, bffProxyBase);

      dataBuffer = code;
    }

    return new Response(dataBuffer, {
      status: googleRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error('[maps-proxy] Proxying error:', err);
    return Response.json(
      { error: 'Google Maps Proxy error' },
      { status: 500, headers: corsHeadersForRequest(req) }
    );
  }
}
