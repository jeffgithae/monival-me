import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import {
  Activity,
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
  OKR,
  OKRProgress,
  Project,
  StrategicOverview,
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
        maxProjects: number;
        maxUsers: number;
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

  donors() {
    return this.http.get<Array<{ _id: string; name: string; contactEmail?: string }>>(
      `${this.base}/donors`,
    );
  }

  createDonor(body: { name: string; contactEmail?: string; country?: string }) {
    return this.http.post(`${this.base}/donors`, body);
  }

  projects() {
    return this.http.get<Project[]>(`${this.base}/projects`);
  }

  project(id: string) {
    return this.http.get<Project>(`${this.base}/projects/${id}`);
  }

  createProject(body: Partial<Project>) {
    return this.http.post<Project>(`${this.base}/projects`, body);
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

  reviewActivity(id: string, status: 'approved' | 'rejected') {
    return this.http.patch(`${this.base}/activities/${id}/review`, { status });
  }

  donorReport(projectId: string, fromDate?: string, toDate?: string) {
    let params = new HttpParams();
    if (fromDate) params = params.set('fromDate', fromDate);
    if (toDate) params = params.set('toDate', toDate);
    return this.http.get<DonorReport>(`${this.base}/reports/donor/${projectId}`, { params });
  }

  // Budget Tracking API
  budgetAllocations() {
    return this.http.get<BudgetAllocation[]>(`${this.base}/budget/allocations`);
  }

  budgetAllocation(id: string) {
    return this.http.get<BudgetAllocation>(`${this.base}/budget/allocations/${id}`);
  }

  createBudgetAllocation(body: Partial<BudgetAllocation>) {
    return this.http.post<BudgetAllocation>(`${this.base}/budget/allocations`, body);
  }

  updateBudgetAllocation(id: string, body: Partial<BudgetAllocation>) {
    return this.http.patch<BudgetAllocation>(`${this.base}/budget/allocations/${id}`, body);
  }

  approveBudget(id: string) {
    return this.http.post<BudgetAllocation>(`${this.base}/budget/allocations/${id}/approve`, {});
  }

  deleteBudgetAllocation(id: string) {
    return this.http.delete(`${this.base}/budget/allocations/${id}`);
  }

  budgetLineItems(budgetId: string) {
    return this.http.get<BudgetLineItem[]>(
      `${this.base}/budget/line-items?budgetId=${budgetId}`,
    );
  }

  createBudgetLineItem(body: Partial<BudgetLineItem>) {
    return this.http.post<BudgetLineItem>(`${this.base}/budget/line-items`, body);
  }

  updateBudgetLineItem(id: string, body: Partial<BudgetLineItem>) {
    return this.http.patch<BudgetLineItem>(`${this.base}/budget/line-items/${id}`, body);
  }

  deleteBudgetLineItem(id: string) {
    return this.http.delete(`${this.base}/budget/line-items/${id}`);
  }

  budgetVariance(budgetId: string) {
    return this.http.get<BudgetVariance[]>(
      `${this.base}/budget/variance?budgetId=${budgetId}`,
    );
  }

  budgetSummary() {
    return this.http.get<BudgetSummary>(`${this.base}/budget/summary`);
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
}

// Import OKRKeyResult for the method signature
import { OKRKeyResult } from './models';
