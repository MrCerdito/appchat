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

  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!host) return null;
  const path = url.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return { host, path };
}

export function matchColegio<T extends LinkLike>(
  items: T[],
  pageUrl: string | null | undefined,
): T | null {
  const page = normalizeUrl(pageUrl);
  if (!page) return null;

  const normalized: Array<{ item: T; host: string; path: string }> = [];
  for (const item of items) {
    const link = normalizeUrl(item.link);
    if (link) normalized.push({ item, host: link.host, path: link.path });
  }

  const candidates = normalized.filter((n) => n.host === page.host);
  if (candidates.length === 0) return null;

  const exact = candidates.find((n) => n.path === page.path);
  if (exact) return exact.item;

  const prefix = candidates.find((n) => n.path !== '/' && page.path.startsWith(n.path + '/'));
  if (prefix) return prefix.item;

  const hostOnly = candidates.find((n) => n.path === '/');
  if (hostOnly) return hostOnly.item;

  if (candidates.length === 1) return candidates[0].item;

  return null;
}
