# CineSeat: Complete Project Guideline

CineSeat is an offline-first movie ticket booking platform, built as a full-stack learning project with **NestJS**, **Next.js**, and **SQLite** in an **npm workspaces + Turborepo** monorepo. It runs on one computer with no internet at runtime, no Docker, no email, and no third-party services.

## 1. Project name and goals

**Name: CineSeat.** "Cine" is the cinema; "Seat" is the hard problem the project teaches: one seat, one buyer, at any moment. Package scope: `@cineseat/*`.

**Learning goals**

- Model a real domain with relational data and transactions
- Handle concurrency safely (two users, one seat)
- Build real-time UI with WebSockets
- Design a layered, production-style NestJS backend
- Share types and validation between backend and frontend
- Run a monorepo with one command

**Constraints**

- Fully offline at runtime (install dependencies once beforehand)
- No Docker, no email, no payment provider, no CDN assets, no external APIs
- Works on an older Chrome version (set a `browserslist` target; use Tailwind v3)
- Package manager is **npm**

**Offline replacements**

| Normally | In CineSeat |
| --- | --- |
| Email | In-app notification center and printable ticket page |
| Payment gateway | Mock gateway behind a `PaymentProvider` interface |
| Ticket service | Local QR (`qrcode`) and PDF (`pdfkit`) generation |
| Remote images and fonts | Posters on local disk, fonts via `next/font/local` |
| Password reset email | Admin-triggered reset, or a token shown on screen in dev mode |
| PostgreSQL, Redis, queues | SQLite file, `seat_holds` logic in the database, `@nestjs/schedule` cron |

## 2. Key features

### 2.1 Auth and profile

- Signup, login, logout with JWT in an httpOnly cookie
- Password hashing with argon2 or bcrypt
- Roles `USER` and `ADMIN`, enforced by guards
- Profile: name, phone, avatar (local upload), password change, preferred city and genres

### 2.2 Movies (the "products")

- List and detail pages: poster, genre, language, duration, cast, rating, trailer link
- Search, filters, sorting, pagination
- Tabs: Now Showing and Coming Soon
- Wishlist ("Want to watch")

### 2.3 Theaters, screens, and shows

- Theaters by city, each with screens and seat layouts
- Shows per movie with date selector, theater filter, language, format (2D/3D), and price tiers

### 2.4 Seat selection (the "cart")

- Seat map with four states: Available, Selected, Held, Booked
- Seat categories (Standard, Premium, Recliner) with different prices
- Maximum of 6 seats per booking
- 5-minute hold with a countdown timer and automatic expiry
- Live updates when another user takes a seat

### 2.5 Checkout

- Summary: movie, show, seats, price breakdown (base, tax, convenience fee)
- Coupon code field
- Mock payment page (success, failure, or timeout)
- Confirmation with booking ID and local QR ticket; print or download PDF

### 2.6 User panel

- My bookings: Upcoming, Past, Cancelled
- Ticket view with QR
- Cancel with a refund rule (full refund until 2 hours before the show)
- My reviews and wishlist
- Notification center

### 2.7 In-app notifications

- Booking confirmed, failed, cancelled and refunded
- Hold about to expire, show reminder (1 hour before)
- Admin announcements and new coupons
- Unread badge, mark as read, mark all as read

### 2.8 Reviews and ratings

- Star rating plus text
- Verified-viewer rule: only users with a completed booking for that movie can review
- Average rating on movie cards
- Edit or delete your own review; admin moderation

### 2.9 Admin panel

- Dashboard: bookings, revenue, occupancy rate, top movies
- CRUD: movies, theaters, screens, seat layouts, shows, coupons
- Manage users, bookings, and reviews
- Send announcements
- Reports by date range with CSV export (generated locally)
- Ticket check-in: enter or scan a booking code to mark it used

### 2.10 Platform features

- Pagination and consistent error format on every list and error
- Input validation on every endpoint
- Rate limiting on login and hold endpoints
- Audit log of admin actions
- Health endpoint (`GET /health`) and request logging

