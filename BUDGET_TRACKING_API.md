# Budget Tracking Module - Complete Documentation

## Overview
The Budget Tracking module enables organizations to manage budgets, track spending against allocations, and analyze variance over time. It provides comprehensive budget control with:

- **Budget Allocations** — Overall budget categories
- **Line Items** — Detailed budget line breakdown
- **Variance Analysis** — Track budget vs. actual spending
- **Real-time Uncommitted Amount** — Available budget tracking

---

## Data Models

### Budget Allocation
```typescript
{
  organizationId: ObjectId,           // Multi-tenant org
  name: String,                       // "Operations 2026"
  description: String,                // Detailed description
  projectId: ObjectId,                // Optional project link
  allocatedAmount: Number,            // Total budget (e.g., 100000)
  spentAmount: Number,                // Amount spent to date
  currency: String,                   // "USD" (default)
  category: String,                   // operational|project|emergency|strategic
  status: String,                     // draft|approved|active|closed
  fiscalYear: Number,                 // 2026
  startDate: Date,                    // Period start
  endDate: Date,                      // Period end
  uncommittedAmount: Number,          // allocatedAmount - commitments
  allowedExpenseTypes: [String],      // Restricted categories
  approvedBy: ObjectId,               // User who approved
  approvalDate: Date,                 // When approved
  createdBy: ObjectId,                // Creator
  createdAt: Date,                    // Timestamp
  updatedAt: Date
}
```

### Budget Line Item
```typescript
{
  budgetAllocationId: ObjectId,       // Parent budget
  organizationId: ObjectId,
  description: String,                // "Salary: Project Manager"
  amount: Number,                     // Line item budget
  spent: Number,                      // Amount spent
  category: String,                   // Expense category
  status: String,                     // planned|committed|spent|cancelled
  notes: String,                      // Additional info
  linkedActivity: ObjectId,           // Link to activity
  createdAt: Date,
  updatedAt: Date
}
```

### Budget Variance
```typescript
{
  organizationId: ObjectId,
  budgetAllocationId: ObjectId,
  period: String,                     // "2026-01" (YYYY-MM)
  budgetedAmount: Number,             // Planned budget for period
  actualAmount: Number,               // Actual spending
  variance: Number,                   // budgetedAmount - actualAmount
  variancePercentage: Number,         // (variance / budgetedAmount) * 100
  trend: String,                      // favorable|unfavorable
  notes: String,                      // Commentary
  createdAt: Date,
  updatedAt: Date
}
```

---

## API Endpoints

### Create Budget Allocation
```
POST /budget/allocations
Authorization: Bearer {token}
Roles: owner, admin, finance

Body:
{
  "name": "Annual Operating Budget",
  "description": "2026 operational expenses",
  "projectId": "507f1f77bcf86cd799439012",
  "allocatedAmount": 500000,
  "currency": "USD",
  "category": "operational",
  "fiscalYear": 2026,
  "startDate": "2026-01-01",
  "endDate": "2026-12-31",
  "allowedExpenseTypes": ["salaries", "travel", "supplies"]
}

Response: 201 Created
{
  "_id": "507f1f77bcf86cd799439013",
  "name": "Annual Operating Budget",
  "allocatedAmount": 500000,
  "spentAmount": 0,
  "uncommittedAmount": 500000,
  "status": "draft"
}
```

### List Budget Allocations
```
GET /budget/allocations?status=active&fiscalYear=2026&projectId=xxx
Authorization: Bearer {token}
Roles: All authenticated

Query Parameters:
  - status: draft|approved|active|closed
  - fiscalYear: e.g., 2026
  - projectId: Filter by project

Response: 200 OK
[
  {
    "_id": "...",
    "name": "...",
    "allocatedAmount": 500000,
    "spentAmount": 125000,
    "uncommittedAmount": 375000,
    "status": "active"
  }
]
```

### Get Budget Allocation
```
GET /budget/allocations/507f1f77bcf86cd799439013
Authorization: Bearer {token}

Response: 200 OK
{ budget allocation details }
```

### Update Budget Allocation
```
PATCH /budget/allocations/507f1f77bcf86cd799439013
Authorization: Bearer {token}
Roles: owner, admin, finance

Body: (all fields optional)
{
  "spentAmount": 150000,
  "status": "active"
}
```

### Approve Budget
```
POST /budget/allocations/507f1f77bcf86cd799439013/approve
Authorization: Bearer {token}
Roles: owner, admin

Body:
{
  "approverUserId": "507f1f77bcf86cd799439014",
  "notes": "Approved for Q1"
}

Status changes: draft → approved
```

### Delete Budget Allocation
```
DELETE /budget/allocations/507f1f77bcf86cd799439013
Authorization: Bearer {token}
Roles: owner, admin

Note: Only draft budgets can be deleted
```

---

## Line Items API

### Create Line Item
```
POST /budget/line-items
Authorization: Bearer {token}
Roles: owner, admin, finance

Body:
{
  "budgetAllocationId": "507f1f77bcf86cd799439013",
  "description": "Staff: 3 x Field Officers @ $800/month",
  "amount": 28800,
  "category": "salaries",
  "notes": "Annual cost",
  "linkedActivity": "507f1f77bcf86cd799439015"
}

Response: 201 Created
{ line item with computed uncommitted amount }
```

### Get Line Items by Budget
```
GET /budget/line-items/507f1f77bcf86cd799439013
Authorization: Bearer {token}

Response: 200 OK
[
  {
    "description": "Staff: 3 x Field Officers @ $800/month",
    "amount": 28800,
    "spent": 7200,
    "status": "committed"
  },
  ...
]
```

