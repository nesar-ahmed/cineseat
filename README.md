# CineSeat 🎬🎟️

**A production-grade movie ticket booking platform, built as a typed TypeScript monorepo.**
A layered NestJS API owns the domain — catalogs, shows, transactional seat holds, bookings,
payments and admin analytics; a Next.js frontend serves the public catalog, the live seat
map, the user dashboard and the admin panel. Turborepo drives every build, lint, typecheck
and test through one cached, composable pipeline.

The hard problem CineSeat is engineered around is booking integrity at scale:
**one seat, one buyer, at any moment.** Holds are taken with transactional conditional
updates plus unique constraints, the seat map refreshes by polling (WebSocket push is
planned), and payment webhooks are idempotent — the same patterns that large ticketing
systems rely on.

> "Cine" is the cinema; "Seat" is the hard problem: **one seat, one buyer, at any moment.**

## Highlights

- ⚡ **Concurrency-safe seat holds** — TypeORM transactions + a conditional `UPDATE … WHERE status = 'AVAILABLE'` + unique constraints; double booking is impossible by design
- 🔄 **Live seat map** — the map refreshes every 10 seconds while it is open (polling); real-time Socket.IO/SSE updates are planned, not built
- 🏗️ **Production-style architecture** — thin controllers, service-layer business rules, global exception filter, JWT guards, role-based access, rate limiting, audit logging, health endpoint
- 🧩 **End-to-end type safety** — one Zod schema set (`@cineseat/shared`) validates every request server-side and types every response client-side
- 💳 **Working booking lifecycle** — holds → checkout → coupons → mock payment + idempotent webhook → confirmed booking → invoice
- 🛠️ **One-command developer experience** — `npm run setup`, then `npm run dev`; pending migrations also apply automatically on API startup; Turborepo caching makes rebuilds nearly instant
- 📖 **Self-documented API** — OpenAPI 3 / Swagger UI served by the API itself at `/docs`

## What is built today

- Auth with JWT in an httpOnly cookie, roles (`USER` / `ADMIN`), profile + avatar
- Movies, theaters, screens, shows with search, filters, pagination
- Seat map (Available / Selected / Held / Booked), 5-minute holds, max 6 seats, 10-second refresh
- Checkout with coupons, mock payment gateway, idempotent webhook, confirmed bookings and invoices
- My bookings, invoices and an in-app notification center
- Cron jobs: lapsed-hold cleanup, hold-ending warnings, show reminders, notification retention
- Admin panel: dashboard, movies, theaters, showtimes, bookings, payments, users, notifications
- Audit entries for admin changes, automatic refunds for late/duplicate money, signed webhook handling
- 239 backend tests across 25 suites; TypeScript, ESLint, Prettier and migration checks

## Not built yet

The data model or the UI already hints at these, but there is **no working end-to-end feature**
behind them yet:

| Area | Current state |
| --- | --- |
| Real-time updates | Seat maps and badges poll every 10–30 s. No Socket.IO/SSE gateway, no Redis adapter. |
| Cancellation and refunds | No user cancellation. Only automatic refunds for money that arrives late or twice. `REFUND_CUTOFF_HOURS` is defined in env but never read. |
| QR / PDF tickets | No ticket document or QR code. `TICKET_SECRET` is configured but unused. |
| Check-in | No booking-code lookup, no scanner, no admission state. The admin nav shows “Soon”. |
| Reviews | `reviews` entity exists; no API or UI. Movie ratings are seeded and never updated. |
| Wishlist | `wishlists` entity exists; the web app keeps a localStorage watchlist with no server sync. |
| Admin offers | Coupons are seeded and validated at checkout; no CRUD, no management page. |
| Announcements | `POST /notifications/announcements` exists; there is no admin page for it. |
| Reports and CSV | Dashboard aggregates exist; there is no report builder or CSV export. |
| Audit log viewer | Audit rows are written; there is no read API or admin page. |
| Email / SMS | Notifications are in-app only — no welcome mail, receipt, reminder or password reset. |
| CI, Docker, e2e | No GitHub Actions, no container images, no API e2e or browser tests. Web tests are a placeholder. |

