# Evidara  MEL product audit

## Executive read

Evidara  is directionally strong: it already combines M&E, grants, budget tracking, partners, beneficiaries, forms, RBAC, dashboards, and billing. That is a better wedge than a generic form builder. The product still needs deeper workflow infrastructure to compete with premium M&E systems used by large NGOs, INGOs, donor-funded programs, and USAID-style implementing partners.

The biggest missing layer was reporting periods and controlled indicator results. I added a backend foundation for this:

- `POST /reporting/periods` to define monthly, quarterly, semiannual, annual, or custom reporting periods.
- `POST /reporting/periods/:id/calculate` to calculate draft indicator results from approved activities in the reporting window.
- `POST /reporting/results` to manually adjust or narrate indicator results.
- `PATCH /reporting/periods/:id/status` to submit, approve, or lock a period.
- `GET /reports/donor/:projectId?reportingPeriodId=...` to use approved/locked period results in donor reports.

This starts moving Evidara  from CRUD records toward a real donor reporting lifecycle.

## Premium M&E competitor patterns

### ActivityInfo

ActivityInfo positions itself as a flexible information management system for the social sector. Its premium differentiators are no-code relational database building, validation and relevance rules, mobile/offline data collection, beneficiary progress tracking, case management, maps, user permissions, imports, data quality, and locking changes after results have been reported to donors.

Source: https://www.activityinfo.org/about/monitoring-and-evaluation.html

### DevResults

DevResults is closest to USAID-style MEL. It emphasizes mapping, monitoring, collaboration, project management, donor sharing, sensitive-data hosting, and enterprise structures where multiple projects or awards can report into central donor or organization sites. Its setup materials show serious implementation inputs: projects, users, reporting periods, reporting responsibilities, and indicator data requirements.

Sources:
- https://www.devresults.com/
- https://help.devresults.com/help/setup-instructions
- https://help.devresults.com/help/what-is-enterprise

### LogAlto

LogAlto emphasizes project progress, logframes, indicator configuration, data upload/import, mobile data collection, visual reports, maps, multilingual support, cross-cutting issues, lessons learned, and success stories.

Source: https://www.logalto.com/en/monitoring-and-evaluation-tool/

### CommCare

CommCare is strongest at frontline/mobile workflows: form-driven data collection, case management, offline use, workflow logic, and high-quality field data capture. It is less “portfolio M&E dashboard first” and more “operational data collection at scale.”

Source: https://dimagi.com/commcare/use-cases/monitoring-evaluation/

## Evidara  comparison

| Capability | Evidara  today | Premium expectation | Gap |
|---|---|---|---|
| Projects | Exists | Project/award hierarchy, donors, geography, reporting obligations | Add awards/sub-awards and locations |
| Indicators/logframes | Exists | Period targets, disaggregation, standard indicator libraries, result locks | Add period targets and indicator library |
| Activities | Exists with approval | Evidence, partner submissions, bulk import, offline capture | Add partner portal/import/offline |
| Reporting periods | Added backend foundation | Period setup, submission, approval, lock, donor exports | Add UI and PDF/Excel exports |
| Donor reports | Exists | Uses locked period results, narrative, variance, attachments | Backend improved; UI/export needs work |
| Forms | Exists backend | No-code builder, validation, relevance, repeat groups, offline/mobile | Add UI builder, validation enforcement, mobile |
| Budget/grants | Exists | Award burn rate, obligations, pipeline, cost categories, compliance | Add grant-budget linkage and burn-rate alerts |
| Dashboards | Exists | Portfolio drill-downs, maps, trends, DQA alerts | Add map/geography and data quality dashboard |
| RBAC | Exists | Fine-grained roles per project/partner/site | Add project/partner-scoped permissions |
| Auditability | Partial timestamps/statuses | Full change history, approvals, locks, export logs | Add audit events collection |
| Imports/exports | Limited | Excel import/export, data validation, templates | Add import pipeline |
| Security/enterprise | Basic | SSO, MFA, SLA, data residency, backups | Enterprise roadmap |

## USAID-style end-to-end workflow target

1. Configure award/grant
2. Define projects, partners, locations, reporting cadence, and deliverables
3. Build logframe/theory of change and indicators
4. Define period targets and disaggregation requirements
5. Create mobile/web forms linked to indicators and activities
6. Field teams or partners submit evidence
7. M&E officers review data quality and approve submissions
8. System calculates period results from approved evidence
9. M&E officer adds narrative, explanations, assumptions, and learning
10. Program lead submits period
11. Authorized reviewer approves and locks it
12. Donor report pulls locked figures, budget variance, activities, and narrative
13. Leadership dashboard aggregates project, grant, partner, and geography performance

## Highest-value missing features