## 3. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Monorepo | **npm workspaces + Turborepo** | Built into npm, Turborepo adds one-command tasks and caching |
| Frontend | **Next.js** (App Router), Tailwind v3, TanStack Query, react-hook-form, Zustand | Server rendering for public pages, simple data fetching |
| Backend | **NestJS** | Modules, guards, DI, WebSocket gateways, scheduling |
| ORM and DB | **Prisma + SQLite** | Typed queries, migrations, no server to install |
| Auth | `@nestjs/jwt`, `passport-jwt`, argon2 | Standard JWT flow |
| Real time | **Socket.IO** through a Nest gateway | Live seat map and notifications |
| Jobs | `@nestjs/schedule` | Expire holds, send reminders |
| Files | `multer`, `qrcode`, `pdfkit` | Uploads, QR, PDF, all local |
| Validation | **Zod** in a shared package | One schema for client and server |
| Testing | Jest, Supertest, Playwright, autocannon | Unit, API, E2E, load |
| Tooling | TypeScript, ESLint, Prettier, `tsup`, Husky (optional) | Consistency and shared package builds |

**Offline setup:** run `npm install` once while online. Later installs can use `npm install --offline` from the npm cache, or copy the whole project folder including `node_modules` to the offline machine. Run `npx prisma generate` while online so the Prisma engine files are present.

## 4. Monorepo with npm workspaces and Turborepo

### 4.1 Folder structure

```
cineseat/
├── apps/
│   ├── api/                      # NestJS backend (@cineseat/api)
│   │   ├── src/                  # layout in section 5
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   ├── seed.ts
│   │   │   └── dev.db            # SQLite file (git-ignored)
│   │   ├── uploads/              # posters and avatars (git-ignored)
│   │   ├── test/                 # e2e tests
│   │   ├── .env.example
│   │   └── package.json
│   └── web/                      # Next.js frontend (@cineseat/web)
│       ├── src/                  # app/, features/, components/, lib/
│       ├── public/fonts/
│       ├── next.config.ts
│       ├── .env.example
│       └── package.json
├── packages/
│   ├── shared/                   # Zod schemas, inferred types, enums (@cineseat/shared)
│   │   ├── src/
│   │   └── package.json
│   ├── eslint-config/
│   └── tsconfig/                 # base tsconfig files
├── .gitignore
├── .nvmrc
├── LICENSE
├── README.md
├── package.json                  # workspace root
└── turbo.json
```

Both apps import from `packages/shared` and never from each other. npm needs no `pnpm-workspace.yaml`; the `workspaces` field in the root `package.json` does that job.

### 4.2 What goes in the root

| File | Purpose |
| --- | --- |
| `LICENSE` | Your license, for example MIT |
| `README.md` | Features, setup steps, run commands |
| `.gitignore` | `node_modules`, `.env`, `dist`, `.next`, `.turbo`, `dev.db`, `uploads/` |
| `package.json` | Workspace list, shared scripts, shared dev tooling |
| `turbo.json` | Task pipeline for `dev`, `build`, `lint`, `test` |
| `.nvmrc` | Pins the Node version |

Keep app code and app-specific config such as `.env.example` inside `apps/api` and `apps/web`.

### 4.3 Root package.json

The root file has no app code. It lists the workspaces, holds shared tooling, defines one-command scripts, and pins the npm version (Turborepo requires the `packageManager` field; get the value from `npm -v`).

```json
{
  "name": "cineseat",
  "private": true,
  "packageManager": "npm@<your npm version>",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "db:migrate": "npm run db:migrate -w @cineseat/api",
    "db:seed": "npm run db:seed -w @cineseat/api",
    "setup": "npm install && npm run db:migrate && npm run db:seed"
  },
  "devDependencies": { "turbo": "^2", "typescript": "^5", "prettier": "^3" }
}
```

