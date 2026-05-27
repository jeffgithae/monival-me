# Balanced Scorecard (BSC) Module - Complete Documentation

## Overview
The Balanced Scorecard module enables strategic management using the classic 4-perspective BSC framework. Organizations define strategic initiatives across Financial, Customer, Internal Process, and Learning & Growth perspectives, then track execution in real-time.

---

## Data Model

### Balanced Scorecard
```typescript
{
  organizationId: ObjectId,           // Multi-tenant org
  name: String,                       // "2026 Strategic Plan"
  description: String,
  fiscalYear: Number,                 // 2026
  status: String,                     // draft|active|archived
  perspectives: [
    {
      perspective: String,            // financial|customer|internal|learning
      strategicTheme: String,         // e.g., "Operational Excellence"
      objectives: [
        {
          title: String,              // "Increase Revenue by 20%"
          description: String,
          weight: Number,             // 0-100: importance weight
          target: Number,             // e.g., 1000000
          current: Number,            // Current progress (default: 0)
          status: String              // on_track|at_risk|off_track
        }
      ]
    }
  ],
  createdBy: ObjectId,                // Creator
  lastReviewedBy: ObjectId,           // Who reviewed last
  lastReviewDate: Date,               // Last review timestamp
  createdAt: Date,
  updatedAt: Date
}
```

### 4 Perspectives Structure
```
Financial Perspective
├─ Revenue Growth
├─ Cost Efficiency
├─ Profitability
└─ Financial Health

Customer Perspective
├─ Satisfaction
├─ Retention
├─ Market Share
└─ Brand Reputation

Internal Process Perspective
├─ Operational Efficiency
├─ Quality
├─ Delivery Speed
└─ Innovation

Learning & Growth Perspective
├─ Employee Development
├─ Organizational Learning
├─ Capability Building
└─ Culture
```

---

## API Endpoints

### Create Balanced Scorecard
```
POST /bsc
Authorization: Bearer {token}
Roles: owner, admin, me_officer

Body:
{
  "name": "2026 Strategic Initiative",
  "description": "Comprehensive strategic plan for 2026",
  "fiscalYear": 2026,
  "perspectives": [
    {
      "perspective": "financial",
      "strategicTheme": "Sustainable Growth",
      "objectives": [
        {
          "title": "Increase Donor Revenue",
          "description": "Grow funding from donors by 25%",
          "weight": 40,
          "target": 2500000,
          "current": 0,
          "status": "on_track"
        },
        {
          "title": "Reduce Operational Costs",
          "description": "Cut operational costs by 15%",
          "weight": 30,
          "target": 100000,
          "current": 0,
          "status": "on_track"
        }
      ]
    },
    {
      "perspective": "customer",
      "strategicTheme": "Enhanced Partnerships",
      "objectives": [
        {
          "title": "Increase Partner Satisfaction",
          "description": "Achieve 95% partner satisfaction score",
          "weight": 50,
          "target": 95,
          "current": 0,
          "status": "on_track"
        }
      ]
    },
    {
      "perspective": "internal",
      "strategicTheme": "Process Excellence",
      "objectives": [
        {
          "title": "Improve Report Turnaround",
          "description": "Reduce donor report generation to 5 days",
          "weight": 50,
          "target": 5,
          "current": 0,
          "status": "on_track"
        }
      ]
    },
    {
      "perspective": "learning",
      "strategicTheme": "Capability Building",
      "objectives": [
        {
          "title": "Team Skills Enhancement",
          "description": "Complete training for 100% of team",
          "weight": 60,
          "target": 100,
          "current": 0,
          "status": "on_track"
        }
      ]
    }
  ]
}

Response: 201 Created
{
  "_id": "507f...",
  "name": "2026 Strategic Initiative",
  "fiscalYear": 2026,
  "status": "draft",
  "perspectives": [ ... ]
}
```

### List Balanced Scorecards
```
GET /bsc?fiscalYear=2026&status=active
Authorization: Bearer {token}
Roles: owner, admin, me_officer, finance, viewer

Query Parameters:
  - fiscalYear: Filter by year
  - status: draft|active|archived

Response: 200 OK
[
  {
    "_id": "507f...",
    "name": "2026 Strategic Initiative",
    "fiscalYear": 2026,
    "status": "active"
  }
]
```

### Get Single Balanced Scorecard
```
GET /bsc/507f1f77bcf86cd799439013
Authorization: Bearer {token}

Response: 200 OK
{ full balanced scorecard with all perspectives and objectives }
```

### Update Balanced Scorecard
```
PATCH /bsc/507f1f77bcf86cd799439013
Authorization: Bearer {token}
Roles: owner, admin, me_officer

Body: (optional fields)
{
  "status": "active",
  "perspectives": [ ... updated perspectives ... ]
}
```

### Update Objective
```
PATCH /bsc/507f1f77bcf86cd799439013/objective/0/0
Authorization: Bearer {token}
Roles: owner, admin, me_officer, finance

Parameters:
  - id: Scorecard ID
  - perspectiveIndex: 0-3 (financial, customer, internal, learning)
  - objectiveIndex: Index of objective within perspective

Body:
{
  "title": "Updated Objective Title",
  "current": 850000,           // Updated progress
  "status": "at_risk"          // on_track|at_risk|off_track
}

Response: 200 OK
{ updated scorecard }
```

