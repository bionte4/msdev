# Outsourcing Governance Portal

Local-first Next.js 14 app for Managed Service & IT Staff Augmentation governance:
capacity, personnel, timesheets, overtime, evaluations, coverage, development, and scope swaps.

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
| `/clients` | Client organizations (tenant) |
| `/projects` | Project CRUD · timesheet & scope-swap targets |
| `/personnel` | Developer roster + leave (cuti/sakit) CRUD |
| `/coverage` | Leave coverage assignments |
| `/development` | Skillset · training · coaching · reward/punishment |
| `/timesheets` | Timesheet CRUD · period filter · Excel import |
| `/overtime` | OT pre-approval workflow |
| `/evaluations` | Monthly scorecard + replacement ticket |
| `/leaderboard` | Ranking by evaluation, rewards, or hours |
| `/scope-swaps` | 1-in / 1-out scope swap |
| `/tickets` | Operational tickets · daily + Excel bulk · monthly summary · optional Jira |
| `/reports` | Operational reports · Excel export |
| `/access` | User access admin (activate / roles) |
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
| **SYS_ADMIN** | All clients | Full admin |
| **CLIENT_PM** | Own `clientId` | Projects, evaluations, OT review, leave review, scope swaps; timesheets read-only **unless** client is `BODY_SHOPPING` |
| **VENDOR_LEAD** | Own `clientId` | Personnel, coverage, development, timesheets, leave, scope swaps, user access |
| **VENDOR_AM** | Own `clientId` | Personnel, coverage, training/coaching/skills; timesheets & OT read-only; evaluations/scope swaps view-only |
| **DEVELOPER** | Own `developerId` | Own timesheets, OT, leave, skills, Jira link; coverage/projects/reports self-scoped |

### Engagement mode (per client)

| Mode | Meaning |
| --- | --- |
| **MANAGED** | Classic SoD: Client PM ≠ vendor ops (Lead/AM) |
| **BODY_SHOPPING** | `CLIENT_PM` also receives **VENDOR_LEAD + VENDOR_AM** capabilities (dual-hat) |

Set on **Clients** (SYS_ADMIN). Demo seed: **ACME = BODY_SHOPPING**, **NOVA = MANAGED**.

Effective roles are computed in `src/lib/effective-roles.ts` and applied to `assertRole`, sidebar, and permission flags.

### Multi-company membership

- Tenant = **Client** (company). One company has many **Projects**.
- `CLIENT_PM` / `VENDOR_LEAD` / `VENDOR_AM` may belong to **multiple companies** via `ClientMembership`.
- `User.clientId` = **active** company (session scoping for all CRUD).
- Topbar **company switcher** changes the active company (JWT + primary membership).
- Assign memberships in **User access** (SYS_ADMIN): multi-select companies + primary.
- Demo: `pm@acme.example` is member of **ACME + NOVA**.

Post-login home: all roles → `/dashboard` (role-scoped KPIs).

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

### Seed logins

| Email | Role | Password |
| --- | --- | --- |
| `admin@acme.example` | SYS_ADMIN | `password123` |
| `pm@acme.example` | CLIENT_PM | `password123` |
| `lead@acme.example` | VENDOR_LEAD | `password123` |
| `am@acme.example` | VENDOR_AM | `password123` |
| `developer@acme.example` | DEVELOPER | `password123` |
| `dev2@acme.example` | DEVELOPER | `password123` |

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
- Overtime requires client pre-approval
- Evaluation weights: Code 30% · Delivery 25% · Tech 20% · Comm 15% · Prof 10%
- Score **< 2.80** → replacement ticket (SLA 10 working days)
- Scope swap: equal story points + hours (1-in, 1-out)

> Deploy (Vercel/Neon) ditunda — development dulu di local laptop.
