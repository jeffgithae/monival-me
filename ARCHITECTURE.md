# Monival M&E SaaS — System Architecture & Multi-Tenant Strategy

## Overview
This document summarizes a production-ready architecture for a premium, multi-tenant Monitoring & Evaluation (M&E) SaaS platform tailored to NGOs, donors, and government projects. It prioritizes tenant isolation, strong RBAC, security, scale, and operational simplicity while supporting features listed in the product vision.

## High-level architecture
- Frontend: Angular (latest) PWA, Tailwind, runtime tenant branding and feature flags.
- Backend: Node.js + NestJS (modular monolith initially), event-driven components for async tasks.
- Database: MongoDB (primary), with recommended tenancy patterns described below.
- Background processing: BullMQ / Redis for queues.
- Search / analytics: Elasticsearch (or OpenSearch) for full-text, global search, and analytics.
- File storage: S3-compatible buckets (AWS S3, DigitalOcean Spaces, or Railway storage) — one bucket with tenant prefixes or one bucket per tenant for higher isolation.
- Messaging / Webhooks: Kafka/RabbitMQ optional for high-scale eventing.
- Payments: Stripe primary, PayPal and M-Pesa via connectors.
- Infra: Docker containers, deployable to Railway/EKS with Cloudflare in front.

## Multi-tenant strategy (recommendation)
Goal: strong isolation by default, operational simplicity, cost-effective scaling.

1. Tenant resolver
- Resolve tenant from domain, subdomain (tenant.myapp.com), signed-in user's tenant claim, or request header.
- Short-circuit invalid or missing tenant with explicit 403/404.

2. Tenancy tiers (hybrid model)
- Small/medium tenants: Shared database and shared collections with `tenantId` field on all tenant-scoped documents. Enforce and index by `tenantId` for performance.
- Large/enterprise tenants: Offer dedicated database (separate MongoDB database) or even dedicated cluster. Promote tenant to dedicated DB via admin tooling and data migration.

3. Enforcement layers (defense in depth)
- API layer: middleware / guards in NestJS that attach `tenantId` to request context and validate it against JWT/session. All service methods must read tenant from context — never accept client-specified tenant IDs.
- Service layer: repositories automatically add `{ tenantId }` filters to reads and populate tenantId on writes.
- Database layer: use validators and schema-level rules where possible (MongoDB schema validation) to prevent cross-tenant writes.
- Indexes: compound indexes on `{ tenantId, uniqueKey }` to maintain uniqueness per organization.

4. Data partitioning and governance
- Use `tenantId` as the primary partition key for queries and indexes.
- For audit logs and immutable events, store tenantId and a write-once record; consider time-series collections for event logs.
- For backups/exports, support per-tenant snapshots and retention policies.

5. Network, storage and secrets
- Files: store in S3 using `/{tenantId}/...` prefixes; optionally create separate buckets for regulated tenants.
- Secrets: tenant-specific secrets (e.g., M-Pesa credentials) stored encrypted in a secrets store (AWS Secrets Manager or Vault).
- Rate limiting and quotas: per-tenant rate limiting and API quotas to protect noisy tenants.

6. Branding & settings
- Per-tenant settings service that supplies branding (logo, color tokens, custom domain), feature flags, and locale/timezone.
- Frontend loads tenant settings at bootstrap and applies styles and logos dynamically.

## Authentication & Authorization
- Auth service: NestJS module using Passport for OAuth (Google, Microsoft) and local strategy for email/password plus magic links.
- JWT tokens: include `tenantId`, `roles`, `permissions`, `deviceId`, `sessionId` claims. Short-lived access tokens + refresh tokens stored server-side for session revocation and device management.
- MFA: TOTP + SMS backup codes.
- RBAC: central authorization service that resolves role -> permissions. Policies enforced in both backend (guards/interceptors) and frontend (feature flags, route guards, menu rendering).

## RBAC & permission enforcement (summary)
- Roles: predefined (Owner, Admin, ProgramManager, MEO, Finance, DataCollector, Donor, Executive) + custom roles per tenant.
- Permissions: granular verbs (read:projects, write:projects, approve:activities, export:reports, manage:billing, manage:users, etc.).
- Enforcement: every controller/service checks permission via `PermissionGuard` which reads `tenantId` and `user` from context.

## Database design principles (brief)
- Use normalized collections for core entities (organizations, users, projects, grants, indicators, activities, reportingPeriods, documents).
- Embed where appropriate (small arrays, templates), reference for large relational sets.
- All tenant-scoped collections include `tenantId` and `createdBy`/`updatedBy` fields.
- Index heavy-read fields (tenantId + createdAt, tenantId + projectId + indicatorId) for reporting queries.

## Auditability & Compliance
- Immutable audit log collection: records for each create/update/delete with `tenantId`, `userId`, `timestamp`, `changeSet`, `requestId`.
- Exportable audit trails per tenant; retention policies configurable by tenant/plan.
- Encryption: enable at-rest and in-transit. Use field-level encryption for sensitive PII.

## Observability & SRE
- Centralized logs (structured JSON) with `tenantId` and request metadata; ship to ELK/Cloudwatch.
- Metrics: per-tenant metrics for usage, API errors, queue length, job duration.
- Alerts for payment failures, onboarding errors, or failing integrations.

## Security considerations
- Validate tenant resolution early; reject requests that attempt to specify another tenant.
- Use helmet, CSP, XSS protections, CSRF tokens for session-authenticated flows.
- Rate limiting per-tenant and per-user.
- Input validation, output encoding, and aggressive sanitization on file imports.

## Operational features
- Onboarding flow: create tenant, seed sample templates, provision Stripe customer, link payment method, and boot tenant settings.
- Billing: periodic webhooks from Stripe to manage plan state and feature entitlements.
- Tenant admin UI to promote to dedicated DB, export data, or delete tenant (soft delete, with retention window).

## Migration and scaling path
- Start with modular monolith + shared DB architecture for rapid delivery.
- Implement tenant-aware repository layer from day 1 to allow safe migration to per-tenant DB later.
- For scale: shard MongoDB by tenantId and enable dedicated DBs for heavy tenants.

## Next steps (short-term)
1. Design the canonical database schema for core modules with tenant scoping.
2. Design the RBAC permission model and API endpoints (OpenAPI spec) for Auth, Tenants, Projects, Indicators, Activities, Reporting, Billing.
3. Implement NestJS middleware for tenant resolution and permission guards.

---

Document created: concise blueprint for multi-tenant enforcement and operational constraints. For more detail I will produce a per-collection schema and an OpenAPI skeleton next; confirm and I will proceed.
