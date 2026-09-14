export const runtime = 'nodejs';
export const revalidate = 3600;

export interface ReleaseAsset {
  name: string;
  size: number;
  url: string;
  platform: 'windows' | 'macos' | 'linux' | 'other';
  kind: 'installer' | 'portable' | 'archive';
}

export interface ReleaseInfo {
  tag: string;
  publishedAt: string | null;
  assets: ReleaseAsset[];
  /** True when GitHub was unreachable and we returned the conventional asset names. */
  fallback: boolean;
}

const REPO = process.env.NETGAUGE_REPO ?? 'thekeshavgandhi-dev/netgauge-demo';

function classify(name: string): Pick<ReleaseAsset, 'platform' | 'kind'> | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.blockmap') || lower.endsWith('.yml') || lower.endsWith('.sig')) return null;

  let platform: ReleaseAsset['platform'] = 'other';
  if (lower.endsWith('.exe') || lower.endsWith('.msi')) platform = 'windows';
  else if (lower.endsWith('.dmg') || lower.endsWith('.pkg')) platform = 'macos';
  else if (lower.endsWith('.appimage') || lower.endsWith('.deb') || lower.endsWith('.rpm')) platform = 'linux';
  else if (lower.endsWith('.zip')) platform = lower.includes('win') ? 'windows' : 'other';
  else return null;

  let kind: ReleaseAsset['kind'] = 'archive';
  if (lower.includes('setup') || lower.endsWith('.msi') || lower.endsWith('.dmg') || lower.endsWith('.deb')) {
    kind = 'installer';
  } else if (lower.includes('portable') || lower.endsWith('.appimage')) {
    kind = 'portable';
  }
  return { platform, kind };
}

/** Asset names produced by the electron-builder config in apps/desktop. */
function fallbackAssets(): ReleaseAsset[] {
  const base = `https://github.com/${REPO}/releases/latest/download`;
  return [
    { name: 'NetGauge-Setup-0.1.0.exe', size: 0, url: `${base}/NetGauge-Setup-0.1.0.exe`, platform: 'windows', kind: 'installer' },
    { name: 'NetGauge-Portable-0.1.0.exe', size: 0, url: `${base}/NetGauge-Portable-0.1.0.exe`, platform: 'windows', kind: 'portable' },
  ];
}

export async function GET() {
  const payload: ReleaseInfo = {
    tag: 'v0.1.0',
    publishedAt: null,
    assets: fallbackAssets(),
    fallback: true,
  };

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return Response.json(payload, { headers: { 'cache-control': 'public, max-age=3600' } });

    const json = (await res.json()) as {
      tag_name?: string;
      published_at?: string;
      assets?: Array<{ name: string; size: number; browser_download_url: string }>;
    };

    const assets: ReleaseAsset[] = [];
    for (const asset of json.assets ?? []) {
      const kind = classify(asset.name);
      if (!kind) continue;
      assets.push({ name: asset.name, size: asset.size, url: asset.browser_download_url, ...kind });
    }

    return Response.json(
      {
        tag: json.tag_name ?? payload.tag,
        publishedAt: json.published_at ?? null,
        assets: assets.length > 0 ? assets : fallbackAssets(),
        fallback: assets.length === 0,
      } satisfies ReleaseInfo,
      { headers: { 'cache-control': 'public, max-age=3600' } },
    );
  } catch {
    return Response.json(payload, { headers: { 'cache-control': 'public, max-age=300' } });
  }
}
