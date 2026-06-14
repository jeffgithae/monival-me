# Evidara  M&E - MVP Roadmap & Implementation Plan

## Executive Summary
Your app has strong M&E fundamentals but needs feature completion and infrastructure work to reach MVP. With **2-3 weeks of focused development**, you can launch.

---

## 🎯 Immediate Priorities (MVP Must-Have)

### 1. **Grants Management** ✅ COMPLETED
- ✅ Create, read, update, delete grants
- ✅ Link grants to projects
- ✅ Budget tracking and spending updates
- ✅ Grant expiration alerts
- ✅ Budget summary dashboard

**Next Step:** Add to frontend UI (Angular components for grants list, detail, form)

---

### 2. **Email Notifications** (Est: 3-4 days)
**Why:** Users need notifications for invites, approvals, approaching deadlines

**Scope:**
- Team invite emails with 7-day token link
- Activity approval notifications (to M&E officer)
- Grant expiration alerts (to finance team)
- New member welcome email

**Implementation:**
```bash
npm install nodemailer @nestjs/mailer handlebars
```

**Files to create:**
- `src/email/email.service.ts` — Email templating and sending
- `src/email/email.module.ts`
- `src/email/templates/` — HTML email templates

**Integration points:**
- `members.service.ts` — Send invite on member creation
- `activities.service.ts` — Send approval notification
- `grants.service.ts` — Send expiration alert job

---

### 3. **API Documentation (Swagger/OpenAPI)** (Est: 1-2 days)
**Why:** Partners need to integrate with your API

**Implementation:**
```bash
npm install @nestjs/swagger swagger-ui-express
```

**Setup in `main.ts`:**
```typescript
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('Evidara  M&E API')
  .setDescription('NGO Monitoring & Evaluation Platform')
  .setVersion('1.0')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api/docs', app, document);
```

**Available at:** `http://localhost:3000/api/docs`

---

### 4. **Audit Logging** (Est: 2-3 days)
**Why:** Critical for compliance, donor trust, and debugging

**Scope:**
- Log all data changes (who, what, when, why)
- Track activity approvals/rejections
- Track grant spending updates
- Immutable log entries

**Schema:**
```typescript
@Schema({ timestamps: true })
export class AuditLog {
  organizationId: ObjectId;
  userId: ObjectId;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT';
  entity: 'Activity' | 'Grant' | 'Member' | 'Indicator';
  entityId: ObjectId;
  changes: { before: any; after: any }; // For updates
  reason?: string;
}
```

**Add to app structure:**
- `src/audit/audit.service.ts` — Log events
- Middleware or decorators to auto-log changes

---

### 5. **Pagination & Filtering** (Est: 2 days)
**Why:** Performance with large datasets

**Implement in all list endpoints:**
```typescript
GET /activities?page=1&limit=20&status=pending&projectId=xxx&dateFrom=&dateTo=
```

**Create utility:**
```typescript
// src/common/pagination/pagination.dto.ts
export class PaginationDto {
  page: number = 1;
  limit: number = 20;
}

export function applyPagination(query, page: number, limit: number) {
  return query.skip((page - 1) * limit).limit(limit);
}
```

---

## 🌐 Frontend Gaps (Angular)

### Current Routes
```
dashboard
projects/:id
settings/billing
settings/team
```

### Missing Routes (Add to `app.routes.ts`)
```typescript
// Grants
{ path: 'grants', component: GrantsListComponent },
{ path: 'grants/:id', component: GrantDetailComponent },
{ path: 'grants/new', component: GrantFormComponent },

// Budget/Finance
{ path: 'budget', component: BudgetDashboardComponent },
{ path: 'spending', component: SpendingReportComponent },

// Settings
{ path: 'settings/organization', component: OrgSettingsComponent },
```

### Components to Build (Est: 5-7 days)
1. **GrantsListComponent** — Table of grants, filters, search
2. **GrantFormComponent** — Create/edit grants
3. **GrantDetailComponent** — View, link projects, update spending
4. **BudgetDashboardComponent** — Summary, charts, spending breakdown
5. **AuditLogComponent** — View activity history
6. **OrganizationSettingsComponent** — Org name, country, logo

---

## 🔒 Security & Compliance