### Get Performance Summary
```
GET /bsc/507f1f77bcf86cd799439013/performance
Authorization: Bearer {token}

Response: 200 OK
{
  "overallScore": 78,           // 0-100: aggregate score
  "perspectives": [
    {
      "name": "financial",
      "score": 85,              // Avg score for perspective
      "objectiveCount": 2,
      "onTrackCount": 2,
      "atRiskCount": 0,
      "offTrackCount": 0
    },
    {
      "name": "customer",
      "score": 72,
      "objectiveCount": 1,
      "onTrackCount": 0,
      "atRiskCount": 1,
      "offTrackCount": 0
    },
    ...
  ]
}
```

### Mark as Reviewed
```
POST /bsc/507f1f77bcf86cd799439013/mark-reviewed
Authorization: Bearer {token}
Roles: owner, admin, me_officer

Body:
{
  "reviewerUserId": "507f1f77bcf86cd799439014"
}

Response: 200 OK
{ scorecard with lastReviewedBy and lastReviewDate updated }
```

### Delete Balanced Scorecard
```
DELETE /bsc/507f1f77bcf86cd799439013
Authorization: Bearer {token}
Roles: owner, admin

Note: Only draft scorecards can be deleted
```

---

## Workflows

### Strategic Planning Cycle
```
Q1: Create & Plan
├─ Define strategic themes
├─ Set perspective objectives
└─ Status: draft

Q2: Activate & Execute
├─ Approve scorecard
├─ Status: active
└─ Begin tracking

Q3: Monitor & Adjust
├─ Update objective progress
├─ Review performance summary
├─ Identify at-risk initiatives
└─ Make adjustments

Q4: Review & Archive
├─ Final performance review
├─ Mark as reviewed
├─ Archive scorecard
└─ Status: archived
```

### Progress Tracking Workflow
```
Monthly Updates:
├─ Update "current" values for each objective
├─ Set status: on_track|at_risk|off_track
├─ Mark as reviewed by executive
└─ System calculates overall score

Score Calculation:
├─ For each objective: (current/target) * 100 = % achievement
├─ Perspective score = avg of objectives in perspective
├─ Overall score = avg of all perspective scores
└─ Result: 0-100 scale
```

---

## Key Features

### 4-Perspective Framework
```
Financial (Bottom Line)
  └─ How do we create shareholder value?

Customer (External)
  └─ How do we meet stakeholder expectations?

Internal Process (Operations)
  └─ How do we operate efficiently?

Learning & Growth (Future)
  └─ How do we improve and innovate?
```

### Objective Weighting
- Each objective has a weight (0-100)
- Can prioritize strategic initiatives
- Used in analytics (future enhancement)

### Status Tracking
```
on_track ✅      - On schedule to achieve target
at_risk ⚠️        - May not achieve target
off_track ❌      - Off schedule
```

### Performance Scoring
```
Score = (current_value / target_value) * 100
Example:
├─ Target Revenue: $2,500,000
├─ Current: $2,000,000
├─ Progress: (2,000,000 / 2,500,000) * 100 = 80%
└─ Status: on_track
```

---

## Example: Non-Profit Balanced Scorecard

### Financial Perspective
- Achieve $5M annual budget
- Maintain 85% program spend ratio
- Reduce fundraising costs by 10%

### Stakeholder Perspective
- 90% beneficiary satisfaction
- 50 new partner organizations
- Increase geographic reach to 5 countries

### Internal Process Perspective
- Complete projects 95% on time
- Achieve zero critical compliance issues
- Reduce project cycle time by 20%

### Learning & Growth Perspective
- Train 100% of staff on new systems
- Establish 3 innovation initiatives
- Develop succession plans for 5 key roles

---

## Access Control

| Action | Roles |
|--------|-------|
| Create | owner, admin, me_officer |
| View | All authenticated |
| Update | owner, admin, me_officer |
| Update objective | owner, admin, me_officer, finance |
| Mark reviewed | owner, admin, me_officer |
| Delete | owner, admin |

---

## Best Practices

1. **Align with Strategy** — Map to organizational mission
2. **Balance Perspectives** — Include all 4 perspectives
3. **Set SMART Targets** — Specific, Measurable, Achievable, Relevant, Time-bound
4. **Monthly Reviews** — Regular progress updates
5. **Link to Operations** — Connect objectives to daily work
6. **Communicate Widely** — Share scorecard with team
7. **Update Responsively** — Adjust if circumstances change
8. **Archive Old Scorecards** — Keep history for learning

---

## Integration Points

### With OKRs
- OKRs (quarterly) support BSC (annual) strategy
- Roll up OKR progress to relevant BSC objectives

### With Projects
- Link projects to BSC customer/internal perspectives
- Track project execution against scorecard

### With Grants
- Link funding to financial perspective targets
- Track grant milestones against objectives

---

## Example: Quarterly Review

```
Reviewing 2026 Strategic Initiative:

Financial Perspective: 82% (2/3 on track)
├─ Donor Revenue: 80% (at_risk) - $2.4M of $2.5M
├─ Cost Reduction: 90% (on_track) - $90K saved
└─ Action: Increase outreach efforts

Customer Perspective: 75% (1/2 on track)
├─ Partner Satisfaction: 78% (at_risk) - 78 of 95 score
└─ Action: Schedule partner feedback session

Internal Process: 88% (on_track)
└─ All initiatives tracking to plan

Learning & Growth: 95% (on_track)
└─ Training 95% complete

Overall Score: 85%  ✅ STRONG PERFORMANCE
```

---

## Error Handling

### 400 Bad Request
- Invalid perspective (must be financial, customer, internal, learning)
- Weight not 0-100
- Target value cannot be negative

### 403 Forbidden
- Cannot delete active scorecard
- Insufficient permissions

### 404 Not Found
- Scorecard not found
- Objective index out of bounds

### 409 Conflict
- Status doesn't allow operation
