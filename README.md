# Evidara  M&E — NGO monitoring & evaluation platform

Multi-tenant M&E SaaS for nonprofits: logframe indicators, field activities, donor reports, team RBAC, and self-service Stripe billing.

**Stack:** NestJS · Angular · MongoDB · Stripe

## Features

### M&E (aligned with IndicataGo, Humanilog, NGO Online patterns)

- **Logframe hierarchy** — goals, outcomes, outputs, activity-level indicators
- **Means of verification** on indicators
- **Activity logging** with optional indicator linkage and quantities
- **Approval workflow** — field officers submit; M&E officers approve
- **Donor reports** — progress bars, reporting period filters, print/PDF
- **Donor registry** — track funders per organisation
- **Dashboard** — portfolio counts, pending approvals, recent activities

### Multi-tenant & access

- **Organisation isolation** — every record scoped by `organizationId`
- **Self-service registration** — new org + owner in one step
- **Team invites** — email invites with 7-day tokens
- **RBAC roles:** owner, admin, me_officer, field_officer, finance, viewer

### Billing (self-service)

- **14-day free trial** on signup (no card)
- **Starter** ($79/mo), **Growth** ($199/mo), **Organization** ($499/mo), and **Scale** ($999/mo)
- **Stripe Checkout** + Customer Portal (or **mock mode** when `BILLING_MOCK=true`)
- Plan limits on projects, users, and indicators

## Quick start (local development)

Run only the database in Docker and both apps from source, so you get hot reload:

```bash
docker compose up -d mongo

cd api && cp .env.example .env && npm install && npm run start:dev
cd web && npm install && npm start
```

- Web: http://localhost:4200  
- API: http://localhost:3000/api  
- Pricing: http://localhost:4200/pricing  

### Running the whole stack in Docker

`docker compose up --build` brings up Mongo, the API, and the web bundle behind
nginx in the same shape they run in production — web on http://localhost:8080,
API on http://localhost:3000/api. It reads secrets from `api/.env`, so create
that first. See [DEPLOYMENT.md](DEPLOYMENT.md) for the deploy sequence,
backup/restore, and error tracking.

### Database migrations

Schema changes go through a versioned, replayable runner rather than by hand —
see [api/migrations/README.md](api/migrations/README.md).

```bash
cd api
npm run migrate:status   # list applied / pending, change nothing
npm run migrate          # apply everything outstanding
```

### Demo account

```bash
cd api && npm run seed
```

| Email | `demo@evidara.test` |
| Password | `Demo1234!` |

## Billing setup (production)

Payments run through **Paystack**. (Older docs mentioned Stripe; the API does not read any `STRIPE_*` secret.)

1. Create one subscription plan per tier in the Paystack dashboard
2. Set in the API environment:
   - `PAYSTACK_SECRET_KEY=sk_live_...` — also used to verify webhook signatures
   - `PAYSTACK_PLAN_STARTER=PLN_...`
   - `PAYSTACK_PLAN_PROFESSIONAL=PLN_...`
   - `PAYSTACK_PLAN_ORGANIZATION=PLN_...`
   - `PAYSTACK_PLAN_SCALE=PLN_...`
   - `PAYSTACK_PLAN_ENTERPRISE=PLN_...`
   - `BILLING_MOCK=false`
3. Point the Paystack webhook at `https://<your-host>/api/billing/webhook`

`BILLING_MOCK=true` activates any plan **without payment** — it is for local development and demos only.
In production, a missing `PAYSTACK_SECRET_KEY` makes checkout unavailable rather than free.

## API overview

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/register`, `login`, `GET /me` |
| Billing | `GET /billing/plans`, `status`, `POST checkout`, `portal`, `webhook` |
| Team | `GET/POST /members`, `invite`, `accept-invite`, `PATCH :id/role` |
| M&E | `CRUD /projects`, `/indicators`, `/activities`, `PATCH activities/:id/review` |
| Reports | `GET /reports/donor/:projectId?fromDate=&toDate=` |
| Donors | `CRUD /donors` |
| Dashboard | `GET /dashboard/overview` |

## Project layout

```
evidara-me/
├── api/               NestJS + Mongoose + Stripe
│   ├── migrations/    versioned schema migrations
│   ├── scripts/       seed + migration runner
│   └── Dockerfile
├── web/               Angular 19
│   ├── nginx.conf     static serving + SPA fallback
│   └── Dockerfile
├── marketing-site/    static marketing pages
├── .github/workflows/ CI: lint, test, build, image build
├── DEPLOYMENT.md      deploy sequence, backup/restore, observability
└── docker-compose.yml
```