### 4.4 turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": { "dependsOn": ["^build"], "cache": false, "persistent": true },
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"] },
    "lint": {},
    "test": { "dependsOn": ["^build"] }
  }
}
```

`dependsOn: ["^build"]` builds `packages/shared` before the apps start. `persistent` marks long-running dev servers, and `cache: false` stops Turborepo replaying a dev server from cache.

### 4.5 Run both apps with one command

```bash
npm run setup      # once: install, create the SQLite file, seed data
npm run dev        # every day: starts API, web, and the shared watch build
```

| Package | `dev` script | Port |
| --- | --- | --- |
| `apps/api` | `nest start --watch` | 4000 |
| `apps/web` | `next dev -p 3000` | 3000 |
| `packages/shared` | `tsup src/index.ts --format cjs,esm --dts --watch` | none |

Run one app only: `npm run dev -w @cineseat/api` or `npx turbo run dev --filter=@cineseat/web`. Set `NEXT_PUBLIC_API_URL=http://localhost:4000` in `apps/web/.env.local`, and enable CORS with credentials for `http://localhost:3000` in Nest.

### 4.6 Linking the shared package

- Name it `@cineseat/shared` and point `main`, `module`, and `types` at its `dist` folder.
- In `apps/api/package.json` and `apps/web/package.json`, add `"@cineseat/shared": "*"`. npm links it from the workspace; the `workspace:` protocol is a pnpm feature and does not work in npm.
- Build it with `tsup` to CommonJS and ESM, because NestJS runs CommonJS by default.
- In `next.config.ts`, add `transpilePackages: ['@cineseat/shared']`.

## 5. Layout inside each app

### 5.1 NestJS (apps/api)

One folder per business feature, the layout most production Nest codebases follow.

```
apps/api/src/
├── main.ts                    # bootstrap, global pipes, CORS, cookies
├── app.module.ts
├── config/                    # typed env loading and validation
├── common/                    # guards, filters, interceptors, decorators, pipes
├── database/                  # PrismaService, DatabaseModule
└── modules/
    ├── auth/  users/  movies/  theaters/  shows/
    ├── seats/                 # holds, availability, WebSocket gateway
    ├── bookings/  payments/  coupons/  reviews/
    ├── notifications/  tickets/  admin/  jobs/
    └── movies/                # example of one module's files
        ├── movies.module.ts
        ├── movies.controller.ts   # HTTP only, thin
        ├── movies.service.ts      # business rules and transactions
        ├── dto/                   # request DTOs built from shared schemas
        └── movies.service.spec.ts # unit test beside the code
```

Controllers stay thin, services own rules and transactions, and a module exports only what other modules need. Unit tests (`*.spec.ts`) sit beside the source; end-to-end tests live in `apps/api/test/`.

### 5.2 Next.js (apps/web)

Routes stay thin in `app/`; feature code lives in `features/`.

```
apps/web/src/
├── app/                       # routes only: layout, page, loading, error
│   ├── (public)/movies/[id]/page.tsx
│   ├── (auth)/login/page.tsx
│   ├── (user)/bookings/page.tsx
│   ├── booking/[showId]/page.tsx
│   └── admin/
├── features/                  # components, hooks, queries per domain
│   ├── movies/
│   ├── seats/                 # seat map, socket hook, hold timer
│   └── bookings/
├── components/ui/             # shared buttons, modals, inputs
├── lib/                       # api client, socket client, utils
├── hooks/
└── middleware.ts              # route protection
```

Server Components are the default. Add `"use client"` only where state or browser APIs are needed (seat map, forms, notifications).

## 6. Architecture

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

**Backend layering (per module)**

- **Controller:** HTTP only, validates input with the shared Zod schema
- **Service:** business rules and transactions
- **Prisma:** data access, wrapped in the service or a small repository
- **Gateway:** WebSocket broadcasts

**Cross-cutting**

- Global exception filter with one error shape
- `JwtAuthGuard` and `RolesGuard`
- Request logging interceptor
- Rate limiting with `@nestjs/throttler`
- Typed config with `@nestjs/config`

## 7. Data model and SQLite

