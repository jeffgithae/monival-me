import { OrgRole } from './roles';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  role: OrgRole;
}

export interface Organization {
  id: string;
  name: string;
  country?: string;
  sector?: string;
  planId?: string;
  planName?: string;
  subscriptionStatus?: string;
  trialEndsAt?: string;
  limits?: {
    maxProjects: number | null;
    maxUsers: number | null;
    maxIndicatorsPerProject: number | null;
  };
}

export interface Project {
  _id: string;
  name: string;
  donor?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  status: string;
  evaluationStatus?: 'not_started' | 'in_progress' | 'completed';
  evaluationSummary?: string;
  lessonsLearned?: string;
  nextReviewDate?: string;
}

export interface DashboardHealthSummary {
  onTrack: number;
  atRisk: number;
  behind: number;
  noBaseline: number;
}

export interface QualityAlert {
  projectId?: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface DashboardOverview {
  counts: {
    projects: number;
    indicators: number;
    activities: number;
    members: number;
    pendingApprovals: number;
  };
  activeProjects: Array<{ _id: string; name: string; donor?: string; status: string; startDate?: string; endDate?: string }>;
  recentActivities: Array<{ id: string; title: string; activityDate: string; status: string; projectId: string }>;
  health: DashboardHealthSummary;
  qualityAlerts: QualityAlert[];
}

export interface Indicator {
  _id: string;
  projectId: string;
  parentId?: string;
  level?: string;
  code: string;
  title: string;
  unit?: string;
  meansOfVerification?: string;
  assumptions?: string;
  disaggregation?: string[];
  baseline: number;
  target: number;
  frequency: string;
}

export interface ReportingPeriod {
  _id: string;
  projectId: string;
  name: string;
  cadence: 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'custom';
  startDate: string;
  endDate: string;
  status: 'open' | 'submitted' | 'approved' | 'locked';
  submittedAt?: string;
  approvedAt?: string;
  notes?: string;
}

export interface IndicatorResult {
  _id: string;
  projectId: string;
  reportingPeriodId: string;
  indicatorId: string | Indicator;
  achieved: number;
  activityCount: number;
  sourceActivityIds: string[];
  disaggregations: Record<string, unknown>;
  narrative?: string;
  status: 'draft' | 'submitted' | 'approved' | 'locked';
}

export interface IndicatorTarget {
  _id: string;
  projectId: string;
  reportingPeriodId: string;
  indicatorId: string | Indicator;
  baseline: number;
  target: number;
  notes?: string;
}

export interface Activity {
  _id: string;
  projectId: string;
  indicatorId?: string;
  partnerId?: string;
  beneficiaryIds?: string[];
  title: string;
  description?: string;
  activityDate: string;
  location?: string;
  activityType?: string;
  templateId?: string;
  evidenceUrl?: string;
  evidenceNotes?: string;
  participants: number;
  quantity: number;
  notes?: string;
  status?: string;
}

export interface Partner {
  _id: string;
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  region?: string;
  district?: string;
  geoPoint?: { latitude: number; longitude: number };
  notes?: string;
}

export interface Beneficiary {
  _id: string;
  name: string;
  groupType?: string;
  location?: string;
  notes?: string;
}

export interface ActivityTemplate {
  _id: string;
  projectId: string;
  name: string;
  description?: string;
  indicatorId?: string;
  defaultLocation?: string;
  defaultActivityType?: string;
  defaultEvidenceUrl?: string;
  defaultParticipants: number;
  defaultQuantity: number;
  defaultNotes?: string;
}

export interface FormQuestion {
  key: string;
  label: string;
  description?: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox' | 'date' | 'boolean';
  required?: boolean;
  options?: string[];
  validation?: { min?: number; max?: number; pattern?: string; patternMessage?: string };
  conditional?: { dependsOn?: string; operator?: 'equals' | 'not_equals' | 'in' | 'not_in'; value?: unknown };
  repeatGroup?: boolean;
}

export interface FormSection {
  title: string;
  description?: string;
  questions: FormQuestion[];
  repeatGroup?: boolean;
}

export interface FormTemplate {
  _id: string;
  projectId?: string;
  indicatorId?: string;
  name: string;
  description?: string;
  status: 'draft' | 'active';
  sections: FormSection[];
  createdAt: string;
  updatedAt: string;
}

export interface FormResponse {
  _id: string;
  projectId: string;
  templateId: string;
  indicatorId?: string;
  activityId?: string;
  submittedByUserId?: string;
  collectedAt: string;
  answers: Record<string, unknown>;
  status: 'draft' | 'submitted';
}

export interface DonorReport {
  generatedAt: string;
  organization: Organization | null;
  project: {
    id: string;
    name: string;
    donor?: string;
    status: string;
    startDate?: string;
    endDate?: string;
  };
  reportingPeriod?: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
  } | null;
  summary: {
    indicatorCount: number;
    activityCount: number;
    totalParticipants: number;
    averageProgress: number;
  };
  indicators: Array<{
    id: string;
    code: string;
    title: string;
    unit?: string;
    baseline: number;
    target: number;
    achieved: number;
    percentComplete: number;
    activityCount: number;
    status?: string;
    narrative?: string;
    disaggregations?: Record<string, unknown>;
  }>;
  recentActivities: Array<{
    id: string;
    title: string;
    activityDate: string;
    location?: string;
    participants: number;
    quantity: number;
    indicatorId?: string;
  }>;
}

