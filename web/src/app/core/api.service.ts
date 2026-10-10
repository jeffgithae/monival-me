import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { EMPTY, Observable, expand, map, reduce } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  WorkplanItem,
  OrgDocument,
  DocumentVersion,
  CreateDocumentDto,
  CreateDocumentVersionDto,
  Activity,
  ActivityTemplate,
  FormTemplate,
  FormResponse,
  Partner,
  Beneficiary,
  BalancedScorecard,
  BSCPerformanceSummary,
  BudgetAllocation,
  BudgetLineItem,
  BudgetSummary,
  BudgetVariance,
  DashboardOverview,
  DonorReport,
  FrameworkConfig,
  Indicator,
  IndicatorResult,
  IndicatorTarget,
  OKR,
  OKRKeyResult,
  OKRProgress,
  Project,
  ReportingPeriod,
  StrategicOverview,
  ExchangeRates,
  OutgoingWebhook,
  AppNotification,
  AuditEvent,
  CreateDonorDto,
  CreateGrantDto,
  CreateReportingPeriodDto,
  DataQualityReport,
  Donor,
  DonorProfile,
  DonorPortfolioSummary,
  AddEngagementDto,
  AddComplianceConditionDto,
  Grant,
  GrantSummary,
  GrantFinancialRollup,
  GrantAwardTree,
  GrantReportDue,
  GrantDisbursement,
  GrantReportingObligation,
  GrantAmendment,
  PeriodTarget,
  ReportingPeriodStatus,
  CopilotResponse,
  CopilotChatMessage,
  DraftReportResponse,
  ToCResponse,
  IndicatorDefinitionResponse,
  SuggestActionsResponse,
  CreateBeneficiaryDto,
  BeneficiaryStatistics,
  ServiceRecordDto,
  ProjectSummary,
  PortfolioStats,
  ProjectRisk,
  ProjectMilestone,
  ProjectStakeholder,
  NavItem,
  InsightsReport,
  ROIReport,
  BeneficiaryReachReport,
  GeoDataReport,
  StakeholderFeedback,
  CreateFeedbackDto,
  FeedbackListQuery,
  FeedbackStatus,
  FeedbackAnalytics,
  PaginatedResult,
  IndicatorAchievementResponse,
} from './models';
import { OrgRole } from './roles';

/**
 * Query parameters without the blanks. HttpClient serialises an `undefined`
 * value as the literal text "undefined", so an optional filter that was not
 * set reached the API as `?reportingPeriodId=undefined` and was rejected as
 * an invalid id.
 */