## Where the next complexity comes from

These are deliberate “not yet” areas, to be designed before they are implemented:

- **Booking correctness under load** — concurrent holds, payment races, coupon usage limits, idempotency under retries.
- **Database concurrency and locking** — SQLite’s single writer today; PostgreSQL row locks (`SELECT … FOR UPDATE`), isolation levels, deadlock handling, and how `InventoryLane` changes shape.
- **Performance** — query indexes, N+1 removal, caching, pagination at scale, load testing the hold/payment path.
- **Real-time delivery** — Socket.IO/SSE, Redis pub/sub, reconnect and missed-event handling.
- **Background work at scale** — BullMQ/Redis jobs, retries, outbox pattern for email/webhooks.
- **Operational hardening** — Docker, CI/CD, observability (logs, metrics, tracing), backups, graceful shutdown.
- **Security** — production secret enforcement, CSRF/origin checks, JWT revocation, password reset, email verification, MFA.

## Architecture

```
┌─────────────────────────┐   REST (polling today)   ┌──────────────────────────┐
│ Next.js (apps/web)      │ ───────────────────►     │ NestJS (apps/api)        │
│ pages, seat map, admin  │ ◄───────────────────     │ controller → service →   │
└───────────┬─────────────┘                          │ TypeORM, gateway, cron   │
            │ imports                                └───────┬──────────┬───────┘
            ▼                                    imports │          │ reads/writes
   ┌──────────────────────┐ ◄──────────────────────────────┘          ▼
   │ packages/shared      │                                ┌────────────────────┐
   │ Zod schemas + types  │                                │ SQLite (dev.db)    │
   └──────────────────────┘                                │ + uploads/ on disk │
                                                           └────────────────────┘
```

Both apps import from `@cineseat/shared` and never from each other. The data layer keeps
all queries inside services behind TypeORM repositories, so moving SQLite → PostgreSQL later
means switching the TypeORM driver and regenerating migrations, not rewriting services.

## Tech stack

| Layer     | Choice                                                              |
| --------- | ------------------------------------------------------------------- |
| Monorepo  | npm workspaces + Turborepo 2.11                                     |
| Frontend  | Next.js 16 (App Router) + Tailwind CSS v3.4, React 19, TanStack Query 5 |
| Backend   | NestJS 12 + `@nestjs/schedule` (Socket.IO is not installed yet)      |
| DB / ORM  | TypeORM 1.1 + `better-sqlite3` (SQLite, WAL mode; migrations in TS) |
| Sharing   | Zod 4 schemas + types in `@cineseat/shared` (tsup: CJS + ESM + dts) |
| Auth      | `@nestjs/jwt` + `passport-jwt`, httpOnly cookie, `bcryptjs`, roles via guards |
| Language  | TypeScript 6 (TS 7 still lacks support in the Nest/ts-jest chain)   |
| Quality   | ESLint 9 flat config (shared preset), Prettier                      |
| API docs  | `@nestjs/swagger` — OpenAPI 3 + Swagger UI at `/docs`               |

The web app reads the catalog, cinemas and showtimes from the API through TanStack Query
(one cache, see `apps/web/src/features/catalog/queries.ts`). `react-hook-form`, Socket.IO,
`qrcode`/`pdfkit` and similar are **not installed yet**; they are added only when the phase
that needs them starts.

## Prerequisites

- Node.js `24.9` or newer (`.nvmrc` pins 24.16.0), npm `11` (see `packageManager` field).
  The API tests refuse to start on older versions — on Node 22 every Jest suite would fail
  with "Must use import to load ES Module"; run `nvm use` first
- Network is needed only for the initial `npm install`
- `better-sqlite3` is a native module: `npm install` downloads a prebuilt binary for your
  platform, or compiles it from source when none is available (needs Python 3, `make` and
  a C++ compiler)

## Quick start

```bash
npm run setup   # once: install deps, create SQLite file, run migrations, seed data
npm run dev     # every day: starts API (:4000), web (:3000), and the shared watch build
```