### Update Line Item
```
PATCH /budget/line-items/507f1f77bcf86cd799439016
Authorization: Bearer {token}
Roles: owner, admin, finance

Body:
{
  "spent": 10000,
  "status": "spent"
}
```

### Delete Line Item
```
DELETE /budget/line-items/507f1f77bcf86cd799439016
Authorization: Bearer {token}
Roles: owner, admin, finance
```

---

## Variance Analysis API

### Calculate Variance
```
POST /budget/variance/507f1f77bcf86cd799439013
Authorization: Bearer {token}
Roles: owner, admin, finance

Body:
{
  "period": "2026-01"  // YYYY-MM format
}

Response: 201 Created
{
  "period": "2026-01",
  "budgetedAmount": 50000,
  "actualAmount": 45000,
  "variance": 5000,
  "variancePercentage": 10,
  "trend": "favorable"
}
```

### Get Variance Analysis
```
GET /budget/variance/507f1f77bcf86cd799439013?fromPeriod=2026-01&toPeriod=2026-12
Authorization: Bearer {token}
Roles: owner, admin, finance, me_officer, viewer

Query Parameters:
  - fromPeriod: Start period (YYYY-MM)
  - toPeriod: End period (YYYY-MM)

Response: 200 OK
[
  { variance for 2026-01 },
  { variance for 2026-02 },
  ...
]
```

---

## Summary API

### Get Budget Summary
```
GET /budget/summary/507f1f77bcf86cd799439010?fiscalYear=2026
Authorization: Bearer {token}
Roles: All authenticated

Query Parameters:
  - fiscalYear: Optional year filter

Response: 200 OK
{
  "totalAllocated": 1000000,
  "totalSpent": 350000,
  "totalUncommitted": 650000,
  "allocations": [
    {
      "name": "Operations",
      "allocated": 500000,
      "spent": 125000,
      "variance": 375000
    },
    {
      "name": "Projects",
      "allocated": 500000,
      "spent": 225000,
      "variance": 275000
    }
  ]
}
```

---

## Workflows

### Budget Creation to Tracking
```
1. Create Budget Allocation
   ├─ Status: draft
   ├─ Amount: $500,000
   └─ Uncommitted: $500,000

2. Create Line Items
   ├─ Add 10 line items ($500k total)
   └─ Uncommitted updates automatically

3. Approve Budget
   └─ Status: approved → active

4. Update Spending (Monthly)
   ├─ Finance: Update spentAmount
   └─ System: Calculate variance

5. Review Variance
   ├─ Check monthly variance report
   ├─ Identify unfavorable trends
   └─ Adjust spending as needed

6. Close Budget
   └─ Status: closed (archival)
```

### Variance Analysis Workflow
```
Period: January 2026
├─ Budgeted: $50,000 (line items)
├─ Actual: $47,500 (spent)
├─ Variance: $2,500 (favorable)
└─ Trend: On track (10% favorable variance)

Action: If unfavorable variance > 15%
├─ Alert finance team
├─ Review spending
└─ Adjust forecast
```

---

## Key Features

### Automatic Uncommitted Calculation
```
Uncommitted = Allocated - (Sum of Line Item Amounts)

Example:
├─ Allocated: $100,000
├─ Line Items: $85,000
└─ Uncommitted: $15,000 (available for new line items)
```

### Variance Analysis
```
Favorable Variance = Budget > Actual (under budget)
Unfavorable Variance = Budget < Actual (over budget)

Example:
├─ Budget: $50,000
├─ Actual: $55,000
├─ Variance: -$5,000 (unfavorable)
└─ Percentage: -10% (over by 10%)
```

### Multi-Category Support
- **Operational** — Regular operating expenses
- **Project** — Project-specific budgets
- **Emergency** — Contingency funds
- **Strategic** — Strategic initiatives

### Status Workflow
```
draft → approved → active → closed
        ↑               ↓
        └───── Can update ─────┘
```

---

## Access Control

| Action | Roles |
|--------|-------|
| Create allocation | owner, admin, finance |
| View all | All authenticated |
| Update allocation | owner, admin, finance |
| Approve budget | owner, admin |
| Delete allocation | owner, admin |
| Create line item | owner, admin, finance |
| Update variance | owner, admin, finance |
| View variance | owner, admin, finance, me_officer, viewer |

---

## Integration Points

### With Grants Module
- Link budget allocations to grant budgets
- Track grant spending through budget line items

### With Projects Module
- Link project budgets to project allocations
- Monitor project spending against budget

### With Activities Module
- Link line items to activities
- Auto-update spending when activities are logged

---

## Best Practices

1. **Set realistic budgets** — Base on historical data
2. **Create line items** — Break down into detailed categories
3. **Review monthly** — Check variance trends
4. **Act early** — Address unfavorable variance quickly
5. **Restrict categories** — Use allowedExpenseTypes for controls
6. **Link to projects** — Track project-specific budgets
7. **Approve formally** — Require owner/admin approval
8. **Archive annually** — Close old budgets, create new fiscal year

---

## Error Handling

### 400 Bad Request
- Invalid fiscal year
- Budget end date before start date
- Line item amount exceeds allocation

### 403 Forbidden
- Cannot delete active budget
- Amount spent exceeds allocation
- Insufficient permissions

### 404 Not Found
- Budget allocation not found
- Line item not found

### 409 Conflict
- Budget status doesn't allow operation