function query(params?: object | null): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value as string | number | boolean;
  }
  return out;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  navMenu() {
    return this.http.get<NavItem[]>(`${this.base}/auth/menu`);
  }

  plans() {
    return this.http.get<
      Array<{
        id: string;
        name: string;
        description: string;
        monthlyPriceUsd: number;
        maxProjects: number | null;
        maxUsers: number | null;
        features: string[];
      }>
    >(`${this.base}/billing/plans`);
  }

  billingStatus() {
    return this.http.get<{
      planId: string;
      planName: string;
      subscriptionStatus: string;
      trialEndsAt?: string;
      currentPeriodEnd?: string;
      mockMode: boolean;
    }>(`${this.base}/billing/status`);
  }

  checkout(planId: string) {
    return this.http.post<{ url: string; mock?: boolean }>(`${this.base}/billing/checkout`, {
      planId,
    });
  }

  billingPortal() {
    return this.http.post<{ url: string }>(`${this.base}/billing/portal`, {});
  }

  dashboardOverview() {
    return this.http.get<DashboardOverview>(`${this.base}/dashboard/overview`);
  }

  members() {
    return this.http.get<
      Array<{ id: string; userId: string; email: string; name: string; role: OrgRole }>
    >(`${this.base}/members`);
  }

  /** Names and roles for assignee pickers; available to every role, unlike the full member list. */
  memberDirectory() {
    return this.http.get<Array<{ id: string; userId: string; name: string; role: OrgRole }>>(`${this.base}/members/directory`);
  }

  pendingInvites() {
    return this.http.get<Array<{ _id: string; email: string; role: OrgRole; expiresAt: string }>>(`${this.base}/members/invites`);
  }

  inviteMember(email: string, role: OrgRole) {
    return this.http.post<{ acceptUrl: string; token: string }>(`${this.base}/members/invite`, {
      email,
      role,
    });
  }

  updateMemberRole(memberId: string, role: OrgRole) {
    return this.http.patch(`${this.base}/members/${memberId}/role`, { role });
  }

  removeMember(memberId: string) {
    return this.http.delete(`${this.base}/members/${memberId}`);
  }

  /**
   * Public — no auth required. Used by the accept-invite page to pre-fill
   * the invited org's name, sector, country, role, and the invitee's email
   * (all read-only — the form never lets the user edit org details).
   */
  lookupInvite(token: string) {
    return this.http.get<{
      email: string;
      role: string;
      organizationName: string;
      country?: string;
      sector?: string;
      token: string;
    }>(`${this.base}/members/invite-lookup`, { params: { token } });
  }

  /**
   * Accept an invite for the currently authenticated user (used when the
   * invited email already has an account — they log in, then this call
   * attaches their existing account to the inviting org).
   */
  acceptInvite(token: string) {
    return this.http.post<{ organizationId: string; role: string }>(
      `${this.base}/members/accept-invite`, { token },
    );
  }

  updateReportingPeriodStatus(periodId: string, status: 'submitted' | 'approved' | 'locked') {
    return this.http.patch<ReportingPeriod>(`${this.base}/reporting/periods/${periodId}/status`, {
      status,
    });
  }

  indicatorResults(reportingPeriodId?: string) {
    let params = new HttpParams();
    if (reportingPeriodId) params = params.set('reportingPeriodId', reportingPeriodId);
    return this.http.get<IndicatorResult[]>(`${this.base}/reporting/results`, { params });
  }

  upsertIndicatorResult(payload: {
    reportingPeriodId: string;
    indicatorId: string;
    achieved: number;
    narrative?: string;
    disaggregations?: Record<string, unknown>;
  }) {
    return this.http.post<IndicatorResult>(`${this.base}/reporting/results`, payload);
  }

  indicatorTargets(reportingPeriodId: string) {
    return this.http.get<IndicatorTarget[]>(`${this.base}/reporting/targets`, {
      params: new HttpParams().set('reportingPeriodId', reportingPeriodId),
    });
  }

  upsertIndicatorTarget(payload: {
    reportingPeriodId: string;
    indicatorId: string;
    baseline?: number;
    target: number;
    notes?: string;
  }) {
    return this.http.post<IndicatorTarget>(`${this.base}/reporting/targets`, payload);
  }

  // donors() {
  //   return this.http.get<Array<{ _id: string; name: string; contactEmail?: string }>>(
  //     `${this.base}/donors`,
  //   );
  // }
  

  // Partners
  partners() {
    return this.http.get<Partner[]>(`${this.base}/partners`);
  }

  createPartner(body: Partial<Partner>) {
    return this.http.post<Partner>(`${this.base}/partners`, body);
  }

  // createDonor(body: { name: string; contactEmail?: string; country?: string }) {
  //   return this.http.post(`${this.base}/donors`, body);
  // }

  /**
   * Every row of a paginated list endpoint, as one flat array. Follows the
   * API's pagination to the end so pickers and roll-ups never silently stop
   * at the first page. Passing an explicit `page` fetches just that page.
   */
  private allPages<T>(url: string, params: Record<string, string | number | boolean> = {}, pageSize = 100): Observable<T[]> {
    const single = params['page'] !== undefined;
    const fetch = (page: number) =>
      this.http.get<PaginatedResult<T> | T[]>(url, { params: query({ limit: pageSize, ...params, ...(single ? {} : { page }) }) });
    return fetch(1).pipe(
      expand((r: any, i) => (!single && !Array.isArray(r) && r.pages > i + 1 ? fetch(i + 2) : EMPTY)),
      map((r: any) => (Array.isArray(r) ? r : (r.data ?? [])) as T[]),
      reduce((all, chunk) => all.concat(chunk), [] as T[]),
    );
  }

  projects(params?: Record<string, string | number | boolean>) {
    return this.allPages<Project>(`${this.base}/projects`, params);
  }

  /** One page of the project list, without the embedded workplan and risk registers. */
  projectsPage(params: { page: number; limit: number; status?: string; sector?: string; search?: string; sort?: string }) {
    const clean = Object.fromEntries(Object.entries({ ...params, view: 'summary' }).filter(([, v]) => v !== '' && v !== undefined));
    return this.http.get<PaginatedResult<Project> & { statusCounts: Record<string, number> }>(`${this.base}/projects`, { params: query(clean) });
  }

  project(id: string) {
    return this.http.get<Project>(`${this.base}/projects/${id}`);
  }

  createProject(body: Partial<Project>) {
    return this.http.post<Project>(`${this.base}/projects`, body);
  }

  updateProject(id: string, body: Partial<Project>) {
    return this.http.patch<Project>(`${this.base}/projects/${id}`, body);
  }

  deleteProject(id: string) {
    return this.http.delete(`${this.base}/projects/${id}`);
  }

  projectSummary(id: string) {
    return this.http.get<ProjectSummary>(`${this.base}/projects/${id}/summary`);
  }

  portfolioStats() {
    return this.http.get<PortfolioStats>(`${this.base}/projects/portfolio-stats`);
  }

  archiveProject(id: string, archiveNotes: string) {
    return this.http.patch<Project>(`${this.base}/projects/${id}/archive`, { archiveNotes });
  }

  closeProject(id: string, dto: { closureDate: string; lessonsLearned?: string; evaluationSummary?: string }) {
    return this.http.patch<Project>(`${this.base}/projects/${id}/close`, dto);
  }

  duplicateProject(id: string, newName: string) {
    return this.http.post<Project>(`${this.base}/projects/${id}/duplicate`, { newName });
  }

  refreshDataQuality(id: string) {
    return this.http.post<Project>(`${this.base}/projects/${id}/refresh-data-quality`, {});
  }

  // ── Project Milestones ──────────────────────────────────────────────────────
  addMilestone(id: string, dto: Partial<ProjectMilestone>) {
    return this.http.post<Project>(`${this.base}/projects/${id}/milestones`, dto);
  }

  updateMilestone(id: string, milestoneId: string, dto: Partial<ProjectMilestone>) {
    return this.http.patch<Project>(`${this.base}/projects/${id}/milestones/${milestoneId}`, dto);
  }

  deleteMilestone(id: string, milestoneId: string) {
    return this.http.delete<Project>(`${this.base}/projects/${id}/milestones/${milestoneId}`);
  }

  // ── Project Risks ───────────────────────────────────────────────────────────
  addRisk(id: string, dto: Partial<ProjectRisk>) {
    return this.http.post<Project>(`${this.base}/projects/${id}/risks`, dto);
  }

  updateRisk(id: string, riskId: string, dto: Partial<ProjectRisk>) {
    return this.http.patch<Project>(`${this.base}/projects/${id}/risks/${riskId}`, dto);
  }

  deleteRisk(id: string, riskId: string) {
    return this.http.delete<Project>(`${this.base}/projects/${id}/risks/${riskId}`);
  }

  // ── Project Stakeholders ────────────────────────────────────────────────────
  addStakeholder(id: string, dto: Partial<ProjectStakeholder>) {
    return this.http.post<Project>(`${this.base}/projects/${id}/stakeholders`, dto);
  }

  updateStakeholder(id: string, stakeholderId: string, dto: Partial<ProjectStakeholder>) {
    return this.http.patch<Project>(`${this.base}/projects/${id}/stakeholders/${stakeholderId}`, dto);
  }

  deleteStakeholder(id: string, stakeholderId: string) {
    return this.http.delete<Project>(`${this.base}/projects/${id}/stakeholders/${stakeholderId}`);
  }

  // ── Project Workplan (sub-resource) ────────────────────────────────────────
  // Note: addWorkplanItem / updateWorkplanItem / removeWorkplanItem already exist below

  // ── Impact Stories ──────────────────────────────────────────────────────────

  impactStories(params?: Record<string, string>) {
    return this.http.get<any>(`${this.base}/impact-stories`, { params: query(params) });
  }

  impactStoryStats() {
    return this.http.get<any>(`${this.base}/impact-stories/stats`);
  }

  createImpactStory(body: any) {
    return this.http.post<any>(`${this.base}/impact-stories`, body);
  }

  updateImpactStory(id: string, body: any) {
    return this.http.patch<any>(`${this.base}/impact-stories/${id}`, body);
  }

  updateImpactStoryStatus(id: string, status: string) {
    return this.http.patch<any>(`${this.base}/impact-stories/${id}/status`, { status });
  }

  deleteImpactStory(id: string) {
    return this.http.delete(`${this.base}/impact-stories/${id}`);
  }

  indicatorPerformance(id: string) {
    return this.http.get<any>(`${this.base}/indicators/${id}/performance`);
  }

  indicators(projectId?: string) {
    return this.allPages<Indicator>(`${this.base}/indicators`, projectId ? { projectId } : {}, 500);
  }

  /**
   * Server-computed achievement per indicator for a project.
   *
   * Always use this instead of summing `activity.quantity` on the client: the
   * activities endpoint is paginated and returns every status, so a client-side
   * sum under-reports past the first page and counts drafts and rejected entries.
   */
  indicatorAchievement(projectId: string) {
    return this.http.get<IndicatorAchievementResponse>(
      `${this.base}/indicators/project/${projectId}/achievement`,
    );
  }

  createIndicator(body: Record<string, unknown>) {
    return this.http.post<Indicator>(`${this.base}/indicators`, body);
  }

  updateIndicator(id: string, body: Record<string, unknown>) {
    return this.http.patch<Indicator>(`${this.base}/indicators/${id}`, body);
  }

  deleteIndicator(id: string) {
    return this.http.delete(`${this.base}/indicators/${id}`);
  }

  /**
   * Activities, newest first. For a project this follows the pagination to
   * the end: the project page counts, filters and approves across all of
   * them, and stopping at the first page hid everything older.
   */
  activities(projectId?: string) {
    // Without a project this is only ever a picker: the most recent hundred, not the whole history.
    return this.allPages<Activity>(`${this.base}/activities`, projectId ? { projectId } : { page: 1 }, projectId ? 200 : 100);
  }

  createActivity(body: Record<string, unknown>) {
    return this.http.post<Activity>(`${this.base}/activities`, body);
  }

  updateActivity(id: string, body: Partial<Activity>) {
    return this.http.patch<Activity>(`${this.base}/activities/${id}`, body);
  }

  activityStatistics(projectId?: string) {
    const params: Record<string, string> = {};
    if (projectId) params['projectId'] = projectId;
    return this.http.get<{ total: number; approved: number; pending: number; rejected: number; byType: Record<string, number> }>(
      `${this.base}/activities/statistics`, { params }
    );
  }

  bulkCreateActivities(dto: Record<string, unknown>) {
    return this.http.post<Activity[]>(`${this.base}/activities/bulk`, dto);
  }

  bulkReviewActivities(dto: { ids: string[]; status: 'approved' | 'rejected'; rejectionReason?: string }) {
    return this.http.patch<{ modifiedCount: number }>(`${this.base}/activities/bulk-review`, dto);
  }

  offlineSyncActivities(batch: Record<string, unknown>[]) {
    return this.http.post<{ results: Array<{ clientId: string; status: string; message?: string }> }>(
      `${this.base}/activities/offline-sync`,
      { activities: batch },
    );
  }

  offlineSyncBeneficiaries(batch: Record<string, unknown>[]) {
    return this.http.post<{ results: Array<{ clientId: string; status: string; message?: string }> }>(
      `${this.base}/beneficiaries/offline-sync`,
      { beneficiaries: batch },
    );
  }

  offlineSyncFormResponses(batch: Record<string, unknown>[]) {
    return this.http.post<{ results: Array<{ clientId: string; status: string; message?: string }> }>(
      `${this.base}/forms/responses/offline-sync`,
      { responses: batch },
    );
  }

  // Beneficiaries
  beneficiaries(params?: Record<string, string | number | boolean>) {
    return this.http.get<{ data: Beneficiary[]; total: number; page: number; limit: number; pages: number }>(`${this.base}/beneficiaries`, { params: query(params) });
  }

  beneficiary(id: string) {
    return this.http.get<Beneficiary>(`${this.base}/beneficiaries/${id}`);
  }

  createBeneficiary(body: CreateBeneficiaryDto) {
    return this.http.post<Beneficiary>(`${this.base}/beneficiaries`, body);
  }

  updateBeneficiary(id: string, body: Partial<CreateBeneficiaryDto>) {
    return this.http.patch<Beneficiary>(`${this.base}/beneficiaries/${id}`, body);
  }

  deleteBeneficiary(id: string) {
    return this.http.delete(`${this.base}/beneficiaries/${id}`);
  }

  beneficiaryStats(projectId?: string) {
    let params = new HttpParams();
    if (projectId) params = params.set('projectId', projectId);
    return this.http.get<BeneficiaryStatistics>(`${this.base}/beneficiaries/statistics`, { params });
  }

  enrollBeneficiary(id: string, body: { projectId: string; enrolledAt?: string; notes?: string }) {
    return this.http.post<Beneficiary>(`${this.base}/beneficiaries/${id}/enroll`, body);
  }

  exitBeneficiaryProgram(id: string, projectId: string, exitReason?: string) {
    return this.http.patch<Beneficiary>(`${this.base}/beneficiaries/${id}/exit/${projectId}`, { exitReason });
  }

  addBeneficiaryServiceRecord(id: string, body: ServiceRecordDto) {
    return this.http.post<Beneficiary>(`${this.base}/beneficiaries/${id}/service-records`, body);
  }

  beneficiaryDuplicates(minConfidence?: number, projectId?: string) {
    let params = new HttpParams();
    if (minConfidence !== undefined) params = params.set('minConfidence', minConfidence.toString());
    if (projectId) params = params.set('projectId', projectId);
    return this.http.get<Array<{ type: string; confidence: number; records: Array<{ _id: string; name: string; caseId?: string; nationalId?: string; phoneNumber?: string; status: string }> }>>(`${this.base}/beneficiaries/duplicates/scan`, { params });
  }

  mergeBeneficiaries(primaryId: string, duplicateId: string) {
    return this.http.post<{ merged: boolean; primaryId: string }>(`${this.base}/beneficiaries/duplicates/merge`, { primaryId, duplicateId });
  }

  beneficiaryActivities(beneficiaryId: string) {
    return this.http.get<{ data: Activity[] }>(`${this.base}/activities`, { params: query({ beneficiaryId, limit: '50' }) });
  }

  activityTemplates(projectId?: string) {
    let params = new HttpParams();
    if (projectId) {
      params = params.set('projectId', projectId);
    }
    return this.http.get<ActivityTemplate[]>(`${this.base}/activities/templates`, { params });
  }

  createActivityTemplate(body: Record<string, unknown>) {
    return this.http.post<ActivityTemplate>(`${this.base}/activities/templates`, body);
  }

  // Forms / Survey templates
  formTemplates(projectId?: string) {
    let params = new HttpParams();
    if (projectId) params = params.set('projectId', projectId);
    return this.http.get<FormTemplate[]>(`${this.base}/forms/templates`, { params });
  }

  formTemplate(id: string) {
    return this.http.get<FormTemplate>(`${this.base}/forms/templates/${id}`);
  }

  // Form responses
  formResponses(projectId?: string) {
    let params = new HttpParams();
    if (projectId) params = params.set('projectId', projectId);
    return this.http.get<FormResponse[]>(`${this.base}/forms/responses`, { params });
  }

  formResponse(id: string) {
    return this.http.get<FormResponse>(`${this.base}/forms/responses/${id}`);
  }

  deleteActivityTemplate(id: string) {
    return this.http.delete(`${this.base}/activities/templates/${id}`);
  }

  deleteActivity(id: string) {
    return this.http.delete(`${this.base}/activities/${id}`);
  }

  reviewActivity(id: string, status: 'approved' | 'rejected', rejectionReason?: string) {
    return this.http.patch(`${this.base}/activities/${id}/review`, { status, ...(rejectionReason ? { rejectionReason } : {}) });
  }

  // donorReport(projectId: string, fromDate?: string, toDate?: string, reportingPeriodId?: string) {
  //   let params = new HttpParams();
  //   if (fromDate) params = params.set('fromDate', fromDate);
  //   if (toDate) params = params.set('toDate', toDate);
  //   if (reportingPeriodId) params = params.set('reportingPeriodId', reportingPeriodId);
  //   return this.http.get<DonorReport>(`${this.base}/reports/donor/${projectId}`, { params });
  // }

  // Budget Tracking API
  /** One page of budget allocations, with the total so the list can page through the rest. */
  budgetAllocationsPage(query?: { status?: string; fiscalYear?: number; projectId?: string; grantId?: string; category?: string; page?: number; limit?: number }) {
    let params = new HttpParams();
    if (query?.status)     params = params.set('status', query.status);
    if (query?.fiscalYear) params = params.set('fiscalYear', String(query.fiscalYear));
    if (query?.projectId)  params = params.set('projectId', query.projectId);
    if (query?.grantId)    params = params.set('grantId', query.grantId);
    if (query?.category)   params = params.set('category', query.category);
    if (query?.page)       params = params.set('page', String(query.page));
    if (query?.limit)      params = params.set('limit', String(query.limit));
    return this.http.get<{ data: BudgetAllocation[]; total: number; page: number; limit: number }>(
      `${this.base}/budget/allocations`,
      { params },
    );
  }

  budgetAllocations(query?: { status?: string; fiscalYear?: number; projectId?: string; grantId?: string; category?: string }) {
    // Used by pickers and per-project panels, which want the whole set the API allows in one go.
    return this.budgetAllocationsPage({ ...query, limit: 100 }).pipe(map((response) => response.data));
  }

  budgetAllocation(id: string) {
    return this.http.get<BudgetAllocation>(`${this.base}/budget/allocations/${id}`);
  }

  createBudgetAllocation(body: {
    name: string;
    description?: string;
    allocatedAmount: number;
    currency?: string;
    category: string;
    fiscalYear: number;
    startDate: string;
    endDate: string;
    projectId?: string;
    grantId?: string;
    donorId?: string;
    isRestricted?: boolean;
    allowedExpenseTypes?: string[];
    exchangeRateToUSD?: number;
  }) {
    return this.http.post<BudgetAllocation>(`${this.base}/budget/allocations`, body);
  }

  updateBudgetAllocation(id: string, body: {
    name?: string;
    description?: string;
    allocatedAmount?: number;
    currency?: string;
    category?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    isRestricted?: boolean;
  }) {
    return this.http.patch<BudgetAllocation>(`${this.base}/budget/allocations/${id}`, body);
  }

  approveBudget(id: string, notes?: string) {
    return this.http.post<BudgetAllocation>(`${this.base}/budget/allocations/${id}/approve`, { notes });
  }

  reviseBudget(id: string, body: { newAllocatedAmount: number; reason: string; notes?: string }) {
    return this.http.post<BudgetAllocation>(`${this.base}/budget/allocations/${id}/revise`, body);
  }

  closeBudget(id: string) {
    return this.http.post<BudgetAllocation>(`${this.base}/budget/allocations/${id}/close`, {});
  }

  deleteBudgetAllocation(id: string) {
    return this.http.delete(`${this.base}/budget/allocations/${id}`);
  }

  /** Line items for one allocation: GET /budget/allocations/:allocationId/line-items */
  budgetLineItems(allocationId: string) {
    return this.http.get<BudgetLineItem[]>(`${this.base}/budget/allocations/${allocationId}/line-items`);
  }

  createBudgetLineItem(body: {
    budgetAllocationId: string;
    description: string;
    costCategory: string;
    unitDescription: string;
    quantity: number;
    unitCost: number;
    notes?: string;
    linkedActivityId?: string;
    linkedIndicatorId?: string;
    reportingPeriodId?: string;
    invoiceReference?: string;
    paymentDate?: string;
    donorCostCategory?: string;
  }) {
    return this.http.post<BudgetLineItem>(`${this.base}/budget/line-items`, body);
  }

  updateBudgetLineItem(id: string, body: {
    spent?: number;
    committed?: number;
    status?: string;
    notes?: string;
    invoiceReference?: string;
    paymentDate?: string;
  }) {
    return this.http.patch<BudgetLineItem>(`${this.base}/budget/line-items/${id}`, body);
  }

  deleteBudgetLineItem(id: string) {
    return this.http.delete(`${this.base}/budget/line-items/${id}`);
  }

  /** Variance — fetched by allocation ID path param: GET /budget/variance/:allocationId */
  budgetVariance(allocationId: string, query?: { fromPeriod?: string; toPeriod?: string }) {
    let params = new HttpParams();
    if (query?.fromPeriod) params = params.set('fromPeriod', query.fromPeriod);
    if (query?.toPeriod)   params = params.set('toPeriod', query.toPeriod);
    return this.http.get<BudgetVariance[]>(`${this.base}/budget/variance/${allocationId}`, { params });
  }

  calculateVariance(allocationId: string, period: string, notes?: string) {
    return this.http.post<BudgetVariance>(`${this.base}/budget/variance/${allocationId}`, { period, notes });
  }

  /** Summary — GET /budget/summary (organisation comes from the JWT) */
  budgetSummary(query?: { fiscalYear?: number; grantId?: string }) {
    let params = new HttpParams();
    if (query?.fiscalYear) params = params.set('fiscalYear', String(query.fiscalYear));
    if (query?.grantId)    params = params.set('grantId', query.grantId);
    return this.http.get<BudgetSummary>(`${this.base}/budget/summary`, { params });
  }

  budgetAuditLog(entityId: string) {
    return this.http.get<unknown[]>(`${this.base}/budget/audit/${entityId}`);
  }

  // Balanced Scorecard API
  balancedScorecards() {
    return this.http.get<BalancedScorecard[]>(`${this.base}/bsc`);
  }

  balancedScorecard(id: string) {
    return this.http.get<BalancedScorecard>(`${this.base}/bsc/${id}`);
  }

  createBalancedScorecard(body: Partial<BalancedScorecard>) {
    return this.http.post<BalancedScorecard>(`${this.base}/bsc`, body);
  }

  updateBalancedScorecard(id: string, body: Partial<BalancedScorecard>) {
    return this.http.patch<BalancedScorecard>(`${this.base}/bsc/${id}`, body);
  }

  updateBSCObjective(
    id: string,
    perspectiveIndex: number,
    objectiveIndex: number,
    body: Record<string, unknown>,
  ) {
    return this.http.patch<BalancedScorecard>(
      `${this.base}/bsc/${id}/objective/${perspectiveIndex}/${objectiveIndex}`,
      body,
    );
  }

  // ── Two-factor authentication ──────────────────────────────────────────────
  mfaStatus() {
    return this.http.get<{ mfaEnabled: boolean; backupCodesRemaining: number }>(`${this.base}/mfa/status`);
  }

  mfaEnrollStart() {
    return this.http.post<{ qrCodeDataUrl: string; secret: string }>(`${this.base}/mfa/enroll`, {});
  }

  mfaEnrollVerify(code: string) {
    return this.http.post<{ backupCodes: string[] }>(`${this.base}/mfa/enroll/verify`, { code });
  }

  mfaDisable(code: string) {
    return this.http.post<{ disabled: boolean }>(`${this.base}/mfa/disable`, { code });
  }

  getBSCPerformance(id: string) {
    // The API reports one entry per perspective present on the scorecard; the
    // page shows all four, so absent perspectives read as 0 rather than crash.
    return this.http
      .get<{ overallScore: number; perspectives: Array<{ name: string; score: number }> }>(`${this.base}/bsc/${id}/performance`)
      .pipe(
        map((r): BSCPerformanceSummary => {
          const score = (name: string) => r.perspectives?.find((p) => p.name === name)?.score ?? 0;
          return {
            overall: r.overallScore ?? 0,
            byPerspective: {
              financial: score('financial'),
              customer: score('customer'),
              internal: score('internal'),
              learning: score('learning'),
            },
          };
        }),
      );
  }

  markBSCAsReviewed(id: string) {
    return this.http.post<BalancedScorecard>(`${this.base}/bsc/${id}/mark-reviewed`, {});
  }

  deleteBalancedScorecard(id: string) {
    return this.http.delete(`${this.base}/bsc/${id}`);
  }

  // OKR API
  okrs(params?: { projectId?: string }) {
    return this.http.get<OKR[]>(`${this.base}/okrs`, { params: query(params) });
  }

  okr(id: string) {
    return this.http.get<OKR>(`${this.base}/okrs/${id}`);
  }

  createOKR(body: Partial<Omit<OKR, 'linkedProjects'>> & { linkedProjects?: string[] }) {
    return this.http.post<OKR>(`${this.base}/okrs`, body);
  }

  updateOKR(id: string, body: Partial<Omit<OKR, 'linkedProjects'>> & { linkedProjects?: string[] }) {
    return this.http.patch<OKR>(`${this.base}/okrs/${id}`, body);
  }

  updateOKRKeyResult(id: string, krIndex: number, body: Partial<OKRKeyResult>) {
    return this.http.patch<OKR>(`${this.base}/okrs/${id}/key-result/${krIndex}`, body);
  }

  getOKRProgress(id: string) {
    return this.http.get<OKRProgress>(`${this.base}/okrs/${id}/progress`);
  }

  getQuarterlyOKRs(year: number, quarter: number) {
    return this.http.get<OKR[]>(`${this.base}/okrs/quarterly/${year}/${quarter}`);
  }

  markOKRAsReviewed(id: string) {
    return this.http.post<OKR>(`${this.base}/okrs/${id}/mark-reviewed`, {});
  }

  deleteOKR(id: string) {
    return this.http.delete(`${this.base}/okrs/${id}`);
  }

  // Framework Configuration API
  getFrameworkConfig() {
    return this.http.get<FrameworkConfig>(`${this.base}/organizations/frameworks`);
  }

  updateFrameworkConfig(frameworks: string[], primary: string) {
    return this.http.patch<FrameworkConfig>(`${this.base}/organizations/frameworks`, {
      frameworks,
      primary,
    });
  }

  // ── Exchange rates ─────────────────────────────────────────────────────────
  exchangeRates(base?: string) {
    return this.http.get<ExchangeRates>(`${this.base}/fx/rates`, { params: query({ base }) });
  }

  /** Replaces this organisation's own rates for the base currency; an empty map removes them. */
  setExchangeRateOverrides(baseCurrency: string, rates: Record<string, number>) {
    return this.http.post<ExchangeRates>(`${this.base}/fx/manual`, { baseCurrency, rates });
  }

  refreshExchangeRates(base: string) {
    return this.http.post<{ refreshed: boolean }>(`${this.base}/fx/refresh`, {}, { params: query({ base }) });
  }

  // ── Outgoing webhooks ──────────────────────────────────────────────────────
  webhookEvents() {
    return this.http.get<{ events: string[] }>(`${this.base}/webhooks/events`);
  }

  webhooks() {
    return this.http.get<OutgoingWebhook[]>(`${this.base}/webhooks`);
  }

  /** The response carries the signing secret, which is never shown again. */
  createWebhook(body: { name: string; url: string; events: string[]; projectId?: string }) {
    return this.http.post<OutgoingWebhook & { secret: string }>(`${this.base}/webhooks`, body);
  }

  updateWebhook(id: string, body: { name?: string; events?: string[]; isActive?: boolean }) {
    return this.http.patch<OutgoingWebhook>(`${this.base}/webhooks/${id}`, body);
  }

  rotateWebhookSecret(id: string) {
    return this.http.post<{ secret: string }>(`${this.base}/webhooks/${id}/rotate-secret`, {});
  }

  deleteWebhook(id: string) {
    return this.http.delete<{ deleted: boolean }>(`${this.base}/webhooks/${id}`);
  }

  // Strategic Overview API
  getStrategicOverview() {
    return this.http.get<StrategicOverview>(`${this.base}/organizations/strategic-overview`);
  }

  updateStrategicOverview(body: Pick<StrategicOverview, 'vision' | 'mission' | 'strategicPillars'>) {
    return this.http.patch<StrategicOverview>(`${this.base}/organizations/strategic-overview`, body);
  }
