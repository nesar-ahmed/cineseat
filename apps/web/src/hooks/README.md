# hooks

Cross-feature React hooks.

| Hook | Purpose |
| --- | --- |
| `use-watchlist.ts` | Saved movies in localStorage (shared across components and tabs) until the wishlist API lands |
| `use-now.ts` | Current time after hydration only (`null` on the server), for time-dependent UI such as past showtimes |
| `use-hydrated.ts` | `false` on the server and while hydrating, `true` after — gates UI built only from client data (the movies catalog) |