- Web app: http://localhost:3000
- API health: http://localhost:4000/health
- Swagger UI (OpenAPI): http://localhost:4000/docs — raw JSON at `/docs/json`
  (assets are bundled and served by the API itself — no external dependencies)
  Signed-in routes use the `cookieAuth` scheme: call `POST /auth/login` from `/docs`
  and the browser carries the httpOnly session cookie on every following request

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
  api/            # @cineseat/api    — NestJS backend + TypeORM + SQLite (port 4000)
    src/          # official Nest layout: one folder per feature module at the src root
      config/     #   typed env validation (Zod)
      common/     #   guards (JWT + roles), error filter, Zod pipe, decorators, time-zone helpers
      database/   #   global DatabaseModule (TypeORM, WAL), entities/, migrations/, seed.ts
      health/     #   health module (GET /health)
      auth/       #   signup, login, logout, me — JWT in an httpOnly cookie
      users/      #   profile, password, avatar upload; /admin/users and ADMIN role changes
      movies/     #   browse/search with filters, detail; ADMIN editing, posters, bulk, /admin/movies read model
      catalog/    #   filter vocabulary and facet counts for the movies catalog
      theaters/   #   cinemas, screens and generated seat layouts; /admin/theaters read model
      shows/      #   showtimes, live seat maps, pricing, ADMIN scheduling (batch, bulk), /admin/shows
      holds/      #   seat holds for checkout, and the job that clears lapsed ones
      bookings/   #   checkout (prices, offer codes, start paying), the buyer's bookings, /admin/bookings
    invoices/   #   invoices for the bookings money reached (derived from them, nothing stored)
      payments/   #   the payment provider seam and its signed webhook; /admin/payments
      mock-gateway/ # TEST MODE payment provider: test cards, hosted-page API, webhooks
    data/         #   dev.db — the SQLite file, created by the first migration (git-ignored)
  web/            # @cineseat/web    — Next.js frontend (port 3000); design notes in apps/web/DESIGN.md
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
| `npm run db:migrate` | Apply pending TypeORM migrations (`@cineseat/api`) |
| `npm run db:seed`    | Idempotent demo seed                          |
| `npm run setup`      | install + migrate + seed                      |

`npm run test` passes `--experimental-vm-modules` to Node: NestJS 12 ships ESM-only
packages, and Jest needs that flag — and Node 24.9+ — to load them from a CommonJS test
file. A `pretest` check (`apps/api/scripts/check-node.mjs`) stops early with a clear
message when the shell runs an older Node.

## Database

The schema lives in TypeORM entities (`apps/api/src/database/entities/`) and only changes
through migrations (`synchronize` is off). The API applies pending migrations on startup,
so a fresh checkout (or a deleted `dev.db`) comes up with the full schema — `db:migrate`
is still the explicit way to do it, and `db:seed` fills an empty database with demo data.
To change the schema:

1. Edit the entities.
2. `npm run db:migration:generate -w @cineseat/api -- src/database/migrations/<Name>` — TypeORM
   diffs the entities against your local database and writes the migration.
3. Review the file and register it in `src/database/migrations/index.ts` (migrations are
   listed explicitly, so the app, the CLI and the tests always load the same set).
4. `npm run db:migrate` (undo the latest with `npm run db:migrate:revert -w @cineseat/api`).

The test suite runs every migration against a real SQLite file and fails if the result
differs from what the entities describe. The build ships the same files, so a deployed API
(run from `apps/api`) applies pending migrations on boot and seeds with
`node dist/database/seed.js` — no TypeScript tooling needed. To run migrations by hand
instead: `npx typeorm migration:run -d dist/database/data-source.js`.

SQLite has a single writer, and TypeORM shares one connection across the whole app. Work
that spans several statements inside `dataSource.transaction()` shares that connection
with concurrent requests, so keep transactions short and free of unrelated `await`s.

