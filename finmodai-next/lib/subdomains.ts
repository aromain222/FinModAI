export const DEFAULT_SUBDOMAIN_ROUTES: Record<string, string> = {
  app: '/app',
  analyst: '/analyst-chat',
  demo: '/demo',
  waitlist: '/waitlist',
  macro: '/macro',
  market: '/market',
  models: '/model-generator',
  news: '/news',
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function stripPort(host: string): string {
  return host.replace(/:\d+$/, '').trim().toLowerCase();
}

export function getRootDomain(): string | null {
  const value = process.env.NEXT_PUBLIC_ROOT_DOMAIN || process.env.ROOT_DOMAIN || '';
  const normalized = stripPort(value);
  return normalized || null;
}

export function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(stripPort(host));
}

export function extractSubdomain(host: string, rootDomain = getRootDomain()): string | null {
  const normalized = stripPort(host);
  if (!normalized) return null;

  if (isLocalHost(normalized)) return null;

  if (normalized.endsWith('.localhost')) {
    const value = normalized.slice(0, -'.localhost'.length);
    return value || null;
  }

  if (rootDomain && normalized === rootDomain) return null;
  if (rootDomain && normalized.endsWith(`.${rootDomain}`)) {
    const value = normalized.slice(0, -(rootDomain.length + 1));
    return value || null;
  }

  const parts = normalized.split('.');
  if (parts.length <= 2) return null;
  return parts.slice(0, -2).join('.') || null;
}

export function getSubdomainPath(subdomain: string | null): string | null {
  if (!subdomain) return null;
  const key = subdomain.toLowerCase();
  if (key === 'www') return '/';
  return DEFAULT_SUBDOMAIN_ROUTES[key] ?? null;
}

export function getSubdomainHref(subdomain: string | null, path = ''): string {
  const normalizedPath = path.startsWith('/') || path === '' ? path : `/${path}`;
  const rootDomain = getRootDomain();

  if (!subdomain) {
    return normalizedPath || '/';
  }

  if (!rootDomain) {
    return getSubdomainPath(subdomain) || normalizedPath || '/';
  }

  return `https://${subdomain}.${rootDomain}${normalizedPath}`;
}

export function shouldBypassSubdomainRouting(pathname: string): boolean {
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/assets')
  ) {
    return true;
  }

  return /\.[a-z0-9]+$/i.test(pathname);
}