| Table | Key fields |
| --- | --- |
| `users` | id, email (unique), passwordHash, name, phone, avatarPath, role |
| `movies` | id, title, description, genre, language, durationMin, releaseDate, posterPath, trailerUrl, status |
| `theaters` | id, name, city, address |
| `screens` | id, theaterId, name, rows, cols |
| `seats` | id, screenId, row, number, category |
| `shows` | id, movieId, screenId, startsAt, language, format, basePrice |
| `show_seats` | id, showId, seatId, status, heldBy, holdExpiresAt, **unique (showId, seatId)** |
| `bookings` | id, userId, showId, status, totalAmount, couponId, createdAt |
| `booking_seats` | bookingId, showSeatId (unique), price |
| `payments` | id, bookingId, provider, providerRef (unique), status, amount |
| `coupons` | id, code (unique), type, value, validFrom, validTo, usageLimit, usedCount |
| `reviews` | id, userId, movieId, rating, comment, **unique (userId, movieId)** |
| `wishlists` | userId, movieId |
| `notifications` | id, userId, type, title, body, readAt, createdAt |
| `audit_logs` | id, actorId, action, entity, entityId, createdAt |

```prisma
model ShowSeat {
  id            String    @id @default(cuid())
  showId        String
  seatId        String
  status        String    @default("AVAILABLE") // AVAILABLE | HELD | BOOKED
  heldBy        String?
  holdExpiresAt DateTime?
  @@unique([showId, seatId])
  @@index([showId, status])
}
```

**SQLite setup (no Docker, no database server)**

- Set `provider = "sqlite"` in `schema.prisma` and `DATABASE_URL="file:./dev.db"` in `.env`.
- The file lives at `apps/api/prisma/dev.db`. Git-ignore it and recreate it any time with `npm run db:migrate` and `npm run db:seed`.
- Enable WAL mode at startup (`PRAGMA journal_mode = WAL`) so reads are not blocked by writes.
- SQLite has no `SELECT ... FOR UPDATE` and allows one writer at a time, so double-booking protection is a transaction with a conditional update plus unique constraints.
- Depending on your Prisma version, SQLite may lack native enums. If so, store statuses as strings validated by Zod. Store money as integers.
- Index `shows(movieId, startsAt)`, `show_seats(showId, status)`, and `notifications(userId, readAt)`.
- Keep all queries inside services, so moving to PostgreSQL later only means changing the provider and URL.

## 8. Core flows

### 8.1 Seat hold (the critical flow)

1. User selects seats and calls `POST /shows/:id/holds` with seat IDs.
2. The service opens a transaction (`prisma.$transaction`).
3. One `updateMany` targets the requested seats where `status = AVAILABLE` or the old hold has expired, and sets `HELD`, `heldBy`, and `holdExpiresAt = now + 5 min`.
4. If the updated row count differs from the seats requested, the service throws and everything rolls back.
5. On success it commits and the gateway broadcasts `seats.updated` to the show's room.
6. On failure the API returns `409 Conflict` and no seat changes.

```ts
await this.prisma.$transaction(async (tx) => {
  const { count } = await tx.showSeat.updateMany({
    where: {
      showId,
      id: { in: seatIds },
      OR: [{ status: 'AVAILABLE' }, { status: 'HELD', holdExpiresAt: { lt: now } }],
    },
    data: { status: 'HELD', heldBy: userId, holdExpiresAt: expiresAt },
  });
  if (count !== seatIds.length) throw new ConflictException('Seat no longer available');
});
```

A cron job runs every 30 seconds, resets expired holds to `AVAILABLE`, and broadcasts the change.

### 8.2 Checkout and mock payment

1. `POST /bookings` creates a `PENDING` booking from the user's active hold. The server calculates the price and never trusts the client.
2. `POST /payments/intent` returns a mock payment reference.
3. The web app shows a mock card form with Success, Fail, and Timeout buttons.
4. The mock provider calls your own `POST /payments/webhook` endpoint.
5. The webhook is **idempotent**: it looks up `providerRef`, and if already processed it returns `200` without changes.
6. On success, one transaction marks seats `BOOKED` and the booking `CONFIRMED`, and creates a notification.
7. On failure or timeout, seats are released and the booking becomes `FAILED`.

```ts
interface PaymentProvider {
  createPayment(bookingId: string, amount: number): Promise<{ ref: string }>;
  verifyWebhook(payload: unknown): { ref: string; status: 'SUCCESS' | 'FAILED' };
}
```