/**
 * ADD THESE METHODS TO web/src/app/core/api.service.ts
 * They extend the existing ApiService class — do NOT replace the file.
 * Paste inside the class body.
 */

// ─── Grants ───────────────────────────────────────────────────────────────────

  grants(params?: {
    status?: string; donorId?: string; search?: string;
    parentGrantId?: string; primeOnly?: boolean; projectId?: string;
    page?: number; limit?: number;
  }) {
    return this.http
      .get<Grant[] | { data: Grant[]; total: number }>(`${this.base}/grants`, { params: query(params) })
      .pipe(
        map((response) =>
          Array.isArray(response) ? { data: response, total: response.length } : response,
        ),
      );
  }
  grant(id: string) {
    return this.http.get<Grant>(`${this.base}/grants/${id}`);
  }
  createGrant(body: CreateGrantDto) {
    return this.http.post<Grant>(`${this.base}/grants`, body);
  }
  updateGrant(id: string, body: Partial<CreateGrantDto>) {
    return this.http.patch<Grant>(`${this.base}/grants/${id}`, body);
  }
  deleteGrant(id: string) {
    return this.http.delete(`${this.base}/grants/${id}`);
  }
  grantSummary() {
    return this.http.get<GrantSummary>(`${this.base}/grants/summary`);
  }
  expiringGrants(days = 30) {
    return this.http.get<Grant[]>(`${this.base}/grants/expiring?days=${days}`);
  }
  grantsByProject(projectId: string) {
    return this.http.get<Grant[]>(`${this.base}/grants/by-project/${projectId}`);
  }
  /** The API field is `amountSpent`; sending `spentAmount` was silently ignored. */
  updateGrantSpend(id: string, amountSpent: number) {
    return this.http.patch<Grant>(`${this.base}/grants/${id}/spending`, { amountSpent });
  }

  // ─── Grant detail: disbursements, obligations, amendments ──────────────────

  grantFinancials(id: string) {
    return this.http.get<GrantFinancialRollup>(`${this.base}/grants/${id}/financials`);
  }
  grantAwardTree(id: string) {
    return this.http.get<GrantAwardTree>(`${this.base}/grants/${id}/award-tree`);
  }
  grantReportsDue(days = 90) {
    return this.http.get<GrantReportDue[]>(`${this.base}/grants/reports-due?days=${days}`);
  }

  addGrantDisbursement(id: string, body: Partial<GrantDisbursement>) {
    return this.http.post<Grant>(`${this.base}/grants/${id}/disbursements`, body);
  }
  updateGrantDisbursement(id: string, disbursementId: string, body: Partial<GrantDisbursement>) {
    return this.http.patch<Grant>(`${this.base}/grants/${id}/disbursements/${disbursementId}`, body);
  }
  removeGrantDisbursement(id: string, disbursementId: string) {
    return this.http.delete<Grant>(`${this.base}/grants/${id}/disbursements/${disbursementId}`);
  }

  addGrantObligation(id: string, body: Partial<GrantReportingObligation>) {
    return this.http.post<Grant>(`${this.base}/grants/${id}/obligations`, body);
  }
  updateGrantObligation(id: string, obligationId: string, body: Partial<GrantReportingObligation>) {
    return this.http.patch<Grant>(`${this.base}/grants/${id}/obligations/${obligationId}`, body);
  }
  removeGrantObligation(id: string, obligationId: string) {
    return this.http.delete<Grant>(`${this.base}/grants/${id}/obligations/${obligationId}`);
  }

  recordGrantAmendment(id: string, body: Partial<GrantAmendment>) {
    return this.http.post<Grant>(`${this.base}/grants/${id}/amendments`, body);
  }

