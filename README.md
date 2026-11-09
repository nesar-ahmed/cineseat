# CineSeat 🎬🎟️

Offline-first movie ticket booking platform — a full-stack learning project built with
**NestJS**, **Next.js**, and **SQLite** in an **npm workspaces + Turborepo** monorepo.
It runs on one computer with no internet at runtime: no Docker, no email, no third-party services.

> "Cine" is the cinema; "Seat" is the hard problem: **one seat, one buyer, at any moment.**

## Features (roadmap, built phase by phase)

- Auth with JWT in an httpOnly cookie, roles (`USER` / `ADMIN`), profile + avatar
- Movies, theaters, screens, shows with search, filters, pagination
- Live seat map (Available / Selected / Held / Booked), 5-minute holds, max 6 seats
- Checkout with coupons, mock payment gateway, idempotent webhook, QR + PDF ticket
- My bookings, cancellation with refund rule, wishlist, reviews (verified viewers only)
- In-app notification center, Socket.IO live seats, cron jobs (hold expiry, reminders)
- Admin panel: catalog CRUD, dashboard, reports with CSV export, audit log, check-in

## Tech stack (pinned in phase 0)

| Layer     | Choice                                                              |
| --------- | ------------------------------------------------------------------- |
| Monorepo  | npm workspaces + Turborepo 2.11                                     |
| Frontend  | Next.js 16 (App Router) + Tailwind CSS v3.4, React 19               |
| Backend   | NestJS 12 (Socket.IO + `@nestjs/schedule` land in later phases)     |
| DB / ORM  | Prisma 6.19 + SQLite (single file, WAL mode)                        |
| Sharing   | Zod 4 schemas + types in `@cineseat/shared` (tsup: CJS + ESM + dts) |
| Language  | TypeScript 6 (TS 7 still lacks support in the Nest/ts-jest chain)   |
| Quality   | ESLint 9 flat config (shared preset), Prettier                      |

TanStack Query, react-hook-form, Socket.IO, `qrcode`/`pdfkit` etc. are added when the
phase that needs them starts — phase 0 is the running skeleton only.

## Repository hygiene (what is never pushed to GitHub)

`node_modules/`, `.turbo/`, `.next/`, `dist/`, `coverage/`, the SQLite file
`apps/api/prisma/dev.db*` (including `-wal`/`-shm`), `apps/api/uploads/*`, and **all**
`.env` files — only `.env.example` files are committed. CI/CD (`.github/` workflows) is
intentionally left out for now and will be added later.


## Prerequisites

- Node.js `24` (see `.nvmrc`), npm `11` (see `packageManager` field)
- For offline use: run `npm install` and `npx prisma generate` once while online

## Setup

```bash
npm run setup   # once: install deps, create SQLite file, run migrations, seed data
npm run dev     # every day: starts API (:4000), web (:3000), and the shared watch build
```

- Web app: http://localhost:3000
- API health: http://localhost:4000/health

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
  web/            # @cineseat/web    — Next.js frontend (port 3000)
packages/
  shared/         # @cineseat/shared — Zod schemas, inferred types, enums (tsup)
  eslint-config/  # shared flat ESLint config
  tsconfig/       # shared tsconfig bases (base / nestjs / nextjs)
```

Both apps import from `@cineseat/shared` and never from each other.

## Useful scripts (root)

| Script               | What it does                                  |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Turbo: shared watch build + both dev servers  |
| `npm run build`      | Build everything (cache-aware)                |
| `npm run lint`       | ESLint across workspaces                      |
| `npm run test`       | Jest / placeholders per workspace             |
| `npm run db:migrate` | `prisma migrate dev` for `@cineseat/api`      |
| `npm run db:seed`    | Idempotent demo seed                          |
| `npm run setup`      | install + migrate + seed                      |

## Environment

Copy the examples if you need to change defaults:

- `apps/api/.env.example` → `apps/api/.env` (`PORT`, `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN`, `HOLD_MINUTES`, ...)
- `apps/web/.env.example` → `apps/web/.env.local` (`NEXT_PUBLIC_API_URL`)

Never commit real `.env` files.

## Build phases

Phase 0 (setup) is **done**: monorepo scaffolded, Prisma + SQLite migrated and seeded,
`npm run dev` starts API (:4000) and web (:3000), shared types build on watch,
lint/typecheck/test pipelines green, initial git history recorded.
Next phases per `CineSeat Complete Project Guideline.md`: **1** Auth → **2** Catalog →
**3** Seats and holds → **4** Checkout → **5** User panel → **6** Engagement →
**7** Real time → **8** Admin analytics → **9** Hardening.
GitHub Actions/CI and anything else cosmetic will be added later, phase by phase.

## License

MIT — see [LICENSE](./LICENSE).
