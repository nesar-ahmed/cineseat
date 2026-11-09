# CineSeat 🎬🎟️

**A production-grade movie ticket booking platform, built as a typed TypeScript monorepo.**
A layered NestJS API owns the domain — catalogs, shows, transactional seat holds, bookings,
payments and admin analytics; a Next.js frontend serves the public catalog, the live seat
map, the user dashboard and the admin panel. Turborepo drives every build, lint, typecheck
and test through one cached, composable pipeline.

The hard problem CineSeat is engineered around is booking integrity at scale:
**one seat, one buyer, at any moment.** Holds are taken with transactional conditional
updates plus unique constraints, live seat state is broadcast over WebSockets, and payment
webhooks are idempotent — the same patterns that large ticketing systems rely on.

> "Cine" is the cinema; "Seat" is the hard problem: **one seat, one buyer, at any moment.**

## Highlights

- ⚡ **Concurrency-safe seat holds** — `prisma.$transaction` + conditional `updateMany` + unique constraints; double booking is impossible by design
- 🔴 **Real-time UX** — Socket.IO gateway pushes seat-map and notification updates instantly
- 🏗️ **Production architecture** — thin controllers, service-layer business rules, global exception filter, JWT guards, role-based access, rate limiting, audit logging, health endpoint
- 🧩 **End-to-end type safety** — one Zod schema set (`@cineseat/shared`) validates every request server-side and types every response client-side
- 💳 **Complete booking lifecycle** — holds → checkout → coupons → mock payment + idempotent webhook → QR/PDF ticket → cancel & refund rules
- 🛠️ **One-command developer experience** — `npm run setup`, then `npm run dev`; Turborepo caching makes rebuilds nearly instant
- 📖 **Self-documented API** — OpenAPI 3 / Swagger UI served by the API itself at `/docs`

## Feature set (delivered phase by phase)

- Auth with JWT in an httpOnly cookie, roles (`USER` / `ADMIN`), profile + avatar
- Movies, theaters, screens, shows with search, filters, pagination
- Live seat map (Available / Selected / Held / Booked), 5-minute holds, max 6 seats
- Checkout with coupons, mock payment gateway, idempotent webhook, QR + PDF ticket
- My bookings, cancellation with refund rule, wishlist, reviews (verified viewers only)
- In-app notification center, Socket.IO live seats, cron jobs (hold expiry, reminders)
- Admin panel: catalog CRUD, dashboard, reports with CSV export, audit log, check-in

## Architecture

```
┌────────────────────────┐   REST + WebSocket   ┌─────────────────────────┐
│ Next.js (apps/web)     │ ───────────────────► │ NestJS (apps/api)       │
│ pages, seat map, admin │ ◄─────────────────── │ controller → service    │
└───────────┬────────────┘                      │ → Prisma, gateway, cron │
            │ imports                           └───────┬─────────┬───────┘
            ▼                                   imports │         │ reads/writes
   ┌─────────────────────┐ ◄────────────────────────────┘         ▼
   │ packages/shared     │                           ┌────────────────────┐
   │ Zod schemas + types │                           │ SQLite (dev.db)    │
   └─────────────────────┘                           │ + uploads/ on disk │
                                                      └────────────────────┘
```

Both apps import from `@cineseat/shared` and never from each other. The data layer keeps
all queries inside services, so migrating SQLite → PostgreSQL later is a provider-and-URL
change, not a rewrite.

## Tech stack

| Layer     | Choice                                                              |
| --------- | ------------------------------------------------------------------- |
| Monorepo  | npm workspaces + Turborepo 2.11                                     |
| Frontend  | Next.js 16 (App Router) + Tailwind CSS v3.4, React 19               |
| Backend   | NestJS 12 (Socket.IO + `@nestjs/schedule` land in later phases)     |
| DB / ORM  | Prisma 6.19 + SQLite (WAL mode; PostgreSQL-ready design)            |
| Sharing   | Zod 4 schemas + types in `@cineseat/shared` (tsup: CJS + ESM + dts) |
| Language  | TypeScript 6 (TS 7 still lacks support in the Nest/ts-jest chain)   |
| Quality   | ESLint 9 flat config (shared preset), Prettier                      |
| API docs  | `@nestjs/swagger` — OpenAPI 3 + Swagger UI at `/docs`               |

TanStack Query, react-hook-form, Socket.IO, `qrcode`/`pdfkit` etc. are added when the
phase that needs them starts — current status: **phase 0 complete**.