// ─── Donors ───────────────────────────────────────────────────────────────────

  donors(params?: { status?: string; type?: string; search?: string; tag?: string; page?: number; limit?: number }) {
    return this.http.get<import('./models').PaginatedResult<Donor>>(`${this.base}/donors`, { params: query(params) });
  }
  donor(id: string) {
    return this.http.get<Donor>(`${this.base}/donors/${id}`);
  }
  donorProfile(id: string) {
    return this.http.get<DonorProfile>(`${this.base}/donors/${id}/profile`);
  }
  donorPortfolioSummary() {
    return this.http.get<DonorPortfolioSummary>(`${this.base}/donors/portfolio-summary`);
  }
  donorGrants(donorId: string) {
    return this.http.get<Grant[]>(`${this.base}/donors/${donorId}/grants`);
  }
  donorDeadlines(donorId: string) {
    return this.http.get<{
      reportsDue: Array<{ grantId: string; grantTitle: string; nextReportDue: string; daysUntilDue: number | null }>;
      grantsExpiringSoon: Array<{ grantId: string; grantTitle: string; endDate: string; daysRemaining: number | null }>;
      overdueComplianceConditions: AddComplianceConditionDto[];
    }>(`${this.base}/donors/${donorId}/deadlines`);
  }
  donorPerformance(donorId: string) {
    return this.http.get<{
      grants: Grant[];
      projects: Array<{ _id: string; name: string; status?: string; startDate?: string; endDate?: string }>;
      indicators: Array<{ _id: string; code: string; title: string; status: string; percentComplete: number; trend: string; projectId: string }>;
      summary: { totalIndicators: number; onTrack: number; atRisk: number; behind: number; averageProgress: number };
    }>(`${this.base}/donors/${donorId}/performance`);
  }
  donorAuditLog(donorId: string) {
    return this.http.get<AuditEvent[]>(`${this.base}/donors/${donorId}/audit`);
  }
  createDonor(body: CreateDonorDto) {
    return this.http.post<Donor>(`${this.base}/donors`, body);
  }
  updateDonor(id: string, body: Partial<CreateDonorDto>) {
    return this.http.patch<Donor>(`${this.base}/donors/${id}`, body);
  }
  deleteDonor(id: string) {
    return this.http.delete(`${this.base}/donors/${id}`);
  }
  exportDonors() {
    return this.http.get(`${this.base}/donors/export`, { responseType: 'blob' });
  }
  addDonorEngagement(donorId: string, body: AddEngagementDto) {
    return this.http.post<Donor>(`${this.base}/donors/${donorId}/engagements`, body);
  }
  removeDonorEngagement(donorId: string, engagementId: string) {
    return this.http.delete(`${this.base}/donors/${donorId}/engagements/${engagementId}`);
  }
  addDonorCompliance(donorId: string, body: AddComplianceConditionDto) {
    return this.http.post<Donor>(`${this.base}/donors/${donorId}/compliance`, body);
  }
  updateDonorCompliance(donorId: string, conditionId: string, body: { status?: string; notes?: string; metDate?: string }) {
    return this.http.patch<Donor>(`${this.base}/donors/${donorId}/compliance/${conditionId}`, body);
  }

