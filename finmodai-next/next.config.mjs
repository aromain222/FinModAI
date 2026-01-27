import { withSentryConfig } from '@sentry/nextjs';

const isProd = process.env.NODE_ENV === 'production';

const cleanEnvValue = (value) => {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return '';
  return trimmed;
};

const resolveAssetPrefix = () => {
  if (!isProd) return '';
  const raw =
    cleanEnvValue(process.env.NEXT_PUBLIC_ASSET_PREFIX) ||
    cleanEnvValue(process.env.ASSET_PREFIX) ||
    cleanEnvValue(process.env.CDN_URL);
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
};

const resolveBasePath = () => {
  if (!isProd) return '';
  const raw =
    cleanEnvValue(process.env.NEXT_PUBLIC_BASE_PATH) ||
    cleanEnvValue(process.env.BASE_PATH);
  if (!raw) return '';
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`;
  const normalized = prefixed.replace(/\/+$/, '');
  return normalized === '' || normalized === '/' ? '' : normalized;
};

const assetPrefix = resolveAssetPrefix();
const basePath = resolveBasePath();

const nextConfig = {
  reactStrictMode: true,

  ...(assetPrefix ? { assetPrefix } : {}),
  ...(basePath ? { basePath } : {}),

  // ✅ makes “find code path” easy (real files/lines)
  productionBrowserSourceMaps: true,

  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  experimental: {
    // ✅ don’t randomly break when you run on 3001
    serverActions: { allowedOrigins: ['localhost:3000', 'localhost:3001'] },

    // ✅ better server-side stack traces in dev
    serverSourceMaps: true,
  },
};

export default withSentryConfig(
  nextConfig,
  {
    org: 'capitalbase',
    project: 'javascript-nextjs',
    silent: !process.env.CI,
    widenClientFileUpload: true,
  },
  {
    tunnelRoute: '/monitoring',
    automaticVercelMonitors: true,

    // ✅ strips Sentry logger noise without relying on treeshake options
    disableLogger: true,
  }
);
