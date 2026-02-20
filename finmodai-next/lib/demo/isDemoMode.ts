import { getDemoModeFromContext } from '@/lib/demo/demoContext';

type SearchParamsLike = {
  get?: (key: string) => string | null;
} | null | undefined;

const DEMO_ENV_ENABLED =
  String(process.env.DEMO_MODE || '').toLowerCase() === 'true' ||
  String(process.env.NEXT_PUBLIC_DEMO_MODE || '').toLowerCase() === 'true';

function isQueryDemoEnabled(searchParams?: SearchParamsLike): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  if (!searchParams?.get) return false;
  const flag = searchParams.get('demo') ?? searchParams.get('demo_mode');
  return flag === 'true' || flag === '1';
}

export function isDemoMode(searchParams?: SearchParamsLike): boolean {
  const contextOverride = getDemoModeFromContext();
  if (typeof contextOverride === 'boolean') return contextOverride;
  if (DEMO_ENV_ENABLED) return true;
  if (typeof window !== 'undefined') {
    return isQueryDemoEnabled(searchParams ?? new URLSearchParams(window.location.search));
  }
  return isQueryDemoEnabled(searchParams);
}

export function isDemoModeFromRequest(req: Request): boolean {
  if (DEMO_ENV_ENABLED) return true;
  if (process.env.NODE_ENV !== 'development') return false;
  const url = new URL(req.url);
  const flag = url.searchParams.get('demo') ?? url.searchParams.get('demo_mode');
  return flag === 'true' || flag === '1';
}

export function assertDemoModeAllowed(): void {
  if (DEMO_ENV_ENABLED && process.env.NODE_ENV === 'production') {
    const allow = String(process.env.ALLOW_DEMO_IN_PROD || '').toLowerCase() === 'true';
    if (!allow) {
      console.warn(
        '[demo] Demo mode is enabled in production without ALLOW_DEMO_IN_PROD=true. Set ALLOW_DEMO_IN_PROD=true in Vercel env if you intend to use demo in prod.'
      );
    }
  }
}