// ─── Reporting Periods ────────────────────────────────────────────────────────

  reportingPeriods(params?: { projectId?: string; status?: string; page?: number; limit?: number }) {
    return this.http
      .get<ReportingPeriod[] | { data: ReportingPeriod[]; total: number }>(
        `${this.base}/reporting/periods`,
        { params: query(params) },
      )
      .pipe(
        map((response) =>
          Array.isArray(response)
            ? { data: response, total: response.length }
            : response,
        ),
      );
  }
  reportingPeriod(id: string) {
    return this.http.get<ReportingPeriod>(`${this.base}/reporting/periods/${id}`);
  }
  createReportingPeriod(body: CreateReportingPeriodDto & { dueDate?: string }) {
    const { frequency, cadence, dueDate, ...rest } = body;
    return this.http.post<ReportingPeriod>(`${this.base}/reporting/periods`, {
      ...rest,
      cadence: cadence ?? frequency,
      ...(dueDate ? { dueDate } : {}),
    });
  }
  updateReportingPeriod(id: string, body: { name?: string; cadence?: string; startDate?: string; endDate?: string; dueDate?: string; notes?: string }) {
    return this.http.patch<ReportingPeriod>(`${this.base}/reporting/periods/${id}`, body);
  }
  calculatePeriodResults(id: string) {
    return this.http.post<IndicatorResult[]>(`${this.base}/reporting/periods/${id}/calculate`, {});
  }
  updatePeriodNarrative(id: string, body: { narrative?: string; challenges?: string; lessonsLearned?: string; nextPeriodPlans?: string }) {
    return this.http.patch<ReportingPeriod>(`${this.base}/reporting/periods/${id}/narrative`, body);
  }

  updatePeriodStatus(id: string, status: ReportingPeriodStatus, notes?: string) {
    return this.http.patch<ReportingPeriod>(`${this.base}/reporting/periods/${id}/status`, { status, notes });
  }
  donorReport(projectId: string, params: { reportingPeriodId?: string; fromDate?: string; toDate?: string }) {
    return this.http.get<DonorReport>(`${this.base}/reports/donor/${projectId}`, { params: query(params) });
  }
  donorReportCsv(projectId: string, params: { reportingPeriodId?: string; fromDate?: string; toDate?: string }) {
    return this.http.get(`${this.base}/reports/donor/${projectId}/export`, {
      params: query(params),
      responseType: 'blob',
    });
  }
  exportPeriodReport(periodId: string, format: 'pdf' | 'excel') {
    return this.http.get(`${this.base}/reporting/periods/${periodId}/export?format=${format}`, {
      responseType: 'blob',
    });
  }

