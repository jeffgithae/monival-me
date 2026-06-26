import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../environments/environment.prod';
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
  StakeholderFeedback,
  CreateFeedbackDto,
  FeedbackListQuery,
  FeedbackStatus,
  FeedbackAnalytics,
  PaginatedResult,
} from './models';
import { OrgRole } from './roles';

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

  projects(params?: Record<string, string | number | boolean>) {
    return this.http.get<PaginatedResult<Project> | Project[]>(`${this.base}/projects`, { params: params as any }).pipe(
      map((r: any) => Array.isArray(r) ? r : (r.data ?? [])),
    );
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

  indicators(projectId?: string) {
    let params = new HttpParams();
    if (projectId) {
      params = params.set('projectId', projectId);
    }
    return this.http.get<PaginatedResult<Indicator> | Indicator[]>(`${this.base}/indicators`, { params }).pipe(
      map((r: any) => Array.isArray(r) ? r : (r.data ?? [])),
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

  activities(projectId?: string) {
    let params = new HttpParams();
    if (projectId) {
      params = params.set('projectId', projectId);
    }
    return this.http.get<Activity[]>(`${this.base}/activities`, { params });
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
    return this.http.patch<{ updated: number }>(`${this.base}/activities/bulk-review`, dto);
  }

  offlineSyncActivities(batch: Record<string, unknown>[]) {
    return this.http.post<{ results: Array<{ clientId: string; status: string; message?: string }> }>(
      `${this.base}/activities/offline-sync`,
      { activities: batch },
    );
  }

  // Beneficiaries
  beneficiaries(params?: Record<string, string | number | boolean>) {
    return this.http.get<{ data: Beneficiary[]; total: number; page: number; limit: number; pages: number }>(`${this.base}/beneficiaries`, { params: params as any });
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
    return this.http.get<{ data: Activity[] }>(`${this.base}/activities`, { params: { beneficiaryId, limit: '50' } as any });
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
  budgetAllocations(query?: { status?: string; fiscalYear?: number; projectId?: string; grantId?: string; category?: string }) {
    let params = new HttpParams();
    if (query?.status)     params = params.set('status', query.status);
    if (query?.fiscalYear) params = params.set('fiscalYear', String(query.fiscalYear));
    if (query?.projectId)  params = params.set('projectId', query.projectId);
    if (query?.grantId)    params = params.set('grantId', query.grantId);
    if (query?.category)   params = params.set('category', query.category);
    return this.http
      .get<{ data: BudgetAllocation[]; total: number; page: number; limit: number }>(
        `${this.base}/budget/allocations`,
        { params },
      )
      .pipe(map((response) => response.data));
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

  /** Line items — fetched by allocation ID path param: GET /budget/line-items/:allocationId */
  budgetLineItems(allocationId: string) {
    return this.http.get<BudgetLineItem[]>(`${this.base}/budget/line-items/${allocationId}`);
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

  /** Summary — GET /budget/summary/:organizationId */
  budgetSummary(organizationId: string, query?: { fiscalYear?: number; grantId?: string }) {
    let params = new HttpParams();
    if (query?.fiscalYear) params = params.set('fiscalYear', String(query.fiscalYear));
    if (query?.grantId)    params = params.set('grantId', query.grantId);
    return this.http.get<BudgetSummary>(`${this.base}/budget/summary/${organizationId}`, { params });
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

  getBSCPerformance(id: string) {
    return this.http.get<BSCPerformanceSummary>(`${this.base}/bsc/${id}/performance`);
  }

  markBSCAsReviewed(id: string) {
    return this.http.post<BalancedScorecard>(`${this.base}/bsc/${id}/mark-reviewed`, {});
  }

  deleteBalancedScorecard(id: string) {
    return this.http.delete(`${this.base}/bsc/${id}`);
  }

  // OKR API
  okrs() {
    return this.http.get<OKR[]>(`${this.base}/okrs`);
  }

  okr(id: string) {
    return this.http.get<OKR>(`${this.base}/okrs/${id}`);
  }

  createOKR(body: Partial<OKR>) {
    return this.http.post<OKR>(`${this.base}/okrs`, body);
  }

  updateOKR(id: string, body: Partial<OKR>) {
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

  // Strategic Overview API
  getStrategicOverview() {
    return this.http.get<StrategicOverview>(`${this.base}/organizations/strategic-overview`);
  }
/**
 * ADD THESE METHODS TO web/src/app/core/api.service.ts
 * They extend the existing ApiService class — do NOT replace the file.
 * Paste inside the class body.
 */

// ─── Grants ───────────────────────────────────────────────────────────────────

  grants(params?: { status?: string; donorId?: string; search?: string; page?: number; limit?: number }) {
    return this.http
      .get<Grant[] | { data: Grant[]; total: number }>(`${this.base}/grants`, { params: params as any })
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
  updateGrantSpend(id: string, spentAmount: number) {
    return this.http.patch<Grant>(`${this.base}/grants/${id}/spending`, { spentAmount });
  }
  linkGrantToProject(grantId: string, projectId: string) {
    return this.http.post(`${this.base}/grants/${grantId}/link-project`, { projectId });
  }

// ─── Donors ───────────────────────────────────────────────────────────────────

  donors(params?: { status?: string; type?: string; search?: string; tag?: string; page?: number; limit?: number }) {
    return this.http.get<import('./models').PaginatedResult<Donor>>(`${this.base}/donors`, { params: params as any });
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
        { params: params as any },
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
  calculatePeriodResults(id: string) {
    return this.http.post<IndicatorResult[]>(`${this.base}/reporting/periods/${id}/calculate`, {});
  }
  updatePeriodNarrative(id: string, body: { narrative?: string; challenges?: string; lessonsLearned?: string; nextPeriodPlans?: string }) {
    return this.http.patch<ReportingPeriod>(`${this.base}/reporting/periods/${id}/narrative`, body);
  }

  updatePeriodStatus(id: string, status: ReportingPeriodStatus, notes?: string) {
    return this.http.patch<ReportingPeriod>(`${this.base}/reporting/periods/${id}/status`, { status, notes });
  }
  updateIndicatorResult(periodId: string, body: Partial<IndicatorResult> & { indicatorId: string }) {
    return this.http.patch<ReportingPeriod>(`${this.base}/reporting/results`, { periodId, ...body });
  }
  donorReport(projectId: string, params: { reportingPeriodId?: string; fromDate?: string; toDate?: string }) {
    return this.http.get<DonorReport>(`${this.base}/reports/donor/${projectId}`, { params: params as any });
  }
  donorReportCsv(projectId: string, params: { reportingPeriodId?: string; fromDate?: string; toDate?: string }) {
    return this.http.get(`${this.base}/reports/donor/${projectId}/export`, {
      params: params as any,
      responseType: 'blob',
    });
  }
  exportPeriodReport(periodId: string, format: 'pdf' | 'excel') {
    return this.http.get(`${this.base}/reporting/periods/${periodId}/export?format=${format}`, {
      responseType: 'blob',
    });
  }

// ─── Period Targets ───────────────────────────────────────────────────────────

  setPeriodTarget(indicatorId: string, target: PeriodTarget) {
    return this.http.post(`${this.base}/indicators/${indicatorId}/targets`, target);
  }
  getPeriodTargets(indicatorId: string) {
    return this.http.get<PeriodTarget[]>(`${this.base}/indicators/${indicatorId}/targets`);
  }
  deletePeriodTarget(indicatorId: string, period: string) {
    return this.http.delete(`${this.base}/indicators/${indicatorId}/targets/${period}`);
  }

// ─── Audit Log ────────────────────────────────────────────────────────────────

  auditLog(params?: { entityId?: string; entity?: string; userId?: string; action?: string; page?: number; limit?: number }) {
    return this.http.get<{ data: AuditEvent[]; total: number }>(`${this.base}/audit`, { params: params as any });
  }
  // budgetAuditLog(entityId: string) {
  //   return this.http.get<AuditEvent[]>(`${this.base}/budget/audit/${entityId}`);
  // }

// ─── In-App Notifications ─────────────────────────────────────────────────────

  notifications(params?: { isRead?: boolean; page?: number; limit?: number }) {
    return this.http.get<{ data: AppNotification[]; total: number; unreadCount: number }>(
      `${this.base}/notifications`,
      { params: params as any }
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
    return this.http.get<OrgDocument[]>(`${this.base}/documents`, { params: params as any });
  }

  document(id: string) {
    return this.http.get<OrgDocument>(`${this.base}/documents/${id}`);
  }

  createDocument(dto: CreateDocumentDto) {
    return this.http.post<OrgDocument>(`${this.base}/documents`, dto);
  }

  updateDocument(id: string, dto: Partial<CreateDocumentDto>) {
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

  startWorkflow(dto: { definitionId: string; entityType: string; entityId: string; entityTitle: string }) {
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