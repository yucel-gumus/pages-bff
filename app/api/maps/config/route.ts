import { NextRequest } from 'next/server';
import { corsPreflight, jsonWithCors } from '@/lib/gateway';

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

/**
 * Public Maps Config Endpoint for frontend clients.
 * Returns browser-scoped restricted Maps API Key.
 */
export async function GET(req: NextRequest) {
  const mapsKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_BROWSER_KEY ||
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    '';
  const mapId =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ||
    process.env.GOOGLE_MAPS_MAP_ID ||
    'DEMO_MAP_ID';

  return jsonWithCors(req, {
    success: true,
    mapsApiKey: mapsKey,
    mapId: mapId,
  });
}
