export interface UrlLike {
  host: string;
  path: string;
}

export interface LinkLike {
  link?: string | null;
}

export function normalizeUrl(raw: string | null | undefined): UrlLike | null {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  if (!value || value.length > 2000) return null;
  if (value.startsWith('//')) value = 'https:' + value;
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = 'https://' + value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.$/, '');
  if (!host) return null;
  const path =
    url.pathname
      .toLowerCase()
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/, '') || '/';
  return { host, path };
}

/**
 * Indica si `a` y `b` son el mismo host o uno es subdominio del otro.
 * Se exige que el host "base" tenga al menos 2 etiquetas (dominio registrable)
 * para no expandir la coincidencia a TLDs ni a dominios arbitrarios.
 */
function hostSubdomainOrEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (b.endsWith('.' + a) && a.split('.').length >= 2) return true; // b es subdominio de a
  if (a.endsWith('.' + b) && b.split('.').length >= 2) return true; // a es subdominio de b
  return false;
}

export function matchColegio<T extends LinkLike>(
  items: T[],
  pageUrl: string | null | undefined,
): T | null {
  const page = normalizeUrl(pageUrl);
  if (!page) return null;

  const normalized: Array<{
    item: T;
    host: string;
    path: string;
    exactHost: boolean;
  }> = [];
  for (const item of items) {
    const link = normalizeUrl(item.link);
    if (link)
      normalized.push({
        item,
        host: link.host,
        path: link.path,
        exactHost: link.host === page.host,
      });
  }

  // Candidatos por host: coincidencia exacta o relación de subdominio.
  const byHost = normalized.filter((n) =>
    hostSubdomainOrEqual(n.host, page.host),
  );
  if (byHost.length === 0) return null;

  // Prioridad: host exacto primero y luego los subdominios más específicos.
  const exactHost = byHost.filter((n) => n.exactHost);
  const subdomains = byHost
    .filter((n) => !n.exactHost)
    .sort((a, b) => b.host.length - a.host.length);
  const pool = [...exactHost, ...subdomains];

  const exact = pool.find((n) => n.path === page.path);
  if (exact) return exact.item;

  const prefix = pool.find(
    (n) => n.path !== '/' && page.path.startsWith(n.path + '/'),
  );
  if (prefix) return prefix.item;

  const hostOnly = pool.find((n) => n.path === '/');
  if (hostOnly) return hostOnly.item;

  if (pool.length === 1) return pool[0].item;

  return null;
}
