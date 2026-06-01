# Canonical Database Schema — Monival M&E SaaS

Notes:
- Primary deployment uses a shared MongoDB with `tenantId` on all tenant-scoped documents.
- Dedicated DB per tenant is supported for enterprise customers.
- All tenant-scoped collections have `{ tenantId: ObjectId, createdBy, updatedBy }`.
- Use compound indexes that include `tenantId` for performance and uniqueness.

Collections (high-level)

1. organizations
- Fields: _id, name, slug, domain, tenantSettings, billingCustomerId, planTier, createdAt, updatedAt, deletedAt
- Indexes: { slug: 1 } unique, { billingCustomerId: 1 }
- Purpose: tenant record and global settings.

2. users
- Fields: _id, tenantId, email, name, avatarUrl, isEmailVerified, providerAccounts[], roles[], customClaims, lastLoginAt, createdAt, updatedAt
- Indexes: { tenantId: 1, email: 1 } unique
- Notes: users are scoped to tenant (no cross-tenant sharing). Global admin accounts store tenantId=null.

3. roles
- Fields: _id, tenantId, key, name, description, permissions: [string], isDefault
- Indexes: { tenantId: 1, key: 1 } unique
- Purpose: allow custom role creation per tenant; built-in roles provisioned at onboarding.

4. permissions (static reference)
- Fields: code (e.g., projects:read), description, scope
- Purpose: canonical permission list used by UI and backend.

5. projects
- Fields: _id, tenantId, code, name, donorId, description, startDate, endDate, status, evaluationStatus, nextReviewDate, settings, metadata, createdBy, updatedBy
- Indexes: { tenantId: 1, code: 1 } unique

6. grants
- Fields: _id, tenantId, projectId, donorId, amount, currency, startDate, endDate, status, commitments[], disbursements[], agreements[], complianceNotes, createdBy, updatedBy
- Indexes: { tenantId:1, projectId:1 }

7. donors
- Fields: _id, tenantId, name, type, contactInfo, notes, createdBy, updatedBy
- Indexes: { tenantId:1, name:1 }

8. beneficiaries
- Fields: _id, tenantId, name, type (individual/household/group), demographics, location, vulnerabilityScore, enrollment[], customFields, createdBy, updatedBy
- Indexes: { tenantId:1, 'demographics.location': '2dsphere' } where appropriate

9. indicators
- Fields: _id, tenantId, projectId, parentId, code, title, description, level, unit, baseline, target, disaggregation:[], assumptions, trackingCadence, tags, createdBy, updatedBy
- Indexes: { tenantId:1, projectId:1, code:1 } unique per project

10. reporting_periods
- Fields: _id, tenantId, projectId, name, cadence, startDate, endDate, status, notes, createdBy, updatedBy
- Indexes: { tenantId:1, projectId:1 }

11. indicator_results
- Fields: _id, tenantId, reportingPeriodId, indicatorId, periodTarget, achieved, activityCount, narrative, status, calculatedAt, createdBy
- Indexes: { tenantId:1, reportingPeriodId:1, indicatorId:1 }

12. activities
- Fields: _id, tenantId, projectId, title, activityDate, indicatorId, activityType, status, partnerId, beneficiaryIds[], location (geo), participants, quantity, evidenceUrl, evidenceNotes, notes, approvedBy, approvedAt, createdBy, updatedBy
- Indexes: { tenantId:1, projectId:1, activityDate:-1 }

13. activity_templates
- Fields: _id, tenantId, name, formDefinition (json), createdBy

14. documents
- Fields: _id, tenantId, projectId?, ownerId?, filename, mimeType, size, storagePath, version, metadata, createdBy, createdAt
- StoragePath example: /{tenantId}/projects/{projectId}/documents/{uuid}

15. audit_logs
- Fields: _id, tenantId, userId, action (create/update/delete/export), resourceType, resourceId, timestamp, diff, requestId, ip
- Indexes: { tenantId:1, timestamp:-1 }
- Notes: immutable write-once records. Consider time-series collection or capped collection.

16. sessions & devices
- Fields: _id, tenantId, userId, deviceId, refreshTokenHash, issuedAt, expiresAt, lastSeenAt, ip, userAgent
- Indexes: { tenantId:1, userId:1 }

17. billing_subscriptions
- Fields: _id, tenantId, stripeCustomerId, stripeSubscriptionId, planId, status, trialEndsAt, currentPeriodEnd, invoices[], lastPaymentAttempt

18. workflows, approvals
- Fields: _id, tenantId, name, trigger, stages:[{ approvers, timeout, escalations }], stateRecords[]

19. feature_flags & settings
- Fields: _id, tenantId, key, value (json), environment (prod/staging)

20. notifications
- Fields: _id, tenantId, userId?, channel, type, payload, status, sentAt, readAt

21. search index (Elasticsearch/OpenSearch)
- Index documents with tenantId for global search and filtering.

Operational Indexing examples
- Unique indicator code per project: { tenantId:1, projectId:1, code:1 } unique
- Fast recent activities: { tenantId:1, projectId:1, activityDate:-1 }
- Audit timeline: { tenantId:1, timestamp:-1 }

Data access patterns
- Always filter by `tenantId` in queries at repository layer.
- Use projection to limit returned fields for listing endpoints.
- For heavy reporting, use pre-aggregated collections or scheduled ETL into analytics indices.

Privacy & PII
- Tag fields with sensitivity labels and use field-level encryption for PII (names, IDs) when required by tenant settings.

Backup & export
- Provide per-tenant export APIs that stream JSON/CSV and support S3 export. Support full DB snapshots for promoted tenants.