// Budget Tracking Models
export interface BudgetAllocation {
  _id: string;
  name: string;
  description?: string;
  projectId?: string;
  grantId?: string;
  donorId?: string;
  allocatedAmount: number;
  spentAmount: number;
  committedAmount: number;
  uncommittedAmount: number;
  currency: string;
  allocatedAmountUSD: number;
  category: 'operational' | 'project' | 'emergency' | 'strategic' | 'personnel' | 'travel' | 'equipment' | 'indirect';
  status: 'draft' | 'submitted' | 'approved' | 'active' | 'under_review' | 'closed' | 'archived';
  fiscalYear: number;
  startDate: string;
  endDate: string;
  isRestricted: boolean;
}

export interface BudgetLineItem {
  _id: string;
  /** References BudgetAllocation._id */
  budgetAllocationId: string;
  description: string;
  costCategory: string;
  unitDescription: string;
  quantity: number;
  unitCost: number;
  amount: number;
  spent: number;
  committed: number;
  status: 'planned' | 'committed' | 'spent' | 'cancelled';
  notes?: string;
  linkedActivityId?: string;
  linkedIndicatorId?: string;
  linkedGrantId?: string;
  reportingPeriodId?: string;
  invoiceReference?: string;
  paymentDate?: string;
  donorCostCategory?: string;
}

export interface BudgetVariance {
  _id: string;
  /** References BudgetAllocation._id */
  budgetAllocationId: string;
  period: string;
  budgetedAmount: number;
  actualAmount: number;
  variance: number;
  variancePercentage: number;
  trend: 'favorable' | 'unfavorable' | 'on_track';
  burnRate: number;
  projectedYearEnd: number;
  notes?: string;
  alertLevel: 'info' | 'warning' | 'critical';
}

export interface BudgetSummary {
  totalAllocated: number;
  totalAllocatedUSD: number;
  totalSpent: number;
  totalCommitted: number;
  totalUncommitted: number;
  overallBurnRate: number;
  projectedYearEnd: number;
  alertedBudgets: number;
  allocations: Array<{
    _id: string;
    name: string;
    category: string;
    currency: string;
    allocated: number;
    spent: number;
    committed: number;
    uncommitted: number;
    burnRate: number;
    status: string;
    alertLevel: string;
  }>;
  byCategory: Record<string, { allocated: number; spent: number }>;
}

// Balanced Scorecard Models
export interface BalancedScorecardObjective {
  title: string;
  description?: string;
  weight: number;
  target: number;
  current: number;
  status: 'on_track' | 'at_risk' | 'off_track';
}

export interface BalancedScorecardPerspective {
  perspective: 'financial' | 'customer' | 'internal' | 'learning';
  strategicTheme?: string;
  objectives: BalancedScorecardObjective[];
}

