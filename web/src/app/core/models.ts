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


// Grant Management Models
export interface Grant {
  _id: string;
  name: string;
  description?: string;
  donorId?: string;
  amount: number;
  currency: string;
  amountSpent: number;
  status: 'pending' | 'active' | 'completed' | 'closed';
  startDate: string;
  endDate: string;
  linkedProjects: string[];
  requiresMonthlyReporting: boolean;
  requiresFinalReport: boolean;
  termsAndConditions?: string;
  createdAt: string;
  updatedAt: string;
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