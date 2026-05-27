# OKRs (Objectives and Key Results) Module - Complete Documentation

## Overview
The OKRs module implements the Objectives and Key Results framework for ambitious goal-setting and execution. Organizations set quarterly OKRs with measurable key results, track progress, and adjust strategy based on results.

---

## Data Model

### OKR
```typescript
{
  organizationId: ObjectId,           // Multi-tenant org
  title: String,                      // "Scale Impact to 3 New Countries"
  description: String,                // Detailed description
  quarter: Number,                    // 1-4 (Q1, Q2, Q3, Q4)
  year: Number,                       // e.g., 2026
  status: String,                     // draft|active|completed|archived
  ownerUserId: ObjectId,              // Who owns this OKR
  keyResults: [
    {
      title: String,                  // "Launch programs in Rwanda"
      description: String,
      targetValue: Number,            // e.g., 50000 (target beneficiaries)
      currentValue: Number,           // Current progress (default: 0)
      unit: String,                   // "beneficiaries", "schools", "%"
      confidence: Number,             // 0-100: confidence level
      status: String,                 // not_started|in_progress|at_risk|completed
      notes: String                   // Commentary
    }
  ],
  linkedProjects: [ObjectId],         // Projects supporting this OKR
  progressPercentage: Number,         // Auto-calculated 0-100
  createdBy: ObjectId,
  reviewedBy: ObjectId,               // Who reviewed
  reviewDate: Date,                   // Review timestamp
  createdAt: Date,
  updatedAt: Date
}
```

---

## API Endpoints

### Create OKR
```
POST /okrs
Authorization: Bearer {token}
Roles: owner, admin, me_officer

Body:
{
  "title": "Achieve 50% Gender Parity in Leadership",
  "description": "Increase women in management positions from 20% to 50%",
  "quarter": 4,
  "year": 2026,
  "ownerUserId": "507f1f77bcf86cd799439014",
  "keyResults": [
    {
      "title": "Hire 3 female directors",
      "description": "Add 3 women to director-level positions",
      "targetValue": 3,
      "currentValue": 0,
      "unit": "positions",
      "confidence": 85,
      "status": "not_started"
    },
    {
      "title": "Promote 2 women to manager",
      "description": "Promote 2 women from specialist to manager",
      "targetValue": 2,
      "currentValue": 0,
      "unit": "promotions",
      "confidence": 75,
      "status": "not_started"
    },
    {
      "title": "Provide leadership training to 10 women",
      "description": "Executive development program for high-potential women",
      "targetValue": 10,
      "currentValue": 0,
      "unit": "people",
      "confidence": 95,
      "status": "not_started"
    }
  ],
  "linkedProjects": ["507f1f77bcf86cd799439012"],
  "status": "draft"
}

Response: 201 Created
{
  "_id": "507f...",
  "title": "Achieve 50% Gender Parity in Leadership",
  "quarter": 4,
  "year": 2026,
  "status": "draft",
  "progressPercentage": 0,
  "keyResults": [ ... ]
}
```

### List OKRs
```
GET /okrs?status=active&quarter=4&year=2026&ownerUserId=xxx
Authorization: Bearer {token}
Roles: All authenticated

Query Parameters:
  - status: draft|active|completed|archived
  - quarter: 1-4
  - year: e.g., 2026
  - ownerUserId: Filter by owner

Response: 200 OK
[
  {
    "_id": "507f...",
    "title": "...",
    "quarter": 4,
    "year": 2026,
    "status": "active",
    "progressPercentage": 42
  }
]
```

### Get Quarterly OKRs
```
GET /okrs/quarterly/2026/4
Authorization: Bearer {token}

Response: 200 OK
[ all OKRs for Q4 2026 ]
```

### Get Single OKR
```
GET /okrs/507f1f77bcf86cd799439013
Authorization: Bearer {token}

Response: 200 OK
{
  "_id": "507f...",
  "title": "...",
  "keyResults": [ ... ],
  "progressPercentage": 42,
  ...
}
```

### Get OKR Progress
```
GET /okrs/507f1f77bcf86cd799439013/progress
Authorization: Bearer {token}

Response: 200 OK
{
  "overallProgress": 42,        // 0-100: % completion
  "keyResults": [
    {
      "title": "Hire 3 female directors",
      "targetValue": 3,
      "currentValue": 1,
      "progress": 33,           // (1/3) * 100
      "confidence": 85,
      "status": "in_progress"
    },
    ...
  ]
}
```

