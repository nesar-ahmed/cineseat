# components/ui

Small reusable primitives for the whole web app. Buttons, pills, chips, inputs and
selects are Tailwind component classes in `app/globals.css` (`.btn-primary`, `.pill`,
`.select`, `.glass`, …), not components, so they compose anywhere.

| File | Purpose |
| --- | --- |
| `icons.tsx` | Inline SVG icons (no icon package, no request); decorative, `currentColor` |
| `overlay.tsx` | Modal layer: portal, Escape, focus trap + restore, scroll lock — used by the catalog's mobile filters sheet |
| `dialog.tsx` | `Dialog` (centred panel, bottom sheet on phones; `md`, `lg`, `xl`) and `ConfirmDialog` (Cancel focused first, stays open while busy) on top of `Overlay` |
| `menu.tsx` | An action menu behind a button ("⋯"): portal with fixed positioning, arrow keys / Home / End / Escape, disabled items stay reachable with their reason |
| `section-heading.tsx` | Eyebrow + title + description + action slot shared by every section |

Site chrome (header, footer) lives in `components/layout/`.
