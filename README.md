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

## Tech stack

| Layer     | Choice                                                    |
| --------- | --------------------------------------------------------- |
| Monorepo  | npm workspaces + Turborepo                                |
| Frontend  | Next.js (App Router), Tailwind CSS v3, TanStack Query\*   |
| Backend   | NestJS, Socket.IO, `@nestjs/schedule`                     |
| DB / ORM  | Prisma + SQLite (single file, WAL mode)                   |
| Sharing   | Zod schemas + types in `@cineseat/shared`                 |

\* added when needed (phase 4 onward).

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

Phase 0 (setup) is done: monorepo, Prisma + SQLite, seed, both apps run with one command.
Next phases per `CineSeat Complete Project Guideline.md`: 1 Auth → 2 Catalog → 3 Seats and
holds → 4 Checkout → 5 User panel → 6 Engagement → 7 Real time → 8 Admin analytics → 9 Hardening.

## License

MIT — see [LICENSE](./LICENSE).