Seat inventory (holds now, bookings and refunds next) never goes through that path: it
changes only through `InventoryLane` (`src/database/inventory-lane.ts`). Each unit of
work waits until no other transaction is open on the connection, then runs as one
synchronous `BEGIN IMMEDIATE … COMMIT` with nothing able to run in between — so a hold
can neither join nor be undone by another request's transaction. Seats are taken with a
conditional `UPDATE … WHERE status = 'AVAILABLE'`, all of a request's seats or none.

## API

The full, always-current reference is Swagger UI at `/docs`. Implemented so far:

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Users | `PATCH /users/me`, `PATCH /users/me/email` (current password required), `POST /users/me/password`, `POST /users/me/avatar`, `GET /users` (ADMIN), `PATCH /users/:id/role` (ADMIN — give or take away admin access; never your own account, never the last admin: 409; audited, and the account is told) |
| Movies | `GET /movies` (search, filters, sort, pages), `GET /movies/:id`; ADMIN: `POST /movies`, `PATCH /movies/:id` (refused with 409 when it would break the schedule), `DELETE /movies/:id`, `POST /movies/:id/poster`, `DELETE /movies/:id/poster`, `POST /movies/bulk` (set status or delete, up to 100) |
| Catalog | `GET /catalog/filters` (filter vocabulary + bookable dates), `GET /catalog/facets` (counts per option for a movies query) |
| Theaters | `GET /theaters`, `GET /theaters/:id`, `GET /screens/:id` (seat layout); ADMIN: `POST/PATCH/DELETE /theaters` (names unique, cities spelled one way), `POST /theaters/:id/screens`, `PATCH/DELETE /screens/:id` |
| Shows | `GET /shows` (search across movies/venues), `GET /movies/:id/showtimes` (a week, with day counts), `GET /shows/:id`, `GET /shows/:id/seats` (live seat map); ADMIN: `POST /shows`, `POST /shows/batch` (one movie on one screen at several dates × times, with `dryRun`), `PATCH/DELETE /shows/:id`, `POST /shows/bulk` (cancel or reprice, up to 100) |
| Holds | `POST /holds` (reserve up to 6 seats of a show), `GET /holds/current`, `GET /holds/:id`, `DELETE /holds/:id` — signed in, your own holds only |
| Checkout | `POST /checkout/:holdId/quote` (price, optional offer code), `POST /checkout/:holdId/pay` (open a mock payment) — signed in |
| Bookings | `GET /bookings` (yours, newest first), `GET /bookings/:id` (status, price, seats, latest payment) — signed in |
| Invoices | `GET /invoices` (yours, newest settled first, `?status=PAID\|REFUNDED`), `GET /invoices/:id` (by the id of the booking it bills) |
| Admin | `GET /admin/dashboard` (ADMIN) — revenue, tickets, bookings and sign-ups for the last 7 days vs the 7 before, occupancy of the coming week, live holds, refunds, 14 days of sales per day, next shows, latest bookings, best sellers |
| Admin movies | `GET /admin/movies` (ADMIN) — every movie with record times and all-time figures (shows, upcoming shows, next show, tickets, revenue); search (title, director, cast, genre or id), filters (status, genre, language, certificate, release format, scheduled or not, poster or not, release window), sort on any of those both ways, pages, and counts per status; `GET /admin/movies/:id` — the movie with its next shows, its schedule limits and its change history |
| Admin theaters | `GET /admin/theaters` (ADMIN) — every cinema with its screens, today's shows and all-time figures (shows, upcoming shows, next show, tickets, revenue, occupancy of what has not started); search (name, city, address, amenity, screen or id), filters (city, amenity, screen format, scheduled or not), sort on any figure both ways, pages, and counts per city; `GET /admin/theaters/:id` — the cinema with each screen's layout, figures and limits, its next shows and the history of the cinema and its screens |
| Admin bookings | `GET /admin/bookings` (ADMIN, read-only) — every buyer's bookings with show, seats, total, money paid and refunded, and the latest payment; search (booking code `CS-…` or its start, buyer name or email, movie, id), filters (status, payment outcome, movie, theater, show, buyer, offer code, booked and show days), sort (booked, show time, amount, seats) both ways, pages, counts per status and totals of the selection; `GET /admin/bookings/:id` — every seat it priced (released ones marked), price and offer, the buyer with their paid bookings and spend, and every payment attempt newest first |
| Admin payments | `GET /admin/payments` (ADMIN, read-only) — every payment attempt with its booking, buyer and show, how it was paid (card, bKash, Nagad) and why it failed or was refunded; search (provider reference, booking code `CS-…` or its start, buyer name or email, payment or booking id), filters (outcome, channel, buyer, days started, amount range), sort (started, settled — open ones last — amount) both ways, pages, counts per outcome and the money in the selection (collected, refunded, failed, open) |
| Admin users | `GET /admin/users` (ADMIN) — every account with its paid bookings, money paid and refunded and its last booking; search (name, email, phone or id), filters (role, booked or never, joined days), sort (joined, name, paid bookings, spent, last booking) both ways, pages and counts per role; `GET /admin/users/:id` — the profile with its figures (tickets, upcoming, not completed, first and last booking), what it books most (movies, theaters), whether the signed-in admin may change its role (and why not) and its role changes |
| Admin showtimes | `GET /admin/shows` (ADMIN) — every show, past and upcoming, with seats sold / held / available, paid bookings, revenue, state and whether it is locked; tabs (upcoming, today, past, all) with counts, search (movie, theater, screen, city or id), filters (days, movie, theater, screen, city, format, language, availability, sold or not), sort (time, movie, theater, sold, occupancy, revenue, price) both ways, pages; `GET /admin/shows/:id` — seats and prices per category, booking counts and the latest bookings, what it still allows and its history |
| Payments | `POST /payments/webhook/mock` — results from the mock gateway, HMAC-signed, applied once |
| Notifications | `GET /notifications` (yours, newest first, `?status=unread\|read&category=bookings,offers,account,admin&type=…` — categories and types one or more each), `GET /notifications/unread-count` (same `category`), `GET /notifications/counts` (per category and per type), `PATCH /notifications/:id` (`{ read }`), `POST /notifications/read-all` (optional `{ categories }`), `DELETE /notifications/:id` — signed in, your own only; ADMIN: `POST /notifications/announcements` |
| Mock gateway (test mode) | `GET /mock-gateway/sessions/:ref`, `POST /mock-gateway/sessions/:ref/pay`, `POST /mock-gateway/sessions/:ref/cancel` |