export interface BalancedScorecard {
  _id: string;
  name: string;
  fiscalYear: number;
  status: 'draft' | 'active' | 'archived';
  perspectives: BalancedScorecardPerspective[];
  lastReviewedBy?: string;
  lastReviewDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BSCPerformanceSummary {
  overall: number;
  byPerspective: {
    financial: number;
    customer: number;
    internal: number;
    learning: number;
  };
}

// OKR Models
export interface OKRKeyResult {
  title: string;
  description?: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  confidence: number;
  status: 'not_started' | 'in_progress' | 'at_risk' | 'completed';
  notes?: string;
}

export interface OKR {
  _id: string;
  title: string;
  description?: string;
  quarter: 1 | 2 | 3 | 4;
  year: number;
  status: 'draft' | 'active' | 'completed' | 'archived';
  keyResults: OKRKeyResult[];
  ownerUserId?: string;
  linkedProjects?: string[];
  progressPercentage: number;
  reviewedBy?: string;
  reviewDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OKRProgress {
  overallProgress: number;
  keyResults: Array<{
    index: number;
    title: string;
    progress: number;
    confidence: number;
    status: string;
  }>;
}


// Framework Configuration
export interface FrameworkConfig {
  availableFrameworks: Array<'logframe' | 'bsc' | 'okr'>;
  primaryFramework: 'logframe' | 'bsc' | 'okr';
}

// Strategic Overview Models
export interface StrategicPillar {
  pillar: string;
  description: string;
  initiatives: string[];
  lead?: string;
}

export interface StrategicOverview {
  vision: string;
  mission: string;
  strategicPillars: StrategicPillar[];
  goals?: string[];
  timeframe?: string;
}

/**
 * ADD THESE INTERFACES TO web/src/app/core/models.ts
 * They extend the existing model file — do NOT replace it.
 */

// ─── Grants ───────────────────────────────────────────────────────────────────

export type GrantStatus = 'prospect' | 'applied' | 'awarded' | 'active' | 'closed' | 'rejected' | 'completed' | 'pending';

export interface Grant {
  _id: string;
  organizationId: string;
  name: string;
  referenceNumber?: string;
  donorId?: any;
  projectId?: string;
  projectName?: string;
  status?: GrantStatus;
  currency: string;
  amount: number;
  disbursedAmount?: number;
  amountSpent: number;
  uncommittedAmount?: number;
  startDate: string;
  endDate: string;
  submissionDeadline?: string;
  reportingFrequency?: 'monthly' | 'quarterly' | 'semiannual' | 'annual';
  nextReportDue?: string;
  description?: string;
  objectives?: string;
  conditionsPrecedent?: string[];
  restrictedCostCategories?: string[];
  isRestricted?: boolean;
  attachmentUrls?: string[];
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  daysUntilExpiry?: number;
  burnRate?: number;
}

export interface CreateGrantDto {
  name: string;
  referenceNumber?: string;
  donorId?: string;
  projectId?: string;
  status?: GrantStatus;
  currency?: string;
  amount: number;
  startDate: string;
  endDate: string;
  submissionDeadline?: string;
  reportingFrequency?: string;
  description?: string;
  objectives?: string;
  isRestricted?: boolean;
}

export interface GrantSummary {
  totalGrantAmount: number;
  activeGrants: number;
  totalSpent: number;
  remainingBudget: number;
  expiringIn30Days?: Grant[];
  overdueReports?: Grant[];
  totalGrants?: number;
}

// ─── Donors ───────────────────────────────────────────────────────────────────

export type DonorType = 'bilateral' | 'multilateral' | 'foundation' | 'corporate' | 'individual' | 'government' | 'other';

export interface Donor {
  _id: string;
  organizationId: string;
  name: string;
  shortName?: string;
  type: DonorType;
  country?: string;
  website?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  description?: string;
  preferredReportingFormat?: string;
  requiresDisaggregation?: boolean;
  activeGrants?: number;
  totalFunded?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDonorDto {
  name: string;
  shortName?: string;
  type: DonorType;
  country?: string;
  website?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  description?: string;
  requiresDisaggregation?: boolean;
}

// ─── Reporting Periods ────────────────────────────────────────────────────────

export type ReportingPeriodFrequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'custom';
export type ReportingPeriodStatus = 'open' | 'submitted' | 'approved' | 'locked';

export interface IndicatorResult {
  // _id?: string;
  // indicatorId: string;
  indicatorTitle?: string;
  targetValue?: number;
  achievedValue: number;
  calculatedValue?: number;
  percentAchieved?: number;
  disaggregation?: Record<string, number>;
  narrative?: string;
  dataQualityIssues?: string[];
  source?: string;
  verifiedBy?: string;
}

export interface ReportingPeriod {
  _id: string;
  organizationId: string;
  projectId: string;
  projectName?: string;
  name: string;
  frequency?: ReportingPeriodFrequency;
  cadence: ReportingPeriodFrequency;
  startDate: string;
  endDate: string;
  dueDate?: string;
  status: ReportingPeriodStatus;
  results?: IndicatorResult[];
  narrative?: string;
  challenges?: string;
  lessonsLearned?: string;
  nextPeriodPlans?: string;
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  lockedAt?: string;
  totalActivities?: number;
  approvedActivities?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportingPeriodDto {
  projectId?: string;
  name: string;
  frequency?: ReportingPeriodFrequency;
  cadence?: ReportingPeriodFrequency;
  startDate: string;
  endDate: string;
  dueDate?: string;
  notes?: string;
}

// ─── Period Targets (add to Indicator model) ─────────────────────────────────

export interface PeriodTarget {
  period: string;        // "2026-Q1", "2026-01", "2026"
  targetValue: number;
  disaggregation?: Record<string, number>;
  notes?: string;
}

// Add to existing Indicator interface:
// periodTargets?: PeriodTarget[];

// ─── Audit Log ────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'CREATE' | 'UPDATE' | 'DELETE'
  | 'APPROVE' | 'REJECT' | 'SUBMIT'
  | 'LOCK' | 'CLOSE' | 'ARCHIVE'
  | 'LOGIN' | 'EXPORT' | 'REVISE'
  | 'CREATE_ALLOCATION' | 'APPROVE_ALLOCATION' | 'REVISE_ALLOCATION'
  | 'CLOSE_ALLOCATION' | 'CREATE_LINE_ITEM' | 'UPDATE_LINE_ITEM'
  | 'CALCULATE_VARIANCE' | 'DELETE_ALLOCATION' | 'DELETE_LINE_ITEM';

export interface AuditEvent {
  _id: string;
  organizationId: string;
  userId: string;
  userEmail: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  ipAddress?: string;
  reason?: string;
  createdAt: string;
}

// ─── In-App Notifications ─────────────────────────────────────────────────────

export type NotificationType =
  | 'activity_pending_review'
  | 'activity_approved'
  | 'activity_rejected'
  | 'grant_expiring_soon'
  | 'grant_report_due'
  | 'budget_threshold_warning'
  | 'budget_threshold_critical'
  | 'period_due_soon'
  | 'period_submitted'
  | 'period_approved'
  | 'team_invite_accepted'
  | 'indicator_target_missed';

export interface AppNotification {
  _id: string;
  userId: string;
  organizationId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityId?: string;
  entityType?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

// ─── Data Quality ─────────────────────────────────────────────────────────────

export interface DataQualityIssue {
  indicatorId: string;
  indicatorTitle: string;
  issueType: 'missing_data' | 'outlier' | 'stale' | 'no_activities' | 'target_missed_by_50pct';
  severity: 'low' | 'medium' | 'high';
  description: string;
  lastUpdated?: string;
}

export interface DataQualityReport {
  projectId: string;
  periodId?: string;
  generatedAt: string;
  overallScore: number;  // 0-100
  issues: DataQualityIssue[];
  totalIndicators: number;
  indicatorsWithData: number;
  indicatorsOnTrack: number;
  staleIndicators: number;
}

export interface CopilotResponse {
  answer: string;
  recommendations: string[];
  context: {
    projects: Array<{
      id: string;
      name: string;
      status: string;
      donor?: string;
      endDate?: string;
    }>;
    recentActivities: Array<{
      id: string;
      title: string;
      status?: string;
      activityDate: string;
    }>;
    reportingPeriods: Array<{
      id: string;
      name: string;
      status: ReportingPeriodStatus;
      startDate: string;
      endDate: string;
    }>;
  };
}