### Update OKR
```
PATCH /okrs/507f1f77bcf86cd799439013
Authorization: Bearer {token}
Roles: owner, admin, me_officer

Body: (all fields optional)
{
  "title": "Updated Title",
  "status": "active",
  "ownerUserId": "507f1f77bcf86cd799439015"
}

Note: Status changes draft → active auto-activates
```

### Update Key Result
```
PATCH /okrs/507f1f77bcf86cd799439013/key-result/0
Authorization: Bearer {token}
Roles: owner, admin, me_officer, finance

Parameters:
  - id: OKR ID
  - krIndex: Index of key result (0-2)

Body:
{
  "currentValue": 1,                    // Progress update
  "confidence": 80,                     // Confidence level (0-100)
  "status": "in_progress",              // not_started|in_progress|at_risk|completed
  "notes": "Offer extended to 1st candidate"
}

Response: 200 OK
{ updated OKR with progressPercentage recalculated }
```

### Mark as Reviewed
```
POST /okrs/507f1f77bcf86cd799439013/mark-reviewed
Authorization: Bearer {token}
Roles: owner, admin, me_officer

Body:
{
  "reviewerUserId": "507f1f77bcf86cd799439016"
}

Response: 200 OK
{ OKR with reviewedBy and reviewDate updated }
```

### Delete OKR
```
DELETE /okrs/507f1f77bcf86cd799439013
Authorization: Bearer {token}
Roles: owner, admin

Note: Only draft OKRs can be deleted; active/completed are archived
```

---

## Workflows

### Quarterly OKR Cycle
```
Week 1-2: Planning
├─ Define 3-5 ambitious Objectives
├─ Create 3-5 Key Results per Objective
├─ Assign owner
└─ Status: draft

Week 3: Alignment
├─ Executive review
├─ Adjust if needed
├─ Get stakeholder buy-in
└─ Link to projects

Week 4: Launch
├─ Activate OKRs
├─ Communicate to team
├─ Status: active
└─ Begin tracking

Weeks 5-12: Execution & Tracking
├─ Weekly progress updates (confidence, current value)
├─ Mid-quarter check-in (adjust if needed)
├─ Address at-risk items
└─ Keep status current

Week 13: Review
├─ Final progress assessment
├─ Calculate achievement % for each KR
├─ Mark as reviewed
├─ Document learnings
└─ Status: completed
```

### Weekly Check-in Process
```
Monday Morning Ritual:
├─ Update current values for each KR
├─ Review status (on track / at risk / completed)
├─ Update confidence level (0-100)
├─ Add notes on blockers/wins
└─ System auto-calculates OKR progress %

Example:
KR: "Hire 3 female directors" (Target: 3)
├─ Previous: current = 0, confidence = 85%
├─ This week: 1 offer accepted
├─ Update: current = 1, confidence = 90%, status = in_progress
├─ Progress: 33% (1/3)
└─ Notes: "First director starts next month"
```

---

## Key Features

### Ambitious Goal Setting
```
Good OKR Example:
├─ Objective: "Become the leading NGO in water security"
├─ KR1: "Reach 500,000 beneficiaries with clean water" (current: 250k)
├─ KR2: "Establish presence in 5 new African countries" (current: 0)
└─ KR3: "Achieve $50M in annual funding" (current: $28M)

Note: OKRs should be ambitious (60-70% confidence)
```

### Confidence Scoring
```
Confidence = Likelihood of achieving target

100% → Certain to achieve
75%+ → Very likely
50%  → Moderate likelihood
25%  → Risky but possible
0%   → Not achievable

Higher confidence = more realistic KR
Lower confidence = stretch goal
```

### Status Tracking
```
not_started  → Haven't begun
in_progress  → Work underway
at_risk      → May not achieve
completed    → Achieved target

Typical progression:
not_started → in_progress → completed
          or → at_risk → adjusted
```

### Auto-Calculated Progress
```
Per Key Result: (currentValue / targetValue) * 100
Example: (1 / 3) * 100 = 33%

Per OKR: Average of all KR progress
Example: (33% + 50% + 75%) / 3 = 53%

Progress shown as percentage 0-100
```