Implement `MockPaymentProvider` now. A real provider could replace it later with no change to the booking logic.

### 8.3 Cancellation and refund

- Allowed only before `startsAt - 2h` (configurable)
- One transaction: booking `CANCELLED`, seats back to `AVAILABLE`, payment `REFUNDED` (simulated), notification created
- Broadcast the seat update

### 8.4 Ticket

- `GET /bookings/:id/ticket` returns booking data
- The QR encodes the booking ID plus an HMAC signature
- The PDF is generated locally with `pdfkit`
- Admin check-in marks the ticket as used and rejects a second scan

## 9. Sharing types between backend and frontend

The frontend never imports from `apps/api`. Both apps import from `@cineseat/shared`, which holds Zod schemas, inferred types, enums, and response shapes.

```ts
// packages/shared/src/movies.ts
import { z } from 'zod';

export const MovieSchema = z.object({
  id: z.string(),
  title: z.string(),
  genre: z.string(),
  durationMin: z.number().int(),
  releaseDate: z.string(), // ISO string, because JSON has no Date
  status: z.enum(['NOW_SHOWING', 'COMING_SOON']),
});
export type Movie = z.infer<typeof MovieSchema>;
export const CreateMovieSchema = MovieSchema.omit({ id: true });
export type CreateMovieInput = z.infer<typeof CreateMovieSchema>;
export type Paginated<T> = { items: T[]; total: number; page: number };
```

```ts
// apps/api: validate and return the shared type
@Post()
@Roles('ADMIN')
create(@Body(new ZodValidationPipe(CreateMovieSchema)) body: CreateMovieInput): Promise<Movie> {
  return this.moviesService.create(body);
}

// apps/web/src/lib/api.ts: typed client
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, { credentials: 'include', ...init });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}
export const getMovies = () => api<Paginated<Movie>>('/movies');
```

- For forms, pass the same schema to `react-hook-form` with `zodResolver`.
- Keep Prisma types inside `api`. A Prisma row has `Date` objects and database-only fields, so services map rows to the shared response types.
- Alternatives: OpenAPI with `@nestjs/swagger` plus `openapi-typescript` (generated types, more setup), or tRPC (replaces REST controllers).

## 10. API outline

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/signup`, `/auth/login`, `/auth/logout`, `GET /auth/me` |
| Users | `PATCH /users/me`, `POST /users/me/avatar`, `PATCH /users/me/password` |
| Movies | `GET /movies`, `GET /movies/:id`, wishlist `POST/DELETE /movies/:id/wishlist` |
| Shows | `GET /movies/:id/shows?city=&date=`, `GET /shows/:id/seats` |
| Holds | `POST /shows/:id/holds`, `DELETE /shows/:id/holds` |
| Bookings | `POST /bookings`, `GET /bookings/me`, `POST /bookings/:id/cancel`, `GET /bookings/:id/ticket` |
| Payments | `POST /payments/intent`, `POST /payments/webhook` |
| Coupons | `POST /coupons/validate` |
| Reviews | `GET /movies/:id/reviews`, `POST /movies/:id/reviews`, `PATCH/DELETE /reviews/:id` |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` |
| Admin | `/admin/movies`, `/theaters`, `/screens`, `/shows`, `/coupons`, `/users`, `/reviews`, `/dashboard`, `/reports`, `/checkin` |
| System | `GET /health` |

**WebSocket events**

- Client joins room `show:{id}`
- Server emits `seats.updated` with changed seat IDs and statuses
- Server emits `notification.new` to the user's private room

## 11. Frontend guidelines

- Server Components for public pages; Client Components for the seat map, checkout, and notifications
- TanStack Query for server state; a small Zustand store plus socket events for the seat map
- One typed API client in `lib/api.ts`
- Route protection with `middleware.ts` (auth cookie) plus role checks in admin layouts
- Accessibility: keyboard-selectable seats, labelled buttons, colour plus icon for seat states
- Older Chrome: set `browserslist` in `package.json`, avoid `:has()` and container queries, test early

## 12. Environment variables

