# CapitalBase Design System

## Color Palette

### Primary Colors
- **Emerald (Green)**: `#10b981` - CTAs, positive values, success states
- **Black**: `#000000` - Primary background
- **Slate/Navy**: `#0f172a`, `#1e293b` - Secondary backgrounds, cards
- **White**: `#ffffff` - Primary text (high contrast)

### Semantic Colors
- **Positive**: `emerald-400` (#34d399) - Gains, bullish, success
- **Negative**: `rose-400` (#fb7185) - Losses, bearish, errors
- **Neutral**: `blue-400` (#60a5fa) - Analytics, informational
- **Warning**: `amber-400` (#fbbf24) - Caution, pending states

### Grayscale
- **Text Primary**: `white` - Headings, important data
- **Text Secondary**: `slate-300` (#cbd5e1) - Body text
- **Text Muted**: `slate-400` (#94a3b8) - Labels, metadata
- **Text Disabled**: `slate-500` (#64748b) - Disabled states

### Borders & Surfaces
- **Border Subtle**: `white/5` (rgba(255,255,255,0.05))
- **Border Default**: `white/10` (rgba(255,255,255,0.1))
- **Border Accent**: `emerald-500/30`
- **Surface**: `slate-950/60` with backdrop-blur
- **Surface Hover**: `slate-900/60`

---

## Typography

### Font Stack
```css
font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Hierarchy
- **H1 (Page Title)**: `text-4xl font-bold text-white`
- **H2 (Section)**: `text-2xl font-semibold text-white`
- **H3 (Card Title)**: `text-lg font-semibold text-white`
- **H4 (Subsection)**: `text-base font-semibold text-white`
- **Body**: `text-sm text-slate-300`
- **Body Small**: `text-xs text-slate-400`
- **Label**: `text-xs uppercase tracking-wide text-slate-500 font-semibold`

---

## Components

### Card
```tsx
className="bg-slate-950/60 border border-white/5 backdrop-blur-sm rounded-2xl p-6"
```

### Button Primary (CTA)
```tsx
className="bg-emerald-500 text-black font-medium px-4 py-2 rounded-lg hover:bg-emerald-400 transition-colors"
```

### Button Secondary
```tsx
className="bg-slate-900/60 border border-white/5 text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-800/60 hover:text-white transition-colors"
```

### Button Ghost
```tsx
className="text-slate-400 hover:text-white hover:bg-slate-900/40 px-3 py-2 rounded-lg transition-colors"
```

### Input
```tsx
className="bg-slate-950/60 border border-white/5 text-white placeholder:text-slate-500 px-4 py-2 rounded-lg focus:border-emerald-500/50 focus:outline-none"
```

### Badge (Live Data)
```tsx
className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-medium"
```

### Badge (Demo)
```tsx
className="bg-slate-700/50 text-slate-300 border border-slate-600/30 px-3 py-1 rounded-full text-xs font-medium"
```

---

## Layouts

### Page Container
```tsx
<div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black">
  <div className="max-w-7xl mx-auto px-6 py-12 space-y-8">
    {/* Content */}
  </div>
</div>
```

### Grid (3 columns)
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Cards */}
</div>
```

### Flex Row (Header)
```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-4xl font-bold text-white">Title</h1>
    <p className="text-slate-400 text-lg mt-2">Description</p>
  </div>
  <div className="flex items-center gap-3">
    {/* Actions */}
  </div>
</div>
```

---

## Spacing

- **Section Gap**: `space-y-8` (32px)
- **Card Gap**: `space-y-4` (16px)
- **Inline Gap**: `gap-3` (12px)
- **Tight Gap**: `gap-2` (8px)
- **Padding Card**: `p-6` (24px)
- **Padding Button**: `px-4 py-2` (16px, 8px)

---

## Animations

### Transitions
```css
transition-all duration-200 ease-in-out
```

### Hover States
- Cards: `hover:border-white/10`
- Buttons: `hover:bg-emerald-400`
- Links: `hover:text-white`

### Loading Spinner
```tsx
<div className="h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
```

### Pulse (Live indicator)
```tsx
<span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
```

---

## Charts (Recharts)

### Theme
```tsx
<ResponsiveContainer width="100%" height={400}>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
    <XAxis stroke="#64748b" tick={{ fill: '#94a3b8' }} />
    <YAxis stroke="#64748b" tick={{ fill: '#94a3b8' }} />
    <Tooltip
      contentStyle={{
        backgroundColor: '#0f172a',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        color: '#fff',
      }}
    />
    <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} />
  </LineChart>
</ResponsiveContainer>
```

---

## Data Display

### KPI Card
```tsx
<div className="bg-slate-950/60 border border-white/5 rounded-2xl p-5">
  <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
    Label
  </div>
  <div className="text-2xl font-bold text-white mb-1">
    $123.45
  </div>
  <div className="flex items-center gap-1.5 text-sm text-emerald-400">
    <TrendingUp className="h-4 w-4" />
    +5.2%
  </div>
</div>
```

### Table Row
```tsx
<div className="flex items-center justify-between py-3 border-b border-white/5">
  <div className="text-sm text-white">Label</div>
  <div className="text-sm font-semibold text-slate-300">Value</div>
</div>
```

---

## Empty States

```tsx
<div className="flex flex-col items-center justify-center py-20 bg-slate-950/60 border border-white/5 rounded-2xl">
  <Icon className="h-12 w-12 text-slate-600 mb-4" />
  <h3 className="text-xl font-semibold text-white mb-2">Title</h3>
  <p className="text-slate-400 max-w-md text-center">Description</p>
</div>
```

---

## Error States

```tsx
<div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6">
  <div className="flex items-center gap-2 text-rose-400 mb-2">
    <AlertTriangle className="h-5 w-5" />
    <h3 className="font-semibold">Error Title</h3>
  </div>
  <p className="text-slate-400 text-sm">Error message</p>
</div>
```

---

## Success States

```tsx
<div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6">
  <div className="flex items-center gap-2 text-emerald-400 mb-2">
    <CheckCircle className="h-5 w-5" />
    <h3 className="font-semibold">Success Title</h3>
  </div>
  <p className="text-slate-400 text-sm">Success message</p>
</div>
```

---

## Tailwind Config Extensions

Add to `tailwind.config.js`:

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        'cb-emerald': '#10b981',
        'cb-navy': '#0f172a',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
}
```