---

## Example: NGO Quarterly OKRs

### Q1 2026: "Build Capacity for Scale"

**OKR 1: Strengthen Financial Foundation**
- KR1: Increase monthly donors from 500 to 2,000
- KR2: Secure 3 major grants ($1M+)
- KR3: Achieve 85% cost efficiency ratio

**OKR 2: Expand Program Reach**
- KR1: Scale to 10 new districts
- KR2: Train 50 new field officers
- KR3: Increase beneficiaries from 100k to 150k

**OKR 3: Build Leadership Bench**
- KR1: Hire 2 new managers
- KR2: Complete training for 3 identified successors
- KR3: Achieve 40% women in leadership (up from 30%)

**OKR 4: Enhance Impact Measurement**
- KR1: Implement new M&E system in 5 programs
- KR2: Complete impact study in 2 programs
- KR3: Reduce reporting time by 30%

---

## Access Control

| Action | Roles |
|--------|-------|
| Create | owner, admin, me_officer |
| View all | All authenticated |
| Update | owner, admin, me_officer |
| Update KR | owner, admin, me_officer, finance |
| Mark reviewed | owner, admin, me_officer |
| Delete | owner, admin |

---

## Integration Points

### With Balanced Scorecard
- Annual BSC defines strategy
- Quarterly OKRs execute strategy
- Roll up OKR results to BSC objectives

### With Projects
- Link projects to OKRs
- Track project progress toward KRs
- Report project completion as KR progress

### With Activities
- Link activities to projects
- Activities contribute to OKR achievement
- Activity logging updates confidence/progress

---

## Best Practices

1. **Keep it Simple** — 3-5 OKRs per quarter
2. **Be Ambitious** — 60-70% confidence is target
3. **Measure Objectively** — Use quantifiable targets
4. **Align Vertically** — Company → Department → Individual
5. **Communicate Weekly** — Regular progress updates
6. **Adapt Quickly** — Can adjust in-quarter if needed
7. **Celebrate Wins** — Recognize achievement
8. **Learn from Miss** — Understand why targets weren't met

---

## Example: Mid-Quarter Adjustment

```
Situation: Q2 OKR at risk
├─ Objective: "Scale to 500,000 beneficiaries"
├─ Target: 500,000
├─ Current: 250,000
├─ Confidence: 40% (was 80%)
└─ Status: at_risk

Root Cause: Funding delayed
├─ 2 major grants still in approval
├─ Hiring stalled
└─ Can only reach 400k

Decision: Adjust KR Target
├─ New Target: 400,000
├─ New Confidence: 85%
└─ Status: in_progress

Action: Communicate change
├─ Update executive team
├─ Adjust project plans
└─ Focus on achievable goals
```

---

## Quarterly Scorecard Example

```
Q4 2025 OKR Results:

OKR 1: "Build Donor Base"
├─ KR1: 1,500 monthly donors (Target: 2,000) → 75% ✅
├─ KR2: 2 major grants (Target: 3) → 67% ⚠️
└─ OKR Achievement: 71%

OKR 2: "Expand Reach"
├─ KR1: 8 new districts (Target: 10) → 80% ✅
├─ KR2: 200k beneficiaries (Target: 200k) → 100% ✅
└─ OKR Achievement: 90%

OKR 3: "Build Team"
├─ KR1: 40% women in leadership (Target: 40%) → 100% ✅
├─ KR2: 5 successors trained (Target: 3) → 167% 🎉
└─ OKR Achievement: 134%

Overall Achievement: 98%
Assessment: Excellent execution on people and reach

Learnings:
├─ Donor acquisition slower than expected (address in Q1)
├─ Succession planning exceeded expectations (invest more)
└─ Scale strategy working well (continue)
```

---

## Error Handling

### 400 Bad Request
- Quarter not 1-4
- Invalid key result unit
- Confidence not 0-100
- Target value must be positive

### 403 Forbidden
- Cannot delete active OKR
- Insufficient permissions

### 404 Not Found
- OKR not found
- Key result index out of bounds

### 409 Conflict
- Status doesn't allow operation
- Cannot update completed OKR