1. Reporting-period UI: expose the new backend in the Angular app.
2. Period targets: indicators should have targets per quarter/year, not only one lifetime target.
3. Data quality assessments: missing evidence, outliers, stale submissions, duplicate beneficiaries, required disaggregation checks.
4. Partner portal: allow sub-grantees/partners to submit activities and results under scoped access.
5. Geography model: country, county/district, facility/site, GPS, and maps.
6. Import/export: Excel templates for projects, indicators, targets, activities, and results.
7. Audit event log: record create/update/delete/submit/approve/lock/export actions.
8. Donor report builder: locked results, narrative, budget variance, attachments, PDF/Excel export.
9. Form builder UI: create/edit form sections/questions in the frontend and enforce validation server-side.
10. Offline/mobile collection: start with PWA draft queue, then native/offline sync if needed.

## Engineering concerns found

- The Angular build is currently blocked by existing `ProjectComponent` template/type issues unrelated to this audit.
- `ProjectsService.update()` writes `undefined` date fields, which can unintentionally clear dates.
- `ReportsService` previously counted submitted activities if no approved activities existed. For donor-grade reporting, submitted data should be visibly provisional, not silently mixed.
- Form template schemas are expressive, but server-side response validation does not yet enforce required fields, types, conditional logic, or numeric bounds.
- Budget and grant modules exist, but spending is not yet strongly connected to activities, grants, reporting periods, and donor reports.
- There is no centralized audit log, which premium institutional buyers will expect.

## Recommended build order

1. Fix the Angular build blockers.
2. Add frontend screens for reporting periods and indicator results.
3. Add period targets to indicators.
4. Add audit events.
5. Strengthen form response validation.
6. Add donor PDF/Excel export from locked reporting periods.
7. Add import/export templates.
8. Add partner-scoped access and partner reporting.
9. Add geography/maps.
10. Add SSO/MFA and enterprise security controls.






To give Monival an edge, you need to look at the primary pain points that NGOs and development agencies face with incumbent software (like DevResults, TolaData, or KoboToolbox). Existing tools generally fall into two extremes: they are either glorified data-collection apps (just forms) or overly complex enterprise behemoths that require dedicated IT staff to manage.

Based on current market gaps, here are the strategic areas you can target to make Monival stand out, along with how your existing architecture already supports them:

1. Shift from "Compliance Reporting" to "Adaptive Management"
The Gap: Most systems are built strictly to generate end-of-project reports for donors. They don't help project managers make real-time, mid-course corrections because the data is siloed or analyzed too late.
The Monival Edge: You already have the reporting.service.ts generating real-time snapshots and a Data Quality module that alerts on stale data or missing evidence.
Next Step: Build an "Insights/Learning" dashboard that doesn't just show charts, but actively suggests actions (e.g., "Activity X in District Y is underperforming against the budget burn rate. Consider re-allocating funds.").
2. Bridging the Gap Between Financials and Programmatics
The Gap: NGOs usually track M&E (activities/indicators) in one system and financials (grants/budgets) in another like QuickBooks. Reconciling the two to calculate "Cost per Impact" or "Burn Rate vs. Progress" is a massive headache.
The Monival Edge: This is your strongest technical advantage right now. Your activities.service.ts already links indicatorId directly to grantId and updates them synchronously.
Next Step: Market this heavily. Build UI views that explicitly show the ROI of Impact—"You have spent 40% of the USAID Grant, but only achieved 15% of the linked Indicator Target." Very few mid-market tools do this natively.
3. Solving the "Garbage In, Garbage Out" Data Problem
The Gap: Organizations struggle with terrible data quality from the field (missing evidence, negative values, duplicate beneficiaries).
The Monival Edge: Your BeneficiariesService already has a highly sophisticated deduplication engine (fuzzy matching on phone numbers and national IDs) and your Activities schema enforces strict evidence checks via qualityFlags.
Next Step: Introduce offline-first mobile capabilities (like a PWA) for field workers so they can collect validated data, photos, and GPS coordinates without internet access, syncing seamlessly when they reach connectivity.
4. Qualitative Data and Beneficiary Storytelling
The Gap: Current M&E software is heavily quantitative (numbers, targets, percentages) but fails to capture qualitative data (beneficiary stories, community feedback, photos, and narrative nuance). Donors are increasingly demanding qualitative proof of impact.
The Monival Edge: Your schema supports narratives, challenges, and lessonsLearned at both the Activity and Reporting Period levels.
Next Step: Build a "Stakeholder Feedback" or "Impact Stories" module that allows users to seamlessly tag rich text, audio, or video evidence to an indicator, giving qualitative data equal weight to quantitative targets.
5. AI-Assisted M&E
The Gap: Setting up LogFrames, defining indicators, and drafting periodic narrative reports takes hundreds of hours of administrative time.
The Monival Edge: Your strictly typed, relational backend is perfect for AI integration.
Next Step: Implement an AI copilot that can auto-generate the first draft of a quarterly donor report by summarizing the narratives and challenges from all activities within that reporting period.
Summary: If you position Monival not just as a "tracker", but as an integrated programmatic and financial intelligence platform that ensures data quality at the source, you will easily outcompete the fragmented, legacy tools currently dominating the space.


