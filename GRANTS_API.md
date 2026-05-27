# Grants Management Module - API Documentation

## Overview
The Grants module enables organizations to track funding from donors, manage budgets, and link grants to specific projects. It includes budget tracking, spending management, and grant expiration alerts.

## Features
- ✅ Create, read, update, delete grants
- ✅ Link grants to multiple projects
- ✅ Track spending against grant budget
- ✅ Budget summary across active grants
- ✅ Grant expiration alerts
- ✅ Donor linkage
- ✅ Reporting requirements tracking
- ✅ Multi-currency support

## Endpoints

### Create Grant
```
POST /grants
Authorization: Bearer {token}
Content-Type: application/json
Roles: owner, admin, finance

Body:
{
  "name": "USAID Feed the Future",
  "description": "Agricultural development grant",
  "donorId": "507f1f77bcf86cd799439011",
  "amount": 500000,
  "currency": "USD",
  "startDate": "2026-01-01",
  "endDate": "2026-12-31",
  "linkedProjects": ["507f1f77bcf86cd799439012"],
  "requiresMonthlyReporting": true,
  "requiresFinalReport": true,
  "termsAndConditions": "See attached agreement",
  "status": "active"
}

Response: 201 Created
{
  "_id": "507f1f77bcf86cd799439013",
  "organizationId": "507f1f77bcf86cd799439010",
  "name": "USAID Feed the Future",
  "amount": 500000,
  "amountSpent": 0,
  "currency": "USD",
  "status": "active",
  "createdAt": "2026-05-25T10:00:00Z",
  "updatedAt": "2026-05-25T10:00:00Z"
}
```

### List Grants
```
GET /grants?status=active&donorId=507f1f77bcf86cd799439011&search=USAID
Authorization: Bearer {token}
Roles: All authenticated roles

Query Parameters:
  - status: pending|active|completed|closed (optional)
  - donorId: MongoDB ID (optional)
  - search: Search by name or description (optional)

Response: 200 OK
[
  {
    "_id": "507f1f77bcf86cd799439013",
    "name": "USAID Feed the Future",
    "amount": 500000,
    "amountSpent": 150000,
    "currency": "USD",
    "status": "active",
    "donorId": { "_id": "507f1f77bcf86cd799439011", "name": "USAID" },
    "linkedProjects": [ ... ],
    "startDate": "2026-01-01",
    "endDate": "2026-12-31"
  }
]
```

### Get Budget Summary
```
GET /grants/budget-summary
Authorization: Bearer {token}
Roles: owner, admin, finance, me_officer, viewer

Response: 200 OK
{
  "totalGrantAmount": 1500000,
  "totalSpent": 350000,
  "remainingBudget": 1150000,
  "activeGrants": 3
}
```

### Get Expiring Grants
```
GET /grants/expiring?days=30
Authorization: Bearer {token}
Roles: owner, admin, finance, me_officer

Query Parameters:
  - days: Number of days to look ahead (default: 30)

Response: 200 OK
[
  {
    "_id": "507f1f77bcf86cd799439013",
    "name": "USAID Feed the Future",
    "endDate": "2026-06-15",
    "remainingDays": 21
  }
]
```

### Get Grants by Project
```
GET /grants/by-project/507f1f77bcf86cd799439012
Authorization: Bearer {token}
Roles: All authenticated roles

Response: 200 OK
[
  { grant objects linked to project }
]
```

### Get Single Grant
```
GET /grants/507f1f77bcf86cd799439013
Authorization: Bearer {token}
Roles: All authenticated roles

Response: 200 OK
{ grant object }
```

### Update Grant
```
PATCH /grants/507f1f77bcf86cd799439013
Authorization: Bearer {token}
Content-Type: application/json
Roles: owner, admin, finance

Body: (all fields optional)
{
  "name": "Updated Name",
  "status": "active",
  "linkedProjects": ["507f1f77bcf86cd799439012", "507f1f77bcf86cd799439014"]
}

Response: 200 OK
{ updated grant object }
```

### Update Grant Spending
```
PATCH /grants/507f1f77bcf86cd799439013/spending
Authorization: Bearer {token}
Content-Type: application/json
Roles: owner, admin, finance

Body:
{
  "amountSpent": 175000
}

Response: 200 OK
{ grant object with updated amountSpent }
```

### Delete Grant
```
DELETE /grants/507f1f77bcf86cd799439013
Authorization: Bearer {token}
Roles: owner, admin

Response: 204 No Content
```

## Data Model

### Grant Schema
```typescript
{
  organizationId: ObjectId,          // Multi-tenant organization
  name: String,                      // Grant name
  description: String,               // Detailed description
  donorId: ObjectId,                 // Reference to donor
  amount: Number,                    // Total grant amount
  currency: String,                  // ISO currency code (default: USD)
  amountSpent: Number,               // Amount expended from grant
  status: String,                    // pending|active|completed|closed
  startDate: Date,                   // Grant period start
  endDate: Date,                     // Grant period end
  linkedProjects: [ObjectId],        // Projects funded by this grant
  requiresMonthlyReporting: Boolean,  // Reporting requirement flag
  requiresFinalReport: Boolean,      // Final report requirement
  termsAndConditions: String,        // Grant terms
  createdBy: ObjectId,               // User who created
  updatedBy: ObjectId,               // User who last updated
  createdAt: Date,                   // Creation timestamp
  updatedAt: Date                    // Last update timestamp
}
```

## Usage Examples

### Grant Lifecycle
1. **Create** a grant with status "pending"
2. **Link projects** that will be funded
3. **Update spending** as activities are logged
4. **Monitor** budget via budget-summary endpoint
5. **Check expiring** grants before deadline
6. **Close** grant at end of period

### Budget Tracking Workflow
```
Total Grant Amount: $500,000
  ├─ Linked to Project A (50%)
  ├─ Linked to Project B (30%)
  └─ Linked to Project C (20%)

Activities logged in projects → amounts spent → automatic tracking
```

## Error Handling

### 400 Bad Request
- Invalid date format
- Amount exceeds grant budget
- Required fields missing

### 403 Forbidden
- Organization mismatch
- Insufficient role permissions
- Amount spent exceeds grant total

### 404 Not Found
- Grant ID does not exist

### 500 Internal Server Error
- Database connection issue

## Best Practices

1. **Always link grants to projects** for impact tracking
2. **Update spending regularly** to maintain accurate budgets
3. **Set reporting requirements** during grant creation
4. **Use descriptions** to document terms and conditions
5. **Monitor expiring grants** and plan next funding
6. **Review budget summary** monthly

## Integration Points

### With Activities Module
- Activities can be linked to projects that are funded by grants
- Grant spending is updated as activities are logged

### With Donors Module
- Each grant references one donor
- Enables donor-specific reporting

### With Projects Module
- Grants can fund multiple projects
- Projects can be funded by multiple grants

### With Reports Module
- Include grant budget tracking in donor reports
- Show spending percentage against budget
