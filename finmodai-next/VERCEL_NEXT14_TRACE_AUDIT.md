# Vercel + Next.js 14 trace audit

Audit for missing `.next/server` trace artifacts, route-group build inconsistencies, and Linux (Vercel) vs macOS (local) tracing issues.

---

## 1. next.config.mjs

### Checked

| Item | Status | Notes |
|------|--------|--------|
| `output: "standalone"` | **Not set** | Correct for Vercel. Standalone is for self-hosted Node/Docker and can change where trace runs; Vercel uses default output. |
| `outputFileTracingIncludes` / `outputFileTracingExcludes` | **Not set** | Default tracing is used. No custom includes/excludes that could drop route manifests. |
| `experimental.serverActions` | Set | `allowedOrigins` only; does not affect client-reference manifest generation. |
| `experimental.serverSourceMaps` | Set | Dev stack traces only; does not affect build trace. |
| Other experimental flags | None | No `turbotrace`, `outputFileTracingRoot`, etc. |

### Verdict

**Config is safe.** No options that would cause Next.js to skip emitting `page_client-reference-manifest.js` or other route-group trace artifacts.

---

## 2. Route groups: (marketing) and (app)

### Casing

- Route group folders are `(marketing)` and `(app)` — lowercase, consistent.
- No mixed-case variants (e.g. `(Marketing)`) that could behave differently on case-sensitive Linux (Vercel) vs case-insensitive macOS.

### Client/server boundaries

| Route group | Layout | Page (e.g. root page) | Client ref manifest risk |
|-------------|--------|------------------------|---------------------------|
| **(marketing)** | Server layout + `MarketingLayoutClient` | Server page + `MarketingClient` | **Mitigated** — both layout and page have a client component so `layout_` and `page_` client-reference manifests are emitted. |
| **(app)** | Server layout wrapping `AuthGate` + `ConsoleShell` (client components) | Server pages under layout | **None** — layout tree has client components, so segment has client refs. |

### Page exports

- `(marketing)/page.tsx`: single default export (async server component). No unsupported or ambiguous exports.
- Root `app/page.tsx`: default export that redirects; valid.
- No `generateStaticParams` or other exports that would change static vs dynamic behavior for the marketing route in a way that skips manifest emission.

### Verdict

**Route groups are consistent and hardened.** (marketing) was the only segment at risk; it now has explicit client components in both layout and page so Next.js emits the client-reference manifests. (app) has client boundaries in the layout.

---

## 3. Plugins and instrumentation

### Sentry (`withSentryConfig`)

- **Role:** Wraps Next config; adds source maps, uploads, and Vercel monitors.
- **Options in use:** `widenClientFileUpload`, `tunnelRoute: '/monitoring'`, `automaticVercelMonitors`, `disableLogger`.
- **Risk:** Low. Sentry’s plugin does not remove or alter Next’s `.next/server/app/...` route manifests. It can add build steps and upload more client files; it does not control whether Next emits `page_client-reference-manifest.js` for a given route.
- **If issues persist:** Temporarily export raw `nextConfig` (without `withSentryConfig`) and redeploy to confirm build/trace succeeds; that would isolate Sentry as a factor. Do not disable Sentry long-term without need.

### instrumentation.ts

- **Role:** Runs `register()` at Node startup; initializes Sentry.
- **Risk:** None for trace artifacts. Does not modify filesystem or Next build output. Runs in the same process that serves the app; does not change which files Next writes under `.next/server`.

### Verdict

**No config or plugin that would remove or prevent generation of the missing manifest.** Sentry and instrumentation are safe for this class of ENOENT.

---

## 4. Linux (Vercel) vs macOS (local)

- **Case sensitivity:** No path or import casing mismatches found; route groups and imports use consistent lowercase.
- **Manifest path:** `.next/server/app/(marketing)/page_client-reference-manifest.js` is produced by Next’s webpack/build, not by a separate OS-dependent trace step. The ENOENT was due to Next not emitting the file when the page had no meaningful client boundary (since fixed with client components).
- **Vercel trace step:** Runs after `next build` and expects the manifest files Next has already written. No config found that would cause Next to write different artifacts on Vercel vs locally.

### Verdict

**No platform-specific config change needed.** The fix is ensuring the (marketing) segment has client components so Next emits the manifest on all platforms.

---

## 5. Summary and recommendations

| Area | Risk | Action |
|------|------|--------|
| next.config.mjs | None | No change. |
| Route groups (marketing) | Mitigated | Already hardened with `MarketingClient` and `MarketingLayoutClient`. |
| Route groups (app) | None | Layout has client components. |
| Sentry | Low | Keep as-is; only consider temporary bypass if ENOENT recurs after other fixes. |
| instrumentation | None | No change. |
| Linux vs macOS | None | No config change. |

**Smallest possible fix already applied:** Add client components to (marketing) page and layout so Next.js always emits `page_client-reference-manifest.js` and `layout_client-reference-manifest.js` for that route group. No further config changes are required for the missing manifest error.

**Optional hardening:** If you ever see ENOENT for another route group, add a minimal client component (e.g. a `'use client'` component that renders `<span aria-hidden="true" className="sr-only" />`) to that segment’s page or layout so the client-reference manifest is always generated.