// ─── Period Targets ───────────────────────────────────────────────────────────
// Removed: setPeriodTarget / getPeriodTargets / deletePeriodTarget called
// `/indicators/:id/targets`, which has no backend route and was unused by the
// UI. Period targets live under `/reporting/targets` — see indicatorTargets()
// and upsertIndicatorTarget() above.

// ─── Audit Log ────────────────────────────────────────────────────────────────

  auditLog(params?: { entityId?: string; entity?: string; userId?: string; action?: string; page?: number; limit?: number }) {
    return this.http.get<{ data: AuditEvent[]; total: number }>(`${this.base}/audit`, { params: query(params) });
  }
  // budgetAuditLog(entityId: string) {
  //   return this.http.get<AuditEvent[]>(`${this.base}/budget/audit/${entityId}`);
  // }

// ─── In-App Notifications ─────────────────────────────────────────────────────

  notifications(params?: { isRead?: boolean; page?: number; limit?: number }) {
    return this.http.get<{ data: AppNotification[]; total: number; unreadCount: number }>(
      `${this.base}/notifications`,
      { params: query(params) }
    );
  }
  markNotificationRead(id: string) {
    return this.http.patch(`${this.base}/notifications/${id}/read`, {});
  }
  markAllNotificationsRead() {
    return this.http.post(`${this.base}/notifications/read-all`, {});
  }
  deleteNotification(id: string) {
    return this.http.delete(`${this.base}/notifications/${id}`);
  }

// ─── Data Quality ─────────────────────────────────────────────────────────────

  dataQualityReport(projectId: string, periodId?: string) {
    let params = new HttpParams().set('projectId', projectId);
    if (periodId) {
      params = params.set('periodId', periodId);
    }
    return this.http.get<DataQualityReport>(`${this.base}/reporting/data-quality`, { params });
  }

