# Outsourcing Governance Portal

Local-first Next.js 14 app for Managed Service & IT Staff Augmentation governance:
dashboard KPIs, multi-company tenancy, capacity, personnel, timesheets, overtime,
evaluations, coverage, development, scope swaps, and operational tickets.

**Dokumentasi pengguna:** [docs/USER_GUIDE.md](./docs/USER_GUIDE.md)

## Stack

- Next.js 14 (App Router, Server Actions)
- TypeScript, Tailwind CSS, Shadcn-style UI
- PostgreSQL (local Docker) + Prisma
- NextAuth.js (credentials + RBAC)
- Zod + Sonner

## Modules

| Route | Feature |
| --- | --- |
| `/dashboard` | Role-scoped home KPIs & attention queue |
| `/capacity` | Weekly capacity utilization |
| `/clients` | Client organizations (tenant) · engagement mode |
| `/projects` | Project CRUD · timesheet / ticket / scope-swap targets |
| `/personnel` | Roster + leave · **Allow overtime** (lump-sum guard) · Jira link |
| `/coverage` | Leave coverage assignments |
| `/development` | Skill catalog CRUD · training · coaching · reward/punishment |
| `/timesheets` | Timesheet CRUD · period filter · Excel import · OT flag gated |
| `/overtime` | OT pre-approval · blocked when personnel not OT-eligible |
| `/evaluations` | Monthly scorecard + auto replacement ticket |
| `/leaderboard` | Ranking by evaluation, rewards, or hours |
| `/scope-swaps` | 1-in / 1-out scope swap |
| `/tickets` | Operational tickets · daily + Excel bulk · monthly summary · optional Jira |
| `/reports` | Operational reports · Excel export (incl. tickets) |
| `/access` | User access · roles · **multi-company membership** |
| `/integrations` | Email, SMTP, Jira, ServiceNow config |

## RBAC

Route access is centralized in `src/lib/rbac-routes.ts` (sidebar + page guards).
Server Actions enforce `assertRole` and tenant/`developerId` scope.

### Menu access

| Menu | SYS_ADMIN | CLIENT_PM | VENDOR_LEAD | VENDOR_AM | DEVELOPER |
| --- | --- | --- | --- | --- | --- |
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| Capacity | ✓ | ✓ | ✓ | ✓ | — |
| Clients | ✓ | ✓ | ✓ | ✓ | — |
| Projects | ✓ | ✓ | ✓ | ✓ | ✓ |
| Personnel | ✓ | ✓ | ✓ | ✓ | ✓ |
| Coverage | ✓ | ✓ | ✓ | ✓ | ✓ |
| Development | ✓ | ✓ | ✓ | ✓ | ✓ |
| Timesheets | ✓ | ✓ | ✓ | ✓ | ✓ |
| Overtime | ✓ | ✓ | ✓ | ✓ | ✓ |
| Evaluations | ✓ | ✓ | ✓ | ✓ | — |
| Leaderboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| Scope swaps | ✓ | ✓ | ✓ | ✓ | — |
| Tickets | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reports | ✓ | ✓ | ✓ | ✓ | ✓ |
| User access | ✓ | — | ✓ | — | — |
| Integrations | ✓ | — | ✓ | — | — |

### CRUD / data scope (summary)

| Role | Scope | Typical mutate rights |
| --- | --- | --- |
| **SYS_ADMIN** | All clients | Full admin · multi-company assign |
| **CLIENT_PM** | Active company (`clientId`) | Projects, evaluations, OT review, leave, scope swaps, tickets; timesheets read-only **unless** `BODY_SHOPPING` |
| **VENDOR_LEAD** | Active company | Personnel (incl. OT eligible), coverage, development, timesheets, leave, tickets, scope swaps, user access |
| **VENDOR_AM** | Active company | Personnel / coverage / training; tickets; many modules view-only |
| **DEVELOPER** | Own `developerId` | Own timesheets, OT (if eligible), leave, skills, Jira link, tickets (own/created) |

### Engagement mode (per client)

| Mode | Meaning |
| --- | --- |
| **MANAGED** | Classic SoD: Client PM ≠ vendor ops (Lead/AM) |
| **BODY_SHOPPING** | `CLIENT_PM` also receives **VENDOR_LEAD + VENDOR_AM** capabilities (dual-hat) |

Set on **Clients** (SYS_ADMIN). Demo seed: **ACME = BODY_SHOPPING**, **NOVA = MANAGED**.

Effective roles: `src/lib/effective-roles.ts` → `assertRole`, sidebar, permission flags.

### Multi-company membership

- Tenant = **Client** (company). One company has many **Projects**.
- `CLIENT_PM` / `VENDOR_LEAD` / `VENDOR_AM` may belong to **multiple companies** via `ClientMembership`.
- `User.clientId` = **active** company (all CRUD is scoped to it).
- Topbar **company switcher** changes active company (JWT + primary membership).
- Assign in **User access** (SYS_ADMIN): multi-select companies + primary.
- Demo: `pm@acme.example` → **ACME + NOVA**.

### Overtime eligibility

- Personnel field `overtimeEligible` (UI: **Allow overtime**).
- `false` = lump-sum / OT included in salary → block OT request + timesheet OT flag (long days still allowed within hard caps).
- Demo: `dev2@acme.example` = OT blocked.

Post-login home: all roles → `/dashboard`.

## Local setup

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Install & migrate

```bash
cp .env.example .env
npm install
npx prisma db push
npm run db:seed
```

### 3. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

After schema changes, prefer restarting `npm run dev` (Prisma client is version-gated; see `src/lib/prisma.ts`).

### Seed logins

| Email | Role | Password | Notes |
| --- | --- | --- | --- |
| `admin@acme.example` | SYS_ADMIN | `password123` | All tenants |
| `pm@acme.example` | CLIENT_PM | `password123` | ACME + NOVA · body-shopping on ACME |
| `lead@acme.example` | VENDOR_LEAD | `password123` | ACME |
| `am@acme.example` | VENDOR_AM | `password123` | ACME |
| `developer@acme.example` | DEVELOPER | `password123` | OT allowed |
| `dev2@acme.example` | DEVELOPER | `password123` | Lump-sum · OT blocked |

## Useful commands

```bash
docker compose up -d      # start local Postgres on :5434
docker compose down       # stop Postgres
npm run db:up             # alias for docker compose up -d
npm run db:push           # sync schema
npm run db:seed           # seed demo data
npm run dev               # Next.js on :3000
npm run lint
npm run build             # local production build check
```

## Business rules

- Daily max: **16h** · Weekly warning **45h** · Hard cap **50h**
- Overtime requires client pre-approval **and** `overtimeEligible = true`
- Evaluation weights: Code 30% · Delivery 25% · Tech 20% · Comm 15% · Prof 10%
- Score **< 2.80** → replacement ticket (SLA 10 working days)
- Scope swap: equal story points + hours (1-in, 1-out)
- Operational tickets: categories Development / Manage Apps / Manage Device / Support / Access / Other · status OPEN → IN_PROGRESS → DONE / CANCELLED · optional Jira sync

> Deploy (Vercel/Neon) ditunda — development dulu di local laptop.