### Already Implemented ✅
- JWT authentication
- RBAC (6 roles)
- Organization isolation

### Add Before Launch
- [ ] Rate limiting (prevent abuse)
- [ ] Request validation (already have class-validator, ensure all DTOs use it)
- [ ] CORS configuration (restrict to known domains)
- [ ] HTTPS enforcement (production)
- [ ] Database backups (Mongo)

**Implementation (1 day):**
```bash
npm install @nestjs/throttler
```

---

## 📊 Testing & Quality

### Current State
- `test/jest-e2e.json` exists but limited coverage

### Add Before MVP
- [ ] Unit tests for critical services (auth, billing, grants)
- [ ] E2E tests for user journeys
- [ ] Test coverage: aim for >70%

**Quick wins:**
```bash
# Run existing tests
npm run test:cov

# Add tests for grants service
touch src/grants/grants.service.spec.ts
```

---

## 🚀 Launch Checklist (2-3 weeks)

| Item | Est. Days | Status | Owner |
|------|----------|--------|-------|
| Email notifications | 3-4 | ⏳ | Backend |
| API documentation (Swagger) | 1-2 | ⏳ | Backend |
| Audit logging | 2-3 | ⏳ | Backend |
| Pagination/filtering | 2 | ⏳ | Backend |
| Frontend: Grants components | 5-7 | ⏳ | Frontend |
| Frontend: Budget dashboard | 3-4 | ⏳ | Frontend |
| Frontend: Settings pages | 2-3 | ⏳ | Frontend |
| Security hardening | 1 | ⏳ | DevOps/Backend |
| Testing & bug fixes | 3-4 | ⏳ | QA |
| **Total** | **~25-30 days** | | |

---

## 💰 Post-MVP Features (Phase 2)

### High Value (1-2 months)
1. **CSV/Excel Import** — Bulk upload activities, indicators
2. **PDF Export** — Full reports, grant agreements
3. **Automated Reports** — Email reports on schedule
4. **Activity Geolocation** — Map activities on project
5. **Mobile App** — React Native for field officers

### Medium Value (2-3 months)
6. **Google Sheets Integration** — Sync data bidirectionally
7. **Slack Notifications** — Approvals, alerts to Slack
8. **Activity Templates** — Pre-built activity types
9. **Indicator Analytics** — Trends, forecasting
10. **Custom Branding** — White-label for resellers

---

## 📋 Quick Implementation Guide

### 1. Start with Email Notifications
```bash
cd api
npm install nodemailer @nestjs/mailer

# Create service
touch src/email/email.service.ts
touch src/email/email.module.ts
```

### 2. Add Swagger to main.ts
```typescript
// Place before app.listen()
const config = new DocumentBuilder()
  .setTitle('Evidara  M&E')
  .setVersion('1.0')
  .addBearerAuth()
  .build();
const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api/docs', app, document);
```

### 3. Create Audit Log Schema
```bash
mkdir -p src/audit
touch src/audit/audit.schema.ts
touch src/audit/audit.service.ts
```

### 4. Build Grants UI Components
```bash
cd ../web
ng generate component pages/grants/grants-list
ng generate component pages/grants/grant-detail
ng generate component pages/grants/grant-form
```

### 5. Add Routes
Update `web/src/app/app.routes.ts`

---

## 🎯 Success Metrics for MVP

- ✅ Users can create organizations and manage teams
- ✅ Users can log activities against indicators
- ✅ Users can track funding via grants
- ✅ Donors can view reports
- ✅ Users receive email notifications
- ✅ API is documented
- ✅ No critical bugs in user journeys
- ✅ Page loads < 2 seconds
- ✅ 95% uptime in staging

---

## 🆘 Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Database slowness | Add indexes, pagination, caching |
| User confusion | In-app tooltips, help docs, video tutorials |
| Data integrity | Audit logs, backups, validation |
| Performance | Monitor APM (e.g., New Relic), optimize queries |
| Security breach | Rate limiting, input validation, HTTPS, 2FA |

---

## 📞 Next Steps

1. **This week:** Implement email notifications + Swagger docs
2. **Next week:** Add audit logging + pagination
3. **Week 3:** Complete frontend components for grants & budget
4. **Week 4:** Testing, security review, launch prep

**Ready to code?** Let's start with email notifications or any of your choosing!