// ─── AI Copilot ──────────────────────────────────────────────────────────────

  copilotMessage(
    message: string,
    projectId?: string,
    history?: CopilotChatMessage[],
  ) {
    return this.http.post<CopilotResponse>(`${this.base}/ai/copilot/message`, {
      message,
      projectId: projectId || undefined,
      history: history?.length ? history : undefined,
    });
  }

  copilotDraftReport(
    reportingPeriodId: string,
    options?: { style?: 'narrative' | 'bullet' | 'executive'; includeFinancials?: boolean; includeFeedback?: boolean },
  ) {
    return this.http.post<DraftReportResponse>(`${this.base}/ai/copilot/draft-report`, {
      reportingPeriodId,
      ...options,
    });
  }

  copilotToC(projectId: string) {
    return this.http.get<ToCResponse>(`${this.base}/ai/copilot/theory-of-change/${projectId}`);
  }

  copilotIndicatorDefinition(data: { title: string; level: string; sector?: string; unit?: string }) {
    return this.http.post<IndicatorDefinitionResponse>(`${this.base}/ai/copilot/indicator-definition`, data);
  }

  copilotSuggestActions(projectId?: string) {
    let params = new HttpParams();
    if (projectId) params = params.set('projectId', projectId);
    return this.http.get<SuggestActionsResponse>(`${this.base}/ai/copilot/suggest-actions`, { params });
  }


  // ─── Profile ──────────────────────────────────────────────────────────────

  updateProfile(dto: { name: string }) {
    return this.http.patch<any>(`${this.base}/auth/me`, dto);
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.http.patch<{ success: boolean }>(`${this.base}/auth/me/password`, { currentPassword, newPassword });
  }

  // ─── Documents ────────────────────────────────────────────────────────────

  documents(params?: { projectId?: string }) {
    return this.http.get<PaginatedResult<OrgDocument> | OrgDocument[]>(`${this.base}/documents`, { params: query(params) }).pipe(
      map((r: any) => Array.isArray(r) ? r : (r.data ?? [])),
    );
  }

  /**
   * Paginated form of {@link documents} — keeps the `total`/`page` envelope so a
   * list view can render a pager instead of silently showing only page one.
   */
  documentsPage(params?: { projectId?: string; page?: number; limit?: number }) {
    return this.http.get<PaginatedResult<OrgDocument> | OrgDocument[]>(`${this.base}/documents`, { params: query(params) }).pipe(
      map((r: any): PaginatedResult<OrgDocument> => Array.isArray(r)
        ? { data: r, total: r.length, page: 1, limit: r.length || 1, pages: 1, hasMore: false }
        : r),
    );
  }

  document(id: string) {
    return this.http.get<OrgDocument>(`${this.base}/documents/${id}`);
  }

  createDocument(dto: CreateDocumentDto) {
    return this.http.post<OrgDocument>(`${this.base}/documents`, dto);
  }

  updateDocument(id: string, dto: Partial<Omit<CreateDocumentDto, 'projectId'>> & { projectId?: string | null }) {
    return this.http.patch<OrgDocument>(`${this.base}/documents/${id}`, dto);
  }

  deleteDocument(id: string) {
    return this.http.delete(`${this.base}/documents/${id}`);
  }

  documentVersions(documentId: string) {
    return this.http.get<DocumentVersion[]>(`${this.base}/documents/${documentId}/versions`);
  }

  createDocumentVersion(documentId: string, dto: CreateDocumentVersionDto) {
    return this.http.post<DocumentVersion>(`${this.base}/documents/${documentId}/versions`, dto);
  }

  // ─── Workplan ─────────────────────────────────────────────────────────────

  addWorkplanItem(projectId: string, dto: Partial<WorkplanItem>) {
    return this.http.post<Project>(`${this.base}/projects/${projectId}/workplan`, dto);
  }

  updateWorkplanItem(projectId: string, itemId: string, dto: Partial<WorkplanItem>) {
    return this.http.patch<Project>(`${this.base}/projects/${projectId}/workplan/${itemId}`, dto);
  }

  removeWorkplanItem(projectId: string, itemId: string) {
    return this.http.delete<Project>(`${this.base}/projects/${projectId}/workplan/${itemId}`);
  }

  // ─── Workflows ────────────────────────────────────────────────────────────

  workflowDefinitions(entityType?: string) {
    const params: Record<string, string> = {};
    if (entityType) params['entityType'] = entityType;
    return this.http.get<import('./models').WorkflowDefinition[]>(
      `${this.base}/workflows/definitions`, { params }
    );
  }

  workflowDefinition(id: string) {
    return this.http.get<import('./models').WorkflowDefinition>(`${this.base}/workflows/definitions/${id}`);
  }

  createWorkflowDefinition(dto: Partial<import('./models').WorkflowDefinition>) {
    return this.http.post<import('./models').WorkflowDefinition>(`${this.base}/workflows/definitions`, dto);
  }

  updateWorkflowDefinition(id: string, dto: Partial<import('./models').WorkflowDefinition>) {
    return this.http.patch<import('./models').WorkflowDefinition>(`${this.base}/workflows/definitions/${id}`, dto);
  }

  deleteWorkflowDefinition(id: string) {
    return this.http.delete(`${this.base}/workflows/definitions/${id}`);
  }

  workflowInstances(params?: { status?: string; entityType?: string; assignedToMe?: string; page?: number; limit?: number }) {
    return this.http.get<{ data: import('./models').WorkflowInstance[]; total: number; page: number; limit: number }>(
      `${this.base}/workflows/instances`, { params: params as Record<string, string> }
    );
  }

  workflowInstance(id: string) {
    return this.http.get<import('./models').WorkflowInstance>(`${this.base}/workflows/instances/${id}`);
  }

  startWorkflow(dto: { definitionId: string; entityType: string; entityId: string; entityTitle?: string }) {
    return this.http.post<import('./models').WorkflowInstance>(`${this.base}/workflows/instances`, dto);
  }

  actOnWorkflow(id: string, dto: { action: string; comment?: string; escalateToUserId?: string }) {
    return this.http.post<import('./models').WorkflowInstance>(`${this.base}/workflows/instances/${id}/action`, dto);
  }

  myWorkflowTasks() {
    return this.http.get<import('./models').WorkflowInstance[]>(`${this.base}/workflows/instances/my-tasks`);
  }

  workflowSummary() {
    return this.http.get<import('./models').WorkflowSummary>(
      `${this.base}/workflows/summary`
    );
  }

  workflowEntityTypes() {
    return this.http.get<import('./models').WorkflowEntityTypeInfo[]>(
      `${this.base}/workflows/entity-types`
    );
  }

  // ── Data Collection / Integrations ─────────────────────────────────────────

  integrations(projectId?: string) {
    const params: Record<string, string> = {};
    if (projectId) params['projectId'] = projectId;
    return this.http.get<any[]>(`${this.base}/forms/integrations`, { params });
  }

  integration(id: string) {
    return this.http.get<any>(`${this.base}/forms/integrations/${id}`);
  }

  integrationStats() {
    return this.http.get<any>(`${this.base}/forms/integrations/stats`);
  }

  createIntegration(dto: Record<string, unknown>) {
    return this.http.post<any>(`${this.base}/forms/integrations`, dto);
  }

  updateIntegration(id: string, dto: Record<string, unknown>) {
    return this.http.patch<any>(`${this.base}/forms/integrations/${id}`, dto);
  }

  deleteIntegration(id: string) {
    return this.http.delete(`${this.base}/forms/integrations/${id}`);
  }

  syncIntegration(id: string) {
    return this.http.post<any>(`${this.base}/forms/integrations/${id}/sync`, {});
  }

  uploadCsvData(id: string, file: File, delimiter = ',') {
    const form = new FormData();
    form.append('file', file);
    form.append('delimiter', delimiter);
    return this.http.post<any>(`${this.base}/forms/integrations/${id}/upload`, form);
  }

  createFormTemplateNew(dto: Record<string, unknown>) {
    return this.http.post<any>(`${this.base}/forms/templates`, dto);
  }

  updateFormTemplateById(id: string, dto: Record<string, unknown>) {
    return this.http.patch<any>(`${this.base}/forms/templates/${id}`, dto);
  }

  deleteFormTemplateById(id: string) {
    return this.http.delete(`${this.base}/forms/templates/${id}`);
  }

  submitFormResponseNew(dto: Record<string, unknown>) {
    return this.http.post<any>(`${this.base}/forms/responses`, dto);
  }

  // ─── Cloud Storage Integrations ────────────────────────────────────────────

  cloudProvidersConfig() {
    return this.http.get<import('./models').CloudProvidersConfig>(
      `${this.base}/documents/cloud/providers-config`,
    );
  }

  cloudAuthUrl(provider: import('./models').CloudProvider, redirectUri: string, state: string) {
    return this.http.get<import('./models').CloudAuthUrlResult>(`${this.base}/documents/cloud/auth-url`, {
      params: { provider, redirectUri, state },
    });
  }

  connectCloudStorage(dto: import('./models').ConnectCloudStorageDto) {
    return this.http.post<import('./models').CloudStorageConnection>(
      `${this.base}/documents/cloud/connect`,
      dto,
    );
  }

  cloudConnections() {
    return this.http.get<import('./models').CloudStorageConnection[]>(
      `${this.base}/documents/cloud/connections`,
    );
  }

  removeCloudConnection(connectionId: string) {
    return this.http.delete(`${this.base}/documents/cloud/connections/${connectionId}`);
  }

  listCloudFiles(connectionId: string, folderId?: string, search?: string) {
    const params: Record<string, string> = {};
    if (folderId) params['folderId'] = folderId;
    if (search)   params['search']   = search;
    return this.http.get<import('./models').CloudFile[]>(
      `${this.base}/documents/cloud/files/${connectionId}`,
      { params },
    );
  }

  importCloudFile(dto: import('./models').ImportCloudFileDto) {
    return this.http.post<import('./models').OrgDocument>(
      `${this.base}/documents/cloud/import`,
      dto,
    );
  }

  // ─── Enterprise: API Keys ─────────────────────────────────────────────────

  apiKeys() {
    return this.http.get<import('./models').ApiKey[]>(`${this.base}/api-keys`);
  }

  createApiKey(dto: import('./models').CreateApiKeyDto) {
    return this.http.post<import('./models').ApiKeyCreatedResponse>(`${this.base}/api-keys`, dto);
  }

  revokeApiKey(id: string) {
    return this.http.delete<{ revoked: boolean }>(`${this.base}/api-keys/${id}`);
  }

  // ─── Enterprise: SSO ──────────────────────────────────────────────────────

  ssoConfig() {
    return this.http.get<import('./models').SsoConfig>(`${this.base}/sso/config`);
  }

  upsertSsoConfig(dto: import('./models').UpsertSsoConfigDto) {
    return this.http.post<import('./models').SsoConfig>(`${this.base}/sso/config`, dto);
  }

  toggleSsoEnforcement(enforce: boolean) {
    return this.http.patch<import('./models').SsoConfig>(`${this.base}/sso/config/enforce`, { enforce });
  }

  samlSpMetadataUrl(orgId: string) {
    return `${this.base}/sso/${orgId}/saml/metadata`;
  }

  // ─── Enterprise: Branding ─────────────────────────────────────────────────

  brandingConfig() {
    return this.http.get<import('./models').BrandingConfig | null>(`${this.base}/branding/current`);
  }

  updateBranding(dto: import('./models').UpdateBrandingDto) {
    return this.http.patch<import('./models').BrandingConfig>(`${this.base}/branding`, dto);
  }

  initiateDomainVerification() {
    return this.http.post<{ token: string; txtRecord: string; domain: string }>(
      `${this.base}/branding/domain/initiate`, {}
    );
  }

  verifyDomain() {
    return this.http.post<{ verified: boolean; message: string }>(
      `${this.base}/branding/domain/verify`, {}
    );
  }

  // ─── Enterprise: Networks (Multi-org) ────────────────────────────────────

  networks() {
    return this.http.get<import('./models').OrgNetwork[]>(`${this.base}/networks`);
  }

  network(id: string) {
    return this.http.get<import('./models').OrgNetwork>(`${this.base}/networks/${id}`);
  }

  createNetwork(dto: { name: string; description?: string }) {
    return this.http.post<import('./models').OrgNetwork>(`${this.base}/networks`, dto);
  }

  inviteNetworkMember(networkId: string, dto: { organizationSlug: string; role?: string; label?: string }) {
    return this.http.post<import('./models').OrgNetwork>(`${this.base}/networks/${networkId}/members`, dto);
  }

  respondToNetworkInvite(networkId: string, accept: boolean) {
    return this.http.patch<import('./models').OrgNetwork>(
      `${this.base}/networks/${networkId}/members/respond`, { accept }
    );
  }

  removeNetworkMember(networkId: string, orgId: string) {
    return this.http.delete<import('./models').OrgNetwork>(
      `${this.base}/networks/${networkId}/members/${orgId}`
    );
  }

  networkRollup(networkId: string) {
    return this.http.get<import('./models').NetworkRollupResult>(
      `${this.base}/networks/${networkId}/rollup`
    );
  }

  // ── Scheduled reports ─────────────────────────────────────────────────────

  scheduledReports(projectId?: string) {
    const params: Record<string, string> = {};
    if (projectId) params['projectId'] = projectId;
    return this.http.get<any[]>(`${this.base}/reports/scheduled`, { params });
  }

  createScheduledReport(dto: {
    projectId: string; name: string; recipients: string[];
    cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly';
    dayOfMonth?: number; includeCsv?: boolean; reportingPeriodId?: string;
  }) {
    return this.http.post<any>(`${this.base}/reports/scheduled`, dto);
  }

  updateScheduledReport(id: string, dto: Partial<{
    name: string; recipients: string[];
    cadence: string; dayOfMonth: number; includeCsv: boolean; isActive: boolean;
  }>) {
    return this.http.put<any>(`${this.base}/reports/scheduled/${id}`, dto);
  }

  deleteScheduledReport(id: string) {
    return this.http.delete(`${this.base}/reports/scheduled/${id}`);
  }

  triggerScheduledReport(id: string) {
    return this.http.post<any>(`${this.base}/reports/scheduled/${id}/trigger`, {});
  }

  // ── Bulk CSV import ───────────────────────────────────────────────────────

  bulkImport(kind: 'activities' | 'beneficiaries', file: File, projectId?: string) {
    const form = new FormData();
    form.append('file', file);
    const params: Record<string, string> = {};
    if (projectId) params['projectId'] = projectId;
    return this.http.post<any>(`${this.base}/reports/import/${kind}`, form, { params });
  }

  importTemplate(kind: string) {
    return this.http.get(`${this.base}/reports/templates/${kind}.csv`, { responseType: 'text' });
  }

  // ── Adaptive Management Insights ──────────────────────────────────────────

  insights(projectId?: string) {
    let params = new HttpParams();
    if (projectId) params = params.set('projectId', projectId);
    return this.http.get<InsightsReport>(`${this.base}/dashboard/insights`, { params });
  }

  // ── ROI / Cost-per-Impact ──────────────────────────────────────────────────

  roi(projectId?: string) {
    let params = new HttpParams();
    if (projectId) params = params.set('projectId', projectId);
    return this.http.get<ROIReport>(`${this.base}/dashboard/roi`, { params });
  }

  /**
   * Unique beneficiaries reached vs. cumulative attendance. See
   * dashboard.service.ts#beneficiaryReach — coveragePct tells you how much
   * of the figure is backed by real Activity.beneficiaryIds links, since
   * that field isn't populated by every activity-creation flow yet.
   */
  beneficiaryReach(projectId?: string) {
    let params = new HttpParams();
    if (projectId) params = params.set('projectId', projectId);
    return this.http.get<BeneficiaryReachReport>(`${this.base}/dashboard/beneficiary-reach`, { params });
  }

  geoData(projectId?: string, types?: string[]) {
    let params = new HttpParams();
    if (projectId) params = params.set('projectId', projectId);
    if (types?.length) params = params.set('types', types.join(','));
    return this.http.get<GeoDataReport>(`${this.base}/dashboard/geo`, { params });
  }

  // ── Stakeholder Feedback ───────────────────────────────────────────────────

  feedbackList(query: FeedbackListQuery = {}) {
    let params = new HttpParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<PaginatedResult<StakeholderFeedback>>(`${this.base}/stakeholder-feedback`, { params });
  }

  feedbackAnalytics(projectId?: string) {
    let params = new HttpParams();
    if (projectId) params = params.set('projectId', projectId);
    return this.http.get<FeedbackAnalytics>(`${this.base}/stakeholder-feedback/analytics`, { params });
  }

  feedbackOne(id: string) {
    return this.http.get<StakeholderFeedback>(`${this.base}/stakeholder-feedback/${id}`);
  }

  createFeedback(dto: CreateFeedbackDto) {
    return this.http.post<StakeholderFeedback>(`${this.base}/stakeholder-feedback`, dto);
  }

  actionFeedback(id: string, body: { status: FeedbackStatus; action: string; notes?: string }) {
    return this.http.patch<StakeholderFeedback>(`${this.base}/stakeholder-feedback/${id}/action`, body);
  }

  deleteFeedback(id: string) {
    return this.http.delete<{ deleted: boolean }>(`${this.base}/stakeholder-feedback/${id}`);
  }
}