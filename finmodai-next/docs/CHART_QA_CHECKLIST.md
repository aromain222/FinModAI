# Chart Visual QA Checklist

Use this to verify demo and production charts look smooth, readable, and non-misleading.

## Line smoothing

- [ ] Lines use **monotone** curve (Recharts `type="monotone"`) — no jagged joins.
- [ ] **strokeWidth** 2–2.5; no hair-thin lines.
- [ ] **dot={false}** by default; **activeDot** visible on hover.
- [ ] No harsh point markers on every data point (reduces noise).

## Axis + tooltips

- [ ] **Y-axis**: Formatted for data type — currency ($1.2K / $1.2M / $1.2B), percent (24.6%), or plain number with commas.
- [ ] **Y-domain**: Padding (e.g. 5% headroom) so line doesn’t touch top/bottom.
- [ ] **Tick count**: ~5–7 ticks; not overcrowded.
- [ ] **Tooltip**: Metric name, formatted value, date/year; in demo with interpolation, “Actual” vs “Interpolated (demo)” shown.

## Demo display interpolation (optional)

- [ ] Interpolation is **display-only**; stored/calculated numbers unchanged.
- [ ] **Footnote** when interpolation is used: “Demo display may use interpolation for readability.”
- [ ] Tooltip distinguishes “Actual” vs “Interpolated (demo)” where applicable.

## Consistency

- [ ] **FinanceChart** wrapper (or same margin/typography) used across charts.
- [ ] Same tooltip content style (e.g. dark panel, 12px).
- [ ] Same axis stroke color and tick font size.

## Performance + mobile

- [ ] Charts render without lag on mobile viewport.
- [ ] ResponsiveContainer width 100%; no horizontal overflow.
- [ ] Touch: tooltip or activeDot usable on tap.

## Non-misleading

- [ ] No “—” in numeric tooltip when value is null; use “—” or blank only for truly missing data.
- [ ] Interpolation never implied as “real data”; footnote or label when used.
- [ ] Data gaps (e.g. weekends) not filled with fake points unless explicitly “demo interpolation.”
