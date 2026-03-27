type ProxyHealth = {
  failures: number;
  cooldownUntil: number;
};

const proxyHealthMap = new Map<string, ProxyHealth>();
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

function isProxyEnabled(): boolean {
  const raw = (process.env.PROXY_ENABLED ?? 'true').trim().toLowerCase();
  return !['false', '0', 'no', 'off'].includes(raw);
}

function parseProxyUrlsFromEnv(): string[] {
  if (!isProxyEnabled()) return [];

  const pooled = process.env.WEBSHARE_PROXY_URLS;

  if (pooled) {
    return pooled
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
}

function getCooldownMs(): number {
  const raw = Number(process.env.WEBSHARE_PROXY_FAILURE_COOLDOWN_MS ?? '');
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_COOLDOWN_MS;
}

export function getProxyRetryCount(): number {
  const raw = Number(process.env.WEBSHARE_PROXY_RETRY_COUNT ?? '');
  if (!Number.isFinite(raw) || raw < 0) return 2;
  return Math.floor(raw);
}

export function pickRandomProxy(excluded = new Set<string>()): string {
  const urls = parseProxyUrlsFromEnv();
  if (urls.length === 0) return '';

  const now = Date.now();
  const alive = urls.filter((url) => {
    if (excluded.has(url)) return false;
    const health = proxyHealthMap.get(url);
    return !health || health.cooldownUntil <= now;
  });

  const fallback = urls.filter((url) => !excluded.has(url));
  const pool = alive.length > 0 ? alive : fallback;
  if (pool.length === 0) return '';

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

export function markProxyFailure(proxyUrl: string): void {
  if (!proxyUrl) return;

  const previous = proxyHealthMap.get(proxyUrl) ?? {
    failures: 0,
    cooldownUntil: 0,
  };

  const failures = previous.failures + 1;
  const cooldownMs = getCooldownMs();
  proxyHealthMap.set(proxyUrl, {
    failures,
    cooldownUntil: Date.now() + cooldownMs,
  });
}

export function markProxySuccess(proxyUrl: string): void {
  if (!proxyUrl) return;
  proxyHealthMap.delete(proxyUrl);
}