`GET /movies` filters on genre, language, certificate, rating and running time, and on
city, theater, date and format through the show schedule (upcoming shows only). Dates
and clock times are on the cinemas' clock (`TIME_ZONE`); instants are ISO UTC. Money is
an integer in poisha (`currency: BDT`): a show has a base price and premium/recliner
seats add a fixed surcharge. Availability counts expired holds as free seats.

Seat holds: `POST /holds` reserves seats for `HOLD_MINUTES` (never past the show's start).
Everyone else sees them as `HELD` on the seat map; the moment the time is up they read as
`AVAILABLE` again. An unpaid hold is then removed — its pending booking deleted and its
seats put back on sale — by a job that runs every 30 seconds (`src/holds/hold-expiry.job.ts`).
Each buyer has at most one hold: holding again replaces it, which is how seats are changed.

### Payments are simulated

There is no real payment provider and no real money. `PAYMENT_PROVIDER` accepts only `mock`:
a test gateway inside the API (`src/mock-gateway/`) that plays the part of a hosted payment
page plus webhooks, the way SSLCommerz, bKash or Stripe would.

1. `POST /checkout/:holdId/pay` prices the hold again (with the offer code, if any), opens a
   PENDING payment and extends the hold once by `PAYMENT_WINDOW_MINUTES`. It answers with
   `redirectUrl`: the gateway's payment page (`/pay/mock/:ref` in the web app).
2. The payment page pays with test data only — real card numbers are refused, card numbers
   are never stored or logged:

   | Test card | Result |
   | --- | --- |
   | `4242 4242 4242 4242` (Visa), `5555 5555 5555 4444` (Mastercard) | approved |
   | `4000 0000 0000 0002` | declined |
   | `4000 0000 0000 9995` | insufficient funds |

   Any future expiry and CVC. bKash / Nagad: any `01XXXXXXXXX` number, code `123456` approves,
   `000000` declines.
3. After `MOCK_WEBHOOK_DELAY_MS` the gateway POSTs a signed event (HMAC-SHA256 over the exact
   bytes and a timestamp, `MOCK_PAYMENT_SECRET`) to `/payments/webhook/mock`. A success confirms
   the booking and sells the seats; a decline fails only that attempt, so the buyer can pay again
   while the hold lasts. Each payment settles once: repeated events change nothing, and money for
   a booking that is no longer waiting for it (hold ended, or already paid) is refunded.
4. The buyer returns to `/checkout/:bookingId?payment=:ref`; the page follows `GET /bookings/:id`
   until it says CONFIRMED (or FAILED), then opens the ticket in the user panel
   (`/account/bookings/:id`), where every booking stays under My bookings.

A hold that ends before anyone tried to pay is removed; one with payment attempts is kept as
FAILED, with its seats as history (a seat belongs to at most one live booking). Offer codes
enforce what the offers say: `WEEKEND10` for Friday–Sunday shows, `FLAT100` for three seats or
more, `FIRST50` for a first booking.

Invoices: a booking has one as soon as money reached it — `PAID` when a payment succeeded,
`REFUNDED` when it arrived after the seat hold had ended and went straight back (a second
payment for an already paid booking is refunded too, and the invoice stays `PAID`). They are
derived from the booking rather than stored: what they bill is already immutable (each seat's
price at booking time and the booking's total), so the same booking always produces the same
invoice, numbered `INV-<year>-<booking code>` and reachable at the booking's own id. Real money
would want the opposite — an `invoices` table written at payment time, with a sequential number
and a copy of the seller, buyer and line text as they read that day.

In-app notifications: each belongs to one account (admin messages are written once per
ADMIN, so each admin has their own read state) and links to what it is about (`bookingId`,
`showId` or `couponCode`). Messages about seats and payments are written inside the same
`InventoryLane` unit as the change, so they commit or roll back with it; account messages
(signup, password, email) are sent right after the change and never fail the request. All
wording lives in `src/notifications/messages.ts`.

| Who | Type | When |
| --- | --- | --- |
| Buyer | `WELCOME` | signing up |
| Buyer | `ACCOUNT_SECURITY` | password or sign-in email changed |
| Buyer | `HOLD_EXPIRING` | 2 minutes left on a hold (again after paying extends it) |
| Buyer | `HOLD_EXPIRED` | a hold ran out before anyone paid (seats back on sale; links to the show) |
| Buyer | `PAYMENT_FAILED` | declined / cancelled at the gateway — says how long the seats stay held |
| Buyer | `BOOKING_CONFIRMED` / `BOOKING_FAILED` / `REFUNDED` | paid / hold ended after a payment attempt / late or duplicate money returned |
| Buyer | `SHOW_REMINDER` | 24 h and 2 h before the show, if booked before that point |
| Everyone | `ANNOUNCEMENT` | an admin sends one (to ALL, USERS or ADMINS; audited) |
| Admins | `ADMIN_NEW_USER`, `ADMIN_REFUND_ISSUED` | a signup; any automatic refund |
| Admins | `ADMIN_SHOW_ALMOST_FULL`, `ADMIN_SHOW_SOLD_OUT` | a show passes 90% sold / sells out (once each) |
| Admins | `ADMIN_COUPON_EXHAUSTED` | an offer reaches its usage limit |
| Admins | `ADMIN_PAYMENT_ALERT`, `ADMIN_SYSTEM_ALERT` | rejected (forged, unknown, mismatched) webhooks; a failing background job — at most one per kind per 10 minutes |

Releasing or replacing your own hold sends nothing. Clock-driven messages run in
`src/notifications/notifications.job.ts` (hold warnings every 30 s, reminders every 5 min)
and carry a dedupe key, so a repeated run never repeats a message; read notifications are
deleted after 90 days. `BOOKING_CANCELLED` and `NEW_COUPON` are defined for the
cancellation and offer-management features that are not built yet.

In the web app, signed-in visitors get a bell in the header (unread badge, refreshed every
30 s, and a panel with the newest six) and the full list at `/account/notifications`. The
user panel shows the `bookings`, `offers` and `account` categories. The admin panel has the
same bell in its top bar and an inbox at `/admin/notifications` for the `admin` category
(filters: sales, sign-ups, alerts); each admin notification links to where it is handled —
the user, the booking's payments, the show, the offer — and addresses of admin pages that are
not built yet show "coming soon" inside the admin frame. A sign-up notice carries
`subjectUserId`, the account it is about.

Admin panel: `/admin` in the web app, for ADMIN accounts (others see "Admins only"; the API
answers 403). A left navbar that minimizes to icons (labels as tooltips) and remembers it,
and a top navbar with the page title, a way back to the site, the notification bell and the
admin's menu; on phones the left navbar is a drawer. The dashboard, notifications, movies,
theaters, showtimes, bookings, payments and users are built; the other sections are listed with "Soon" until
their pages exist. The demo
seed spreads its bookings over the last 14 days so the dashboard has history.

Admin movies (`/admin/movies`): the list shows every title with its status, release,
upcoming shows, tickets and revenue — status tabs with counts, search (`/` jumps to it),
filters in a side panel (genre, language, certificate, release format, scheduled or not,
poster or not, release window) shown as removable chips, sorting by any column both ways, and
pages; the whole view is in the URL. Each row opens the movie and has a "⋯" menu (edit, move
to the other status with Undo, view on the site, delete); selecting rows brings up bulk
actions (set status, delete). `/admin/movies/new` and `/admin/movies/:id/edit` are one form,
checked with the same Zod schema as the API; `/admin/movies/:id` shows the figures, the next
shows with seats sold and held, the details, the poster (upload, replace, remove — saved at
once), the schedule limits and the movie's history.

Admin theaters (`/admin/theaters`): cinemas as cards — screens, today's shows, what is coming,
revenue and how much of the coming schedule is sold — with city tabs, search, filters (amenity,
screen format, scheduled or not) and sorting; cinemas are added and edited in a dialog. A
cinema's page shows its figures, each screen with its seat layout drawn (standard, premium,
recliner rows) and its limits, the next shows and its history (screens included). Screens are
added and edited in a dialog with a live preview of the layout; the layout locks once a screen
has shows, and formats upcoming shows use cannot be removed.

Admin showtimes (`/admin/shows`): every show as a list — tabs for upcoming, today, past and
all, filters (days, theater, screen, city, movie, format, language, how full, sold or not),
sorting, bulk reprice or cancel — or as a day board: one day, screen by screen, on a time axis
with the turnaround after each show, coloured by how full it is, with "+" on a screen to
schedule there. A show's page has its live seat map, seats and prices per category, the latest
bookings, what can still change and why not, and its history; time, format, language and price
change in a dialog. `/admin/shows/new` schedules a movie on a screen at every chosen time of
every chosen day (a date range and weekdays), checking every slot live with the API's dry run
before anything is saved. Movie, theater and screen pages link straight into it.

Admin bookings (`/admin/bookings`, read-only — bookings change through the booking flow):
every booking with its buyer, show, seats, amount, latest payment and status, with a strip
that adds up the view (bookings, seats, paid, refunded), status tabs with counts, search by
code, buyer or movie, filters (payment outcome, booked and show days, theater, movie, offer
code) and sorting; shows, movies, theaters and buyers link to "their" bookings. A booking's
page has its tickets (released seats struck through), every payment attempt with the
provider's reference, method and reason (`#payments`, where refund notices lead), the money,
the buyer with their history, and a timeline; a hold being paid counts down to its end.

Admin payments (`/admin/payments`, read-only — payments change only through the provider's
webhook): every payment attempt with its amount and reference, buyer, booking and show, how it
was paid and why it failed or was refunded, when it started and settled. A strip adds up the
money in the view (collected, refunded, failed — with the share of settled attempts — and
open); outcome tabs with counts, search by reference, booking code or buyer, filters (card,
bKash or Nagad, days, amount range in taka) and sorting. A row opens the attempt on its
booking's page (`#payment-<id>`, highlighted); a buyer's page links to their payments.

Admin users (`/admin/users`): every account with its role, when it joined, paid bookings,
spending and last booking — role tabs with counts, search by name, email or phone, filters
(booked or never, joined days) and sorting; each row's "⋯" reaches their bookings and
payments and gives or takes away admin access. An account's page has its figures, latest
bookings and payments, profile, what it books most, admin access and its history. Role
changes are confirmed in a dialog that says what they mean; the API refuses your own account
and the last admin (the page says why before you try), does the check, the change, its audit
entry and the account's notification in one isolated transaction (two admins demoting each
other at once still leave one), and the new role applies to the account's open sessions at
once (the role is read from the database on every request).

