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
    maxProjects: number;
    maxUsers: number;
    maxIndicatorsPerProject: number;
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
  baseline: number;
  target: number;
  frequency: string;
}

export interface Activity {
  _id: string;
  projectId: string;
  indicatorId?: string;
  title: string;
  description?: string;
  activityDate: string;
  location?: string;
  participants: number;
  quantity: number;
  notes?: string;
  status?: string;
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
  allocatedAmount: number;
  spentAmount: number;
  uncommittedAmount: number;
  category: 'operational' | 'project' | 'emergency' | 'strategic';
  status: 'draft' | 'approved' | 'active' | 'closed';
  fiscalYear: number;
  startDate: string;
  endDate: string;
  notes?: string;
}

export interface BudgetLineItem {
  _id: string;
  budgetId: string;
  title: string;
  description?: string;
  plannedAmount: number;
  spentAmount: number;
  status: 'planned' | 'committed' | 'spent' | 'cancelled';
  category?: string;
  dueDate?: string;
}

export interface BudgetVariance {
  _id: string;
  budgetId: string;
  period: string;
  plannedAmount: number;
  actualAmount: number;
  variance: number;
  variancePercentage: number;
  trend: 'favorable' | 'unfavorable';
}

export interface BudgetSummary {
  totalAllocated: number;
  totalSpent: number;
  totalUncommitted: number;
  allocations: BudgetAllocation[];
  variance: number;
  spentPercentage: number;
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
  lastReviewedBy?: string;
  lastReviewDate?: string;
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