| App | Variable | Example |
| --- | --- | --- |
| api | `PORT` | `4000` |
| api | `DATABASE_URL` | `file:./dev.db` |
| api | `JWT_SECRET`, `JWT_EXPIRES_IN` | long random string, `7d` |
| api | `WEB_ORIGIN` | `http://localhost:3000` |
| api | `HOLD_MINUTES`, `REFUND_CUTOFF_HOURS` | `5`, `2` |
| api | `TICKET_SECRET`, `UPLOAD_DIR` | HMAC key, `./uploads` |
| web | `NEXT_PUBLIC_API_URL` | `http://localhost:4000` |

Commit `.env.example` files with these names and never commit real `.env` files.

## 13. Security checklist

- Hash passwords, use httpOnly cookies, set `SameSite=Lax`
- Validate every input with Zod on the server
- Authorise by ownership (a user reads only their own bookings)
- Recalculate prices on the server
- Rate limit login and hold endpoints
- Restrict upload type and size; store files outside the web root with generated names
- Strict CORS to the web origin
- Never log tokens or passwords

## 14. Testing strategy

| Level | Tool | What to cover |
| --- | --- | --- |
| Unit | Jest | Price calculation, refund rule, coupon rules |
| Integration | Jest + Supertest + a separate SQLite test file | Hold, booking, and webhook flows |
| E2E | Playwright | Login, pick seats, pay, see ticket |
| Load | autocannon | 100 requests racing for the same seat |

**Signature exercise:** first write the hold logic *without* a transaction, reproduce a double booking with the load test, then fix it with the transaction and unique constraint. Keep both versions in git history.

## 15. Build phases and task checklist

| Phase | Tasks | Done when |
| --- | --- | --- |
| 0. Setup | Create repo, `LICENSE`, `.gitignore`, `.nvmrc`; root `package.json` with workspaces; `turbo.json`; scaffold `apps/api`, `apps/web`, `packages/shared`; Prisma + SQLite; seed script | `npm run dev` starts both apps |
| 1. Auth and profile | Signup, login, JWT cookie, guards, roles, profile, avatar upload | Admin routes blocked for users |
| 2. Catalog | Movies, theaters, screens, shows, admin CRUD, search and filters | Browse and filter works |
| 3. Seats and holds | Seat map, hold transaction, expiry cron, `409` handling | Two browsers cannot take the same seat |
| 4. Checkout | Booking, price calculation, coupons, mock payment, idempotent webhook | Confirmed booking with QR |
| 5. User panel | My bookings, cancel and refund, wishlist, ticket PDF | Full user journey works |
| 6. Engagement | Notifications, reviews and ratings | Verified-viewer review works |
| 7. Real time | Socket.IO gateway, live seats, live notifications | Seats update without refresh |
| 8. Admin analytics | Dashboard, reports, CSV export, audit log, ticket check-in | Revenue and occupancy shown |
| 9. Hardening | Unit, API, and E2E tests, load test, rate limits, README | `npm test` passes |

## 16. Seed data, README, and git

- **Seed script:** 1 admin, 5 users, about 10 movies with local posters, 3 theaters in 2 cities with 2 screens each, shows for the next 7 days, and a few coupons.
- **README:** project summary, feature list, `npm run setup`, `npm run dev`, default admin login, folder overview.
- **Git:** small commits with clear messages, a branch per phase, and a tag after each phase.
- **License:** MIT is a common choice for a learning project.

## 17. Stretch goals

- Dynamic pricing (weekend and evening surcharge)
- Group booking with adjacent-seat suggestions
- Waitlist for sold-out shows
- Simple recommendations from booking history
- A single start script that migrates, seeds, and launches both apps
- Dark mode and multi-language UI

## 18. Definition of done

- A user can sign up, find a movie, pick seats, pay with the mock gateway, and view a QR ticket
- Two simultaneous users can never book the same seat, proven by a load test
- Expired holds are released automatically and the UI updates live
- Duplicate webhooks do not create duplicate bookings
- Admin can manage the full catalog and view revenue reports
- The whole system runs offline with `npm run setup` and `npm run dev`
