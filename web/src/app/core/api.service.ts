import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import {
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
  Grant,
  GrantSummary,
  PeriodTarget,
  ReportingPeriodStatus,
} from './models';
import { OrgRole } from './roles';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

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

  // reportingPeriods(projectId?: string) {
  //   let params = new HttpParams();
  //   if (projectId) params = params.set('projectId', projectId);
  //   return this.http.get<ReportingPeriod[]>(`${this.base}/reporting/periods`, { params });
  // }

  // createReportingPeriod(payload: {
  //   projectId: string;
  //   name: string;
  //   cadence?: string;
  //   startDate: string;
  //   endDate: string;
  //   notes?: string;
  // }) {
  //   return this.http.post<ReportingPeriod>(`${this.base}/reporting/periods`, payload);
  // }
  

  calculateReportingResults(periodId: string) {
    return this.http.post<IndicatorResult[]>(`${this.base}/reporting/periods/${periodId}/calculate`, {});
  }

  updateReportingPeriodStatus(periodId: string, status: 'submitted' | 'approved' | 'locked') {
    return this.http.patch<ReportingPeriod>(`${this.base}/reporting/periods/${periodId}/status`, {
      status,
    });
  }

  indicatorResults(reportingPeriodId: string) {
    return this.http.get<IndicatorResult[]>(`${this.base}/reporting/results`, {
      params: new HttpParams().set('reportingPeriodId', reportingPeriodId),
    });
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

  dataQuality(projectId?: string) {
    let params = new HttpParams();
    if (projectId) params = params.set('projectId', projectId);
    return this.http.get<{
      generatedAt: string;
      counts: { indicators: number; activities: number; critical: number; warning: number; info: number };
      alerts: Array<{ severity: 'critical' | 'warning' | 'info'; entityType: string; entityId?: string; message: string }>;
    }>(`${this.base}/reporting/data-quality`, { params });
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

  projects() {
    return this.http.get<Project[]>(`${this.base}/projects`);
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

  indicators(projectId?: string) {
    let params = new HttpParams();
    if (projectId) {
      params = params.set('projectId', projectId);
    }
    return this.http.get<Indicator[]>(`${this.base}/indicators`, { params });
  }

  createIndicator(body: Record<string, unknown>) {
    return this.http.post<Indicator>(`${this.base}/indicators`, body);
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

  // Beneficiaries
  beneficiaries() {
    return this.http.get<Beneficiary[]>(`${this.base}/beneficiaries`);
  }

  createBeneficiary(body: Partial<Beneficiary>) {
    return this.http.post<Beneficiary>(`${this.base}/beneficiaries`, body);
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

  createFormTemplate(body: Record<string, unknown>) {
    return this.http.post<FormTemplate>(`${this.base}/forms/templates`, body);
  }

  updateFormTemplate(id: string, body: Record<string, unknown>) {
    return this.http.patch<FormTemplate>(`${this.base}/forms/templates/${id}`, body);
  }

  deleteFormTemplate(id: string) {
    return this.http.delete(`${this.base}/forms/templates/${id}`);
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

  createFormResponse(body: Record<string, unknown>) {
    return this.http.post<FormResponse>(`${this.base}/forms/responses`, body);
  }

  deleteActivityTemplate(id: string) {
    return this.http.delete(`${this.base}/activities/templates/${id}`);
  }

  reviewActivity(id: string, status: 'approved' | 'rejected') {
    return this.http.patch(`${this.base}/activities/${id}/review`, { status });
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
    return this.http.get<BudgetAllocation[]>(`${this.base}/budget/allocations`, { params });
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

  grants(params?: { status?: string; projectId?: string; donorId?: string; page?: number; limit?: number }) {
    return this.http.get<{ data: Grant[]; total: number }>(`${this.base}/grants`, { params: params as any });
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
  updateGrantSpend(id: string, spentAmount: number) {
    return this.http.patch<Grant>(`${this.base}/grants/${id}/spending`, { spentAmount });
  }
  linkGrantToProject(grantId: string, projectId: string) {
    return this.http.post(`${this.base}/grants/${grantId}/link-project`, { projectId });
  }

// ─── Donors ───────────────────────────────────────────────────────────────────

  donors(params?: { type?: string; page?: number; limit?: number }) {
    return this.http.get<{ data: Donor[]; total: number }>(`${this.base}/donors`, { params: params as any });
  }
  donor(id: string) {
    return this.http.get<Donor>(`${this.base}/donors/${id}`);
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
  donorGrants(donorId: string) {
    return this.http.get<Grant[]>(`${this.base}/donors/${donorId}/grants`);
  }

// ─── Reporting Periods ────────────────────────────────────────────────────────

  reportingPeriods(params?: { projectId?: string; status?: string; page?: number; limit?: number }) {
    return this.http.get<{ data: ReportingPeriod[]; total: number }>(`${this.base}/reporting/periods`, { params: params as any });
  }
  reportingPeriod(id: string) {
    return this.http.get<ReportingPeriod>(`${this.base}/reporting/periods/${id}`);
  }
  createReportingPeriod(body: CreateReportingPeriodDto) {
    return this.http.post<ReportingPeriod>(`${this.base}/reporting/periods`, body);
  }
  calculatePeriodResults(id: string) {
    return this.http.post<ReportingPeriod>(`${this.base}/reporting/periods/${id}/calculate`, {});
  }
  updatePeriodStatus(id: string, status: ReportingPeriodStatus, notes?: string) {
    return this.http.patch<ReportingPeriod>(`${this.base}/reporting/periods/${id}/status`, { status, notes });
  }
  updateIndicatorResult(periodId: string, body: Partial<IndicatorResult> & { indicatorId: string }) {
    return this.http.patch<ReportingPeriod>(`${this.base}/reporting/results`, { periodId, ...body });
  }
  donorReport(projectId: string, params: { reportingPeriodId?: string; fromDate?: string; toDate?: string }) {
    return this.http.get(`${this.base}/reports/donor/${projectId}`, { params: params as any });
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
    // ✅ fixed
let params = new HttpParams();
if (periodId) params = params.set('periodId', periodId);
return this.http.get<DataQualityReport>(`${this.base}/reports/data-quality/${projectId}`, { params });}
  
}