## Prerequisites

- Node.js `24` (see `.nvmrc`), npm `11` (see `packageManager` field)
- Network is needed only for the initial `npm install` and `npx prisma generate`

## Quick start

```bash
npm run setup   # once: install deps, create SQLite file, run migrations, seed data
npm run dev     # every day: starts API (:4000), web (:3000), and the shared watch build
```

- Web app: http://localhost:3000
- API health: http://localhost:4000/health
- Swagger UI (OpenAPI): http://localhost:4000/docs — raw JSON at `/docs/json`
  (assets are bundled and served by the API itself — no external dependencies)

One app only: `npm run dev -w @cineseat/api` or `npx turbo run dev --filter=@cineseat/web`.

### Default logins (after seeding)

| Role  | Email                | Password    |
| ----- | -------------------- | ----------- |
| ADMIN | `admin@cineseat.dev` | `Admin@123` |
| USER  | `rina@cineseat.dev`  | `User@123`  |

Other seeded users: `karim@`, `sadia@`, `tanvir@`, `mim@`cineseat.dev — same password.

## Repository structure

```
apps/
  api/            # @cineseat/api    — NestJS backend + Prisma + SQLite (port 4000)
    src/          # official Nest layout: one folder per feature module at the src root
      config/     #   typed env validation (Zod)
      common/     #   guards, filters, interceptors, decorators (phase 1+)
      database/   #   global DatabaseModule + PrismaService (WAL)
      health/     #   health module (GET /health)
      auth/ movies/ shows/ ...  #   feature modules arrive phase by phase
    prisma/       #   schema.prisma, migrations/, seed.ts, dev.db (git-ignored)
  web/            # @cineseat/web    — Next.js frontend (port 3000)
packages/
  shared/         # @cineseat/shared — Zod schemas, inferred types, enums (tsup)
  eslint-config/  # shared flat ESLint config
  tsconfig/       # shared tsconfig bases (base / nestjs / nextjs)
```

## Useful scripts (root)

| Script               | What it does                                  |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Turbo: shared watch build + both dev servers  |
| `npm run build`      | Build everything (cache-aware)                |
| `npm run lint`       | ESLint across workspaces                      |
| `npm run test`       | Jest / placeholders per workspace             |
| `npm run typecheck`  | Full TypeScript verification                  |
| `npm run db:migrate` | `prisma migrate dev` for `@cineseat/api`      |
| `npm run db:seed`    | Idempotent demo seed                          |
| `npm run setup`      | install + migrate + seed                      |

## Environment

Copy the examples if you need to change defaults:

- `apps/api/.env.example` → `apps/api/.env` (`PORT`, `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN`, `HOLD_MINUTES`, ...)
- `apps/web/.env.example` → `apps/web/.env.local` (`NEXT_PUBLIC_API_URL`)

Never commit real `.env` files.

## Repository hygiene (what is never pushed to GitHub)

`node_modules/`, `.turbo/`, `.next/`, `dist/`, `coverage/`, the SQLite file
`apps/api/prisma/dev.db*` (including `-wal`/`-shm`), `apps/api/uploads/*`, and **all**
`.env` files — only `.env.example` files are committed. CI/CD (`.github/` workflows) is
intentionally left out for now and will be added later.

## Development workflow

Small, focused commits with conventional messages (`feat:`, `fix:`, `chore:`, `refactor:`,
`docs:`), one branch per phase, a tag after each phase.

## Project status

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | Monorepo setup, Prisma + SQLite, seed, one-command dev | ✅ Done |
| 1 | Auth & profiles (JWT cookie, roles, guards) | ⏭️ Next |
| 2 | Catalog: movies, theaters, screens, shows | 🔜 Planned |
| 3 | Seats & holds (transactional, expiry cron) | 🔜 Planned |
| 4 | Checkout, coupons, mock payment, webhook | 🔜 Planned |
| 5 | User panel, cancel & refund, tickets | 🔜 Planned |
| 6 | Notifications, reviews & ratings | 🔜 Planned |
| 7 | Real-time seats & notifications (Socket.IO) | 🔜 Planned |
| 8 | Admin analytics, CSV reports, audit log, check-in | 🔜 Planned |
| 9 | Hardening: unit/API/E2E/load tests, rate limits | 🔜 Planned |

## License

MIT — see [LICENSE](./LICENSE).
