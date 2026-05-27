# Grants Management - Quick Start Guide

## ✅ What's Implemented

A complete **Grants Management module** for tracking funding, budgets, and donor relationships.

### Key Features
- **Create & manage grants** with budget amounts
- **Track spending** against budgets
- **Link grants to projects** for impact tracking
- **Budget summary** across active grants
- **Expiration alerts** for grant periods
- **Donor linkage** for relationship tracking
- **RBAC support** — finance-focused permissions

---

## 🚀 How to Use (Backend API)

### 1. Create a Grant
```bash
curl -X POST http://localhost:3000/api/grants \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Global Fund Water Project",
    "donorId": "DONOR_ID",
    "amount": 250000,
    "currency": "USD",
    "startDate": "2026-06-01",
    "endDate": "2027-05-31",
    "linkedProjects": ["PROJECT_ID_1", "PROJECT_ID_2"],
    "requiresMonthlyReporting": true,
    "status": "active"
  }'
```

### 2. List All Grants
```bash
curl http://localhost:3000/api/grants \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 3. Get Budget Summary
```bash
curl http://localhost:3000/api/grants/budget-summary \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "totalGrantAmount": 750000,
  "totalSpent": 185000,
  "remainingBudget": 565000,
  "activeGrants": 3
}
```

### 4. Update Grant Spending
```bash
curl -X PATCH http://localhost:3000/api/grants/GRANT_ID/spending \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amountSpent": 200000}'
```

### 5. Check Expiring Grants
```bash
curl "http://localhost:3000/api/grants/expiring?days=30" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 📝 Data Model

```typescript
Grant {
  _id: ObjectId,
  organizationId: ObjectId,      // Multi-tenant
  name: String,                  // "USAID Feed the Future"
  description: String,
  donorId: ObjectId,             // Links to Donor
  amount: Number,                // Budget (e.g., 500000)
  currency: String,              // "USD"
  amountSpent: Number,           // Tracked spending
  status: String,                // "pending" | "active" | "completed" | "closed"
  startDate: Date,               // Period start
  endDate: Date,                 // Period end
  linkedProjects: [ObjectId],    // Projects funded by this grant
  requiresMonthlyReporting: Boolean,
  requiresFinalReport: Boolean,
  termsAndConditions: String,
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🔑 Access Control

### Who Can Do What?

| Action | Roles |
|--------|-------|
| Create grant | owner, admin, finance |
| View grants | All authenticated users |
| Update grant | owner, admin, finance |
| Update spending | owner, admin, finance |
| Delete grant | owner, admin |

---

## 🧩 Integration with Existing Modules

### With **Projects Module**
- Grants can fund multiple projects
- Link projects at grant creation or update
- Example: "Global Fund" grant funds both "Water" and "Sanitation" projects

### With **Donors Module**
- Each grant links to one donor
- Enables: "How much have we received from each donor?"
- Query: `GET /grants?donorId=DONOR_ID`

### With **Activities Module**
- Activities are logged against projects
- Projects are funded by grants
- Workflow: Activity → Project → Grant → Budget tracking

### With **Reports Module**
- Include grant spending in donor reports
- Show "Budget vs. Spent" for each funding relationship
- Future: PDF reports with grant details

---

## 💡 Example Workflows

### Workflow 1: Multi-Project Grant Funding
```
1. Donor provides $500k grant for agricultural development
2. Grant linked to: "Crop Production" + "Farmer Training" projects
3. Activities logged in both projects
4. Spending automatically tracked against grant budget
5. Monthly reports show which project consumed which budget
```

### Workflow 2: Budget Monitoring
```
1. Finance team checks budget-summary endpoint
2. Sees: $1.5M total grants, $850k spent, $650k remaining
3. Filters by status="active" to see only current grants
4. Reviews expiring grants (ending in 30 days)
5. Prepares follow-up requests to donors
```

### Workflow 3: Activity-to-Budget Trace
```
1. Field officer logs activity: "Trained 50 farmers" in Project A
2. Activity is linked to "Crop Production" project
3. Project is funded by "USAID Feed the Future" grant
4. Finance officer updates grant: "amountSpent: 175000"
5. Spending report shows $175k of $500k used (35% burn rate)
```

---

## 🐛 Testing the Module

### 1. Run the Backend
```bash
cd api
npm run start:dev
```

Should see in logs:
```
[NestFactory] Starting Nest application...
[InstanceLoader] GrantsModule dependencies initialized {+XXms}
```

### 2. Test Create Grant (via Postman or cURL)
- Method: POST
- URL: `http://localhost:3000/api/grants`
- Header: `Authorization: Bearer {your_jwt_token}`
- Body: (see "Create a Grant" above)

### 3. Verify Database
```bash
# In MongoDB shell
use monival-me
db.grants.findOne()
```

Should return your created grant with `organizationId`, `amount`, `status`, etc.

---

## 📋 Next Steps

### Frontend (Angular)
Need to build UI components:
```
src/app/pages/grants/
├── grants-list/      - Table of grants
├── grant-detail/     - View grant details
├── grant-form/       - Create/edit form
└── budget-dashboard/ - Budget summary charts
```

### Backend Enhancements
1. Email notifications on expiration
2. Audit logging for all changes
3. API documentation (Swagger)
4. Pagination for large lists

### Routes to Add
```typescript
// In web/src/app/app.routes.ts
{ path: 'grants', component: GrantsListComponent },
{ path: 'grants/:id', component: GrantDetailComponent },
{ path: 'grants/new', component: GrantFormComponent },
```

---

## 🆘 Troubleshooting

### Issue: Cannot create grant
**Check:**
- JWT token is valid and not expired
- User has "finance" role
- donorId exists in database
- linkedProjects IDs are valid

### Issue: Spending update rejected
**Check:**
- amountSpent doesn't exceed grant amount
- Grant ID is correct
- Organization ID matches (multi-tenancy)

### Issue: No results in expiring grants
**Check:**
- Grants have endDate within 30 days
- Status is not "closed"
- Check raw data: `GET /grants`

---

## 📚 See Also
- `GRANTS_API.md` — Complete API reference
- `MVP_ROADMAP.md` — Launch timeline and priorities
- `api/src/grants/` — Source code
