# Outsourcing Governance Portal

Local-first Next.js 14 app for capacity, timesheets, overtime approvals, evaluations, and scope swaps.

## Stack

- Next.js 14 (App Router, Server Actions)
- TypeScript, Tailwind CSS, Shadcn-style UI
- PostgreSQL (local Docker) + Prisma
- NextAuth.js (credentials + RBAC)
- Zod + Sonner

## Modules

| Route | Feature |
| --- | --- |
| `/capacity` | Weekly capacity dashboard |
| `/personnel` | Developer roster + leave (cuti/sakit) CRUD |
| `/development` | Skillset · training · coaching · reward/punishment |
| `/timesheets` | Timesheet CRUD with RBAC |
| `/overtime` | OT pre-approval workflow |
| `/evaluations` | Monthly scorecard + replacement ticket |
| `/scope-swaps` | 1-in / 1-out scope swap |
| `/integrations` | Email, SMTP, Jira, ServiceNow config cards |

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
| `pm@acme.example` | CLIENT_PM | `password123` |
| `developer@acme.example` | DEVELOPER | `password123` |
| `admin@acme.example` | SYS_ADMIN | `password123` |
| `lead@acme.example` | VENDOR_LEAD | `password123` |

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