Movie edits keep the schedule intact: a show's end comes from the movie's running time, so
`PATCH /movies/:id` refuses (409, naming the field) to remove a format that upcoming shows
use, to move the release day past the first upcoming show, or to lengthen the film into the
next show on a screen (`src/movies/schedule-limits.ts`). A movie with shows cannot be deleted.
Every admin change to a movie (create, edit with the fields that changed, poster, delete) is
written to `audit_logs` in the same transaction; sending unchanged values is a no-op.

Admin theaters and showtimes follow the same pattern: read models under `/admin/theaters` and
`/admin/shows`, changes on the resources, each audited (`src/common/audit/audit-log.ts`). An
audit entry keeps a `subject` — what it was about, in words ("Screen 2", "Paper Boats ·
CineSeat Gulshan, Screen 1 · Fri 13 Nov, 6:00 PM", a movie's title) — so history stays
readable after the thing is deleted; a cinema's screens are recorded on the cinema, so its
history covers them. Refusals name their field (`name:`, `formats:`, `rows:`, `startsAt:`) so
forms can show them in place. Theater names are unique and a city is stored the way the other
cinemas spell it. `POST /shows/batch` schedules one movie on one screen at every time of every
date (cinema clock), each checked like a single show and against the rest of the batch;
`dryRun` previews it. A show can be changed until it starts or a seat is held or sold, and
deleted while it has no tickets and no booking attempts on record; a screen's layout is fixed
once it has shows; screens and cinemas with shows cannot be deleted.

Scheduling rules: the movie must be released in the show's format and the screen must
support it, shows start in the future and on or after the release day, and a screen runs
one show at a time with a 20-minute turnaround. Shows, screens and theaters with sold or
held seats cannot be changed or deleted.

## Environment

Copy the examples if you need to change defaults:

- `apps/api/.env.example` → `apps/api/.env` (`NODE_ENV`, `PORT`, `DATABASE_PATH`, `JWT_SECRET`, `WEB_ORIGIN`, `HOLD_MINUTES`, `TIME_ZONE`, `PAYMENT_PROVIDER` (`mock` only), `MOCK_PAYMENT_SECRET`, `MOCK_WEBHOOK_DELAY_MS`, `PAYMENT_WINDOW_MINUTES`, `INVOICE_SELLER_*` (who invoices come from), ...)
- `apps/web/.env.example` → `apps/web/.env.local` (`NEXT_PUBLIC_API_URL`)

Never commit real `.env` files.

## Repository hygiene (what is never pushed to GitHub)

`node_modules/`, `.turbo/`, `.next/`, `dist/`, `coverage/`, the SQLite folder
`apps/api/data/` (`dev.db` and its `-wal`/`-shm` files), `apps/api/uploads/*`, and **all**
`.env` files — only `.env.example` files are committed. CI/CD (`.github/` workflows) is
intentionally left out for now and will be added later.

## Development workflow

Small, focused commits with conventional messages (`feat:`, `fix:`, `chore:`, `refactor:`,
`docs:`), one branch per phase, a tag after each phase.

## License

MIT — see [LICENSE](./LICENSE).
