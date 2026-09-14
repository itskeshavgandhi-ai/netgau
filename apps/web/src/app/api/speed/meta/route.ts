export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Geo {
  ip?: string;
  isp?: string;
  location?: string;
  country?: string;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const geoCache = new Map<string, { at: number; geo: Geo }>();

function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  const candidates = [
    forwarded?.split(',')[0]?.trim(),
    request.headers.get('x-real-ip') ?? undefined,
    request.headers.get('cf-connecting-ip') ?? undefined,
    request.headers.get('x-vercel-forwarded-for') ?? undefined,
  ];
  return candidates.find((c) => c && c.length > 0 && c !== 'unknown');
}

function isPrivateIp(ip?: string): boolean {
  if (!ip) return true;
  return (
    ip === '::1' ||
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    ip.startsWith('fe80')
  );
}

/** Best-effort ISP lookup. Never fails the request: offline deployments get `{}`. */
async function lookupGeo(ip?: string): Promise<Geo> {
  if (isPrivateIp(ip)) return {};
  const cached = geoCache.get(ip!);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.geo;

  try {
    const res = await fetch(`https://ipwho.is/${ip}`, {
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
    });
    if (!res.ok) return {};
    const json = (await res.json()) as {
      connection?: { isp?: string; org?: string };
      city?: string;
      region?: string;
      country?: string;
      country_code?: string;
    };
    const geo: Geo = {
      ip,
      isp: json.connection?.isp ?? json.connection?.org,
      country: json.country_code ?? json.country,
      location: [json.city, json.region].filter(Boolean).join(', ') || undefined,
    };
    geoCache.set(ip!, { at: Date.now(), geo });
    return geo;
  } catch {
    return {};
  }
}


const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
} as const;

/** The desktop app measures against this API cross-origin. */
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, 'cache-control': 'no-store' } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ip = clientIp(request);
  const geo = await lookupGeo(ip);
  const name = process.env.NETGAUGE_SERVER_NAME ?? 'NetGauge Edge';
  const location = process.env.NETGAUGE_SERVER_LOCATION ?? geo.location;

  return Response.json(
    {
      baseUrl: '',
      host: url.host,
      name,
      location,
      country: geo.country,
      ip: geo.ip ?? ip ?? 'hidden',
      isp: geo.isp,
      serverTime: Date.now(),
    },
    { headers: { 'cache-control': 'no-store', 'content-type': 'application/json', ...CORS } },
  );
}
