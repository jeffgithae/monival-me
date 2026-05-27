# Monival M&E — NGO monitoring & evaluation platform

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
- **Starter** ($49/mo) and **Professional** ($149/mo)
- **Stripe Checkout** + Customer Portal (or **mock mode** when `BILLING_MOCK=true`)
- Plan limits on projects, users, and indicators

## Quick start

```bash
docker compose up -d

cd api && cp .env.example .env && npm install && npm run start:dev
cd web && npm install && npm start
```

- Web: http://localhost:4200  
- API: http://localhost:3000/api  
- Pricing: http://localhost:4200/pricing  

### Demo account

```bash
cd api && npm run seed
```

| Email | `demo@monival.test` |
| Password | `Demo1234!` |

## Stripe setup (production)

1. Create products/prices in Stripe Dashboard  
2. Set in `api/.env`:
   - `STRIPE_SECRET_KEY=sk_live_...`
   - `STRIPE_WEBHOOK_SECRET=whsec_...`
   - `STRIPE_PRICE_STARTER=price_...`
   - `STRIPE_PRICE_PROFESSIONAL=price_...`
   - `BILLING_MOCK=false`
3. Forward webhooks: `stripe listen --forward-to localhost:3000/api/billing/webhook`

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
monival-me/
├── api/          NestJS + Mongoose + Stripe
├── web/          Angular 19
└── docker-compose.yml
```
