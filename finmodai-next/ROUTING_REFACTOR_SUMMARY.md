# Routing Refactor Summary - Marketing vs App Layouts

## ✅ Completed

### 1. Route Groups Created

**Marketing Group (`app/(marketing)/`)**:
- `app/(marketing)/layout.tsx` - Minimal layout (no sidebar, no app shell)
- `app/(marketing)/page.tsx` - Marketing homepage with Hero, features, CTAs
- `app/(marketing)/login/page.tsx` - Login page with auth guard
- `app/(marketing)/signup/page.tsx` - Signup page with auth guard
- `app/(marketing)/guest/page.tsx` - Guest access page

**App Group (`app/(app)/`)**:
- `app/(app)/layout.tsx` - App layout with ConsoleShell (sidebar + topbar), requires auth
- `app/(app)/app/page.tsx` - Logged-in home page ("Analyst Home")
- All existing app routes moved into `(app)` group:
  - `dashboard/` (redirects to `/app`)
  - `models/`
  - `scenarios/`
  - `macro/`
  - `reports/`
  - `analyst-chat/`
  - `chat/`
  - `scenario-engine/`

### 2. Authentication Guards

**Marketing Routes**:
- `app/(marketing)/page.tsx` - Redirects to `/app` if authenticated
- `app/(marketing)/login/page.tsx` - Redirects to `/app` if authenticated
- `app/(marketing)/signup/page.tsx` - Redirects to `/app` if authenticated

**App Routes**:
- `app/(app)/layout.tsx` - Redirects to `/login` if NOT authenticated
- All routes under `(app)` are protected by this layout

### 3. Redirects Updated

- Login success: `/dashboard` → `/app`
- Guest access: `/dashboard` → `/app`
- Root page: Deleted (marketing page handles `/`)
- Dashboard page: Redirects to `/app` (legacy route support)

### 4. Navigation Updated

- Sidebar: `/dashboard` → `/app` (Overview link)
- All "Back to Dashboard" links: `/dashboard` → `/app`
- All "Home" links: `/dashboard` → `/app`

### 5. Files Removed

- `app/page.tsx` - Deleted (marketing page handles `/`)
- `app/login/page.tsx` - Deleted (moved to `(marketing)/login/`)
- `app/signup/page.tsx` - Deleted (moved to `(marketing)/signup/`)
- `app/(app)/dashboard/layout.tsx` - Deleted (redundant, parent layout provides ConsoleShell)

### 6. Files Moved

- `app/dashboard/` → `app/(app)/dashboard/`
- `app/models/` → `app/(app)/models/`
- `app/scenarios/` → `app/(app)/scenarios/`
- `app/macro/` → `app/(app)/macro/`
- `app/reports/` → `app/(app)/reports/`
- `app/report/` → `app/(app)/report/`
- `app/analyst-chat/` → `app/(app)/analyst-chat/`
- `app/chat/` → `app/(app)/chat/`
- `app/scenario-engine/` → `app/(app)/scenario-engine/`
- `app/guest/` → `app/(marketing)/guest/`

## Route Structure

```
app/
├── (marketing)/          # Public routes (no auth required)
│   ├── layout.tsx       # Minimal layout
│   ├── page.tsx         # / (marketing homepage)
│   ├── login/
│   │   └── page.tsx     # /login
│   ├── signup/
│   │   └── page.tsx     # /signup
│   └── guest/
│       └── page.tsx     # /guest
│
├── (app)/               # Authenticated routes (auth required)
│   ├── layout.tsx       # App layout with ConsoleShell
│   ├── app/
│   │   └── page.tsx     # /app (logged-in home)
│   ├── dashboard/       # /dashboard (redirects to /app)
│   ├── models/          # /models/*
│   ├── scenarios/       # /scenarios/*
│   ├── macro/           # /macro/*
│   ├── reports/         # /reports/*
│   └── ...
│
└── api/                 # API routes (unchanged)
```

## Authentication Flow

1. **Logged-out user visits `/`**:
   - Served by `app/(marketing)/page.tsx`
   - Shows marketing hero + features
   - No app UI

2. **Logged-out user visits `/app`**:
   - `app/(app)/layout.tsx` checks auth
   - No session → redirects to `/login`

3. **Logged-in user visits `/`**:
   - `app/(marketing)/page.tsx` checks auth
   - Has session → redirects to `/app`

4. **Logged-in user visits `/login` or `/signup`**:
   - Marketing route checks auth
   - Has session → redirects to `/app`

5. **Logged-in user visits `/app`**:
   - `app/(app)/layout.tsx` checks auth
   - Has session → renders `app/(app)/app/page.tsx` with ConsoleShell

## Key Changes

### Before
- Marketing hero and app UI could stack
- Root page had marketing content
- Login redirected to `/dashboard`
- No clear separation between public and authenticated routes

### After
- Marketing routes use `(marketing)` group with minimal layout
- App routes use `(app)` group with ConsoleShell layout
- Clear auth guards at layout level
- Login redirects to `/app`
- No possibility of stacking (different layouts)

## Testing Checklist

- [ ] `/` shows only marketing UI when logged out
- [ ] `/` redirects to `/app` when logged in
- [ ] `/app` shows only app UI when logged in
- [ ] `/app` redirects to `/login` when logged out
- [ ] `/login` redirects to `/app` when logged in
- [ ] `/signup` redirects to `/app` when logged in
- [ ] Login success redirects to `/app`
- [ ] No marketing components in app routes
- [ ] Sidebar navigation works correctly
- [ ] All "Back to Dashboard" links go to `/app`

## Notes

- Route groups `(marketing)` and `(app)` don't affect URLs
- `app/(marketing)/page.tsx` is served at `/`
- `app/(app)/app/page.tsx` is served at `/app`
- Layouts nest: `(app)/layout.tsx` wraps all `(app)` routes
- Auth checks are server-side in layouts for security
