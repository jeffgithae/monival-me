import { OrgRole } from './roles';

// ─── Auth ─────────────────────────────────────────────────────────────────────

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

// ─── Project sub-types ────────────────────────────────────────────────────────

export interface ProjectRisk {
  _id: string;
  title: string;
  description?: string;
  likelihood: 'low' | 'medium' | 'high' | 'critical';
  impact: 'low' | 'medium' | 'high' | 'critical';
  mitigationPlan?: string;
  contingencyPlan?: string;
  status: 'open' | 'mitigated' | 'accepted' | 'closed';
  ownerId?: string;
  ownerName?: string;
  reviewDate?: string;
  closedDate?: string;
  closureNotes?: string;
}

export interface ProjectMilestone {
  _id: string;
  title: string;
  description?: string;
  dueDate: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';
  completedDate?: string;
  ownerId?: string;
  ownerName?: string;
  linkedIndicatorIds?: string[];
  progressPct: number;
  completionNotes?: string;
}

export interface WorkplanItem {
  _id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  linkedIndicatorIds?: string[];
  responsibleUserId?: string;
  responsibleName?: string;
  status: 'planned' | 'in_progress' | 'completed' | 'delayed' | 'cancelled';
  progressPct: number;
  quarter?: string;
  estimatedCost?: number;
  actualCost?: number;
  outputDescription?: string;
}

export interface ProjectStakeholder {
  _id: string;
  name: string;
  organisation?: string;
  role?: string;
  email?: string;
  phone?: string;
  type: 'internal' | 'external' | 'donor' | 'government' | 'community' | 'private_sector' | 'un_agency' | 'ngo';
  influence: 'low' | 'medium' | 'high';
  interest: 'low' | 'medium' | 'high';
  engagementStrategy: 'manage_closely' | 'keep_satisfied' | 'keep_informed' | 'monitor';
  notes?: string;
  isActive: boolean;
}

// ─── Project ──────────────────────────────────────────────────────────────────

export interface Project {
  _id: string;
  organizationId?: string;

  // Identity
  name: string;
  projectCode?: string;
  description?: string;
  objectives?: string[];
  tags?: string[];
  sector?: string;
  subSectors?: string[];

  // Phase & lifecycle
  status: string;
  projectPhase?: 'inception' | 'implementation' | 'scale_up' | 'closeout' | 'completed';
  evaluationStatus?: 'not_started' | 'in_progress' | 'completed' | 'under_review';
  evaluationSummary?: string;
  lessonsLearned?: string;
  archiveNotes?: string;
  isArchived?: boolean;
  isTemplate?: boolean;

  // Theory of change
  theoreticalApproach?: string;
  problemStatement?: string;
  changeHypothesis?: string;
  keyAssumptions?: string[];

  // Funding
  donor?: string;
  donorId?: string;
  grantIds?: string[];
  grantReference?: string;
  totalBudget?: number;
  currency?: string;

  // Timeline
  startDate?: string;
  endDate?: string;
  closureDate?: string;
  nextReviewDate?: string;
  extensionMonths?: number;

  // Geography
  country?: string;
  region?: string;
  district?: string;
  geoPoint?: { latitude: number; longitude: number };
  implementationAreas?: string[];
  coverageArea?: string;

  // Beneficiaries
  targetBeneficiaryCount?: number;
  targetDirectBeneficiaries?: number;
  targetIndirectBeneficiaries?: number;
  targetGroups?: string[];
  populationServed?: string;

  // Partnerships
  implementationPartners?: string[];
  partnerIds?: string[];

  // Team
  projectManagerId?: string;
  projectManagerName?: string;
  meOfficerId?: string;
  meOfficerName?: string;

  // Planning artifacts
  milestones?: ProjectMilestone[];
  workplan?: WorkplanItem[];
  risks?: ProjectRisk[];
  stakeholders?: ProjectStakeholder[];

  // SDG & frameworks
  sdgGoals?: number[];
  frameworks?: string[];

  // Reporting settings
  reportingFrequency?: string;
  reportingNotes?: string;
  requiresEvidencePerActivity?: boolean;
  requiresDisaggregation?: boolean;

  // Quality
  dataQualityScore?: number;
  dataQualityLastChecked?: string;

  createdAt?: string;
  updatedAt?: string;
}

// ─── Project summary (from /projects/:id/summary) ─────────────────────────────

export interface ProjectIndicatorSummary {
  _id: string;
  code: string;
  title: string;
  unit?: string;
  level: string;
  baseline: number;
  target: number;
  achieved: number;
  remaining: number;
  pct: number;
  trend: 'up' | 'down' | 'stable' | 'n/a';
  status: 'on_track' | 'at_risk' | 'behind';
  direction?: string;
  cumulative?: boolean;
  frequency?: string;
  dataSource?: string;
  responsiblePerson?: string;
  isCore?: boolean;
  sdgGoals?: number[];
  activityCount: number;
}

export interface ProjectSummary {
  project: Project;
  indicators: ProjectIndicatorSummary[];
  activityCounts: {
    total: number;
    approved: number;
    submitted: number;
    rejected: number;
    draft: number;
  };
  periods: Array<{
    _id: string;
    name: string;
    cadence: string;
    status: string;
    startDate: string;
    endDate: string;
  }>;
  summary: {
    avgProgress: number;
    totalParticipants: number;
    totalCost: number;
    budgetUtilisationPct: number | null;
    indicatorCount: number;
    coreIndicatorCount: number;
    onTrack: number;
    atRisk: number;
    behind: number;
    timelinePct: number | null;
    daysRemaining: number | null;
    freshnessDays: number | null;
    openRisks: number;
    highRisks: number;
    riskScore: number;
    overdueMilestones: number;
    completedMilestones: number;
    milestoneProgress: number | null;
    lockedPeriods: number;
    reportingPeriodCount: number;
    dataQualityScore: number;
  };
}

// ─── Portfolio stats (from /projects/portfolio-stats) ─────────────────────────

export interface PortfolioStats {
  generatedAt: string;
  counts: {
    projects: number;
    indicators: number;
    activities: number;
    pendingApprovals: number;
    overdueMilestones: number;
    openRisks: number;
  };
  financials: {
    totalBudget: number;
    totalCost: number;
    budgetUtilisationPct: number | null;
    totalParticipants: number;
  };
  breakdowns: {
    status: Record<string, number>;
    sector: Record<string, number>;
  };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

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

// ─── Disaggregation ───────────────────────────────────────────────────────────

export interface DisaggregationCategory {
  label: string;
  values: string[];
}

export interface AnnualTarget {
  year: number;
  target: number;
  achieved?: number;
  notes?: string;
}

// ─── Indicator ────────────────────────────────────────────────────────────────

export interface Indicator {
  _id: string;
  projectId: string;
  parentId?: string;

  // Logframe position
  level: string;
  code: string;
  title: string;
  definition?: string;
  rationale?: string;

  // Measurement
  unit?: string;
  indicatorType?: 'number' | 'percentage' | 'ratio' | 'yes_no' | 'text' | 'currency' | 'score';
  direction?: 'increasing' | 'decreasing' | 'maintain';
  cumulative?: boolean;

  // Targets
  baseline: number;
  baselineDate?: string;
  baselineSource?: string;
  target: number;
  annualTargets?: AnnualTarget[];
  frequency: string;

  // Disaggregation
  disaggregation?: string[];
  disaggregationCategories?: DisaggregationCategory[];

  // Gender markers
  genderMarker?: string;
  isGenderDisaggregated?: boolean;
  isAgeDisaggregated?: boolean;

  // Data collection
  dataSource?: string;
  dataCollectionMethod?: string;
  meansOfVerification?: string;
  dataCollectionTool?: string;
  reportingResponsibility?: string;
  verificationFrequency?: string;

  // Responsibility
  responsiblePerson?: string;
  responsibleUserId?: string;

  // Quality
  assumptions?: string;
  limitations?: string;
  precautionsForDataQuality?: string;
  isCore?: boolean;
  isStandardIndicator?: boolean;
  standardIndicatorCode?: string;
  standardFramework?: string;

  // SDG
  sdgGoals?: number[];
  sdgTargets?: string[];

  // Status
  isActive?: boolean;
  sortOrder?: number;
  lastAchievedValue?: number;
  lastAchievedDate?: string;
}

// ─── Indicator performance (from /indicators/:id/performance) ─────────────────

export interface IndicatorPerformance {
  indicator: Indicator;
  achieved: number;
  pct: number;
  remaining: number;
  status: 'on_track' | 'at_risk' | 'behind';
  activityCount: number;
  trend: Array<{ month: string; value: number }>;
  periodTrend: 'up' | 'down' | 'stable' | 'n/a';
  disaggSummary: Record<string, Record<string, number>>;
  annualProgress: Array<{ year: number; target: number; achieved: number; pct: number }>;
  lastActivity: Activity | null;
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export interface DisaggregationEntry {
  category: string;
  value: string;
  count: number;
}

export interface ActivityAttachment {
  filename: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt: string;
}

export interface Activity {
  _id: string;
  projectId: string;
  indicatorId?: string;
  partnerId?: string;
  beneficiaryIds?: string[];
  templateId?: string;
  grantId?: string;

  // Core
  title: string;
  description?: string;
  activityDate: string;
  activityType?: string;

  // Location
  location?: string;
  country?: string;
  region?: string;
  district?: string;
  village?: string;
  site?: string;
  geoPoint?: { latitude: number; longitude: number };

  // Outputs
  participants: number;
  quantity: number;

  // Participant breakdown
  participantsMale?: number;
  participantsFemale?: number;
  participantsOther?: number;
  participantsUnder18?: number;
  participantsOver60?: number;
  participantsPwd?: number;
  participantsIdp?: number;
  participantsRefugee?: number;

  // Disaggregated data
  disaggregationData?: DisaggregationEntry[];

  // Financial
  cost?: number;
  costCurrency?: string;
  budgetLine?: string;

  // Evidence
  evidenceUrl?: string;
  evidenceNotes?: string;
  attachments?: ActivityAttachment[];
  hasPhotoEvidence?: boolean;
  hasSignatureSheet?: boolean;

  // Narrative
  notes?: string;
  challenges?: string;
  recommendations?: string;
  followUpActions?: string;

  // Workflow
  status?: 'draft' | 'submitted' | 'approved' | 'rejected';
  rejectionReason?: string;
  submittedByUserId?: string;
  submittedAt?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;

  // Quality
  qualityFlags?: string[];

  createdAt?: string;
  updatedAt?: string;
}

// ─── Activity statistics (from /activities/statistics) ───────────────────────

export interface ActivityStatistics {
  generatedAt: string;
  totals: {
    activities: number;
    participants: number;
    quantity: number;
    cost: number;
    breakdown: {
      male: number;
      female: number;
      under18: number;
      pwd: number;
      idp: number;
      refugee: number;
    };
  };
  byType: Array<{ type: string; count: number; participants: number; quantity: number }>;
  byMonth: Array<{ year: number; month: number; count: number; participants: number; quantity: number }>;
  byLocation: Array<{ district: string; count: number; participants: number }>;
}

// ─── Activity template ────────────────────────────────────────────────────────

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

// ─── Reporting period ─────────────────────────────────────────────────────────

export interface ReportingPeriod {
  _id: string;
  organizationId?: string;
  projectId: string;
  projectName?: string;
  name: string;
  cadence: 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'custom';
  startDate: string;
  endDate: string;
  dueDate?: string;
  notes?: string;
  donorRequirements?: string;
  narrative?: string;
  challenges?: string;
  lessonsLearned?: string;
  nextPeriodPlans?: string;
  status: 'open' | 'submitted' | 'approved' | 'locked';
  completionPct?: number;
  narrativeComplete?: boolean;
  financialsComplete?: boolean;
  approvedActivities?: number;
  totalActivities?: number;
  results?: IndicatorResult[];
  submittedBy?: string;
  submittedByUserId?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedByUserId?: string;
  approvedAt?: string;
  lockedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Indicator result ─────────────────────────────────────────────────────────

export interface DisaggregatedResult {
  category: string;
  value: string;
  count: number;
}

export interface IndicatorResult {
  _id: string;
  organizationId?: string;
  projectId: string;
  reportingPeriodId: string;
  indicatorId: string | Indicator;
  indicatorTitle?: string;
  achieved: number;
  achievedValue?: number;
  calculatedValue?: number;
  targetValue?: number;
  percentAchieved?: number;
  activityCount: number;
  sourceActivityIds: string[];
  disaggregatedResults?: DisaggregatedResult[];
  disaggregations: Record<string, unknown>;
  periodTarget?: number;
  varianceAbs?: number;
  variancePct?: number;
  narrative?: string;
  challengesNarrative?: string;
  lessonsNarrative?: string;
  nextStepsNarrative?: string;
  previousPeriodAchieved?: number;
  periodOverPeriodChange?: number;
  periodOverPeriodPct?: number;
  qualityFlags?: string[];
  status: 'draft' | 'submitted' | 'approved' | 'locked';
  submittedByUserId?: string;
  submittedAt?: string;
  approvedByUserId?: string;
  approvedAt?: string;
}

// ─── Indicator target ─────────────────────────────────────────────────────────

export interface IndicatorTarget {
  _id: string;
  projectId: string;
  reportingPeriodId: string;
  indicatorId: string | Indicator;
  baseline: number;
  target: number;
  notes?: string;
}

// ─── Partner ──────────────────────────────────────────────────────────────────

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

// ─── Forms ────────────────────────────────────────────────────────────────────

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

// ─── Donor report ─────────────────────────────────────────────────────────────

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

// ─── Budget ───────────────────────────────────────────────────────────────────

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

// ─── Grants ───────────────────────────────────────────────────────────────────

export type GrantStatus = 'prospect' | 'applied' | 'awarded' | 'active' | 'closed' | 'rejected' | 'completed' | 'pending';

export interface Grant {
  _id: string;
  organizationId: string;
  name: string;
  title?: string;
  totalAmount?: number;
  referenceNumber?: string;
  donorId?: any;
  projectId?: string;
  projectName?: string;
  status?: GrantStatus;
  currency: string;
  amount: number;
  disbursedAmount?: number;
  amountSpent: number;
  spentAmount?: number;
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
  donorName?: string;
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
export type DonorStatus = 'active' | 'prospect' | 'inactive' | 'former';

export interface Donor {
  _id: string;
  organizationId: string;
  name: string;
  shortName?: string;
  type: DonorType;
  status?: DonorStatus;
  country?: string;
  website?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  description?: string;
  preferredReportingFormat?: string;
  reportingCadence?: string;
  requiresDisaggregation?: boolean;
  activeGrants?: number;
  totalFunded?: number;
  complianceConditions?: Array<{ _id?: string; description: string; status?: 'pending' | 'met' | 'waived' | 'overdue'; dueDate?: string; notes?: string }>;
  engagements?: Array<{ _id?: string; type: string; date: string; summary: string; outcome?: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDonorDto {
  name: string;
  shortName?: string;
  type: DonorType;
  status?: DonorStatus;
  country?: string;
  website?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  description?: string;
  reportingCadence?: string;
  requiresDisaggregation?: boolean;
}

export interface DonorProfile {
  donor: Donor;
  grants: Grant[];
  projects: Array<{ _id: string; name: string; status?: string; startDate?: string; endDate?: string; donor?: string; donorId?: string }>;
  budgets: Array<Record<string, any>>;
  summary: {
    totalGrants: number;
    activeGrants: number;
    totalAwarded: number;
    totalSpent: number;
    remaining: number;
  };
}

export interface DonorPortfolioSummary {
  totalDonors: number;
  totalGrants: number;
  activeGrants: number;
  totalAwarded: number;
  totalSpent: number;
  totalDisbursed: number;
  remaining: number;
  countByType: Record<string, number>;
  countByStatus: Record<string, number>;
  expiringIn30Days: number;
  overdueReports: number;
  overdueCompliance: number;
}

export interface AddEngagementDto {
  type: string;
  date: string;
  summary: string;
  outcome?: string;
  relatedGrantId?: string;
}

export interface AddComplianceConditionDto {
  description: string;
  status?: 'pending' | 'met' | 'waived' | 'overdue' | string;
  dueDate?: string;
  metDate?: string;
  notes?: string;
}

// ─── Balanced Scorecard ───────────────────────────────────────────────────────

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

// ─── OKR ──────────────────────────────────────────────────────────────────────

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

// ─── Framework config ─────────────────────────────────────────────────────────

export interface FrameworkConfig {
  availableFrameworks: Array<'logframe' | 'bsc' | 'okr'>;
  primaryFramework: 'logframe' | 'bsc' | 'okr';
}

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

// ─── Audit ────────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'CREATE' | 'UPDATE' | 'DELETE'
  | 'APPROVE' | 'REJECT' | 'SUBMIT'
  | 'LOCK' | 'CLOSE' | 'ARCHIVE'
  | 'LOGIN' | 'EXPORT' | 'REVISE'
  | 'project.created' | 'project.updated' | 'project.deleted' | 'project.archived' | 'project.closed' | 'project.duplicated'
  | 'project.milestone.added' | 'project.milestone.updated' | 'project.milestone.removed'
  | 'project.risk.added' | 'project.risk.updated' | 'project.risk.removed'
  | 'project.workplan.added' | 'project.workplan.updated' | 'project.workplan.removed'
  | 'indicator.created' | 'indicator.updated' | 'indicator.deleted' | 'indicator.reordered'
  | 'activity.created' | 'activity.updated' | 'activity.deleted' | 'activity.approved' | 'activity.rejected'
  | 'reporting_period.created' | 'reporting_period.submitted' | 'reporting_period.approved' | 'reporting_period.locked'
  | string;

export interface AuditEvent {
  _id: string;
  organizationId: string;
  userId?: string;
  actorUserId?: string;
  userEmail?: string;
  action: AuditAction;
  entity?: string;
  entityType?: string;
  entityId?: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  reason?: string;
  createdAt: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType =
  | 'activity.submitted' | 'activity.approved' | 'activity.rejected'
  | 'project.created' | 'project.updated'
  | 'grant_expiring_soon' | 'grant_report_due'
  | 'budget_threshold_warning' | 'budget_threshold_critical'
  | 'period_due_soon' | 'period_submitted' | 'period_approved'
  | 'team_invite_accepted' | 'indicator_target_missed'
  | string;

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

// ─── Data quality ─────────────────────────────────────────────────────────────

export interface DataQualityIssue {
  indicatorId?: string;
  indicatorTitle?: string;
  entityType?: string;
  entityId?: string;
  issueType?: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  description?: string;
  lastUpdated?: string;
}

export interface DataQualityReport {
  overallScore: number;
  indicatorsWithData: number;
  totalIndicators: number;
  indicatorsOnTrack: number;
  staleIndicators: number;
  issues: DataQualityIssue[];
  generatedAt: string;
  counts: {
    indicators: number;
    activities: number;
    critical: number;
    warning: number;
    info: number;
  };
  alerts: DataQualityIssue[];
}

// ─── Period targets ───────────────────────────────────────────────────────────

export interface PeriodTarget {
  period: string;
  targetValue: number;
  disaggregation?: Record<string, number>;
  notes?: string;
}

// ─── AI Copilot ───────────────────────────────────────────────────────────────

export type ReportingPeriodStatus = 'open' | 'submitted' | 'approved' | 'locked';

export interface CopilotResponse {
  answer: string;
  recommendations: string[];
  context: {
    projects: Array<{ id: string; name: string; status: string; donor?: string; endDate?: string }>;
    recentActivities: Array<{ id: string; title: string; status?: string; activityDate: string }>;
    reportingPeriods: Array<{ id: string; name: string; status: ReportingPeriodStatus; startDate: string; endDate: string }>;
  };
}

// ─── Create DTOs ──────────────────────────────────────────────────────────────

export interface CreateReportingPeriodDto {
  projectId: string;
  name: string;
  cadence?: string;
  startDate: string;
  endDate: string;
  notes?: string;
  donorRequirements?: string;
  frequency?: 'monthly' | 'quarterly' | 'annual' | string;
  dueDate?: string;

}

export interface CreateProjectDto {
  name: string;
  projectCode?: string;
  description?: string;
  objectives?: string[];
  tags?: string[];
  sector?: string;
  subSectors?: string[];
  status?: string;
  projectPhase?: string;
  donor?: string;
  donorId?: string;
  grantReference?: string;
  totalBudget?: number;
  currency?: string;
  startDate?: string;
  endDate?: string;
  country?: string;
  region?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  implementationAreas?: string[];
  targetBeneficiaryCount?: number;
  targetDirectBeneficiaries?: number;
  targetIndirectBeneficiaries?: number;
  targetGroups?: string[];
  implementationPartners?: string[];
  projectManagerId?: string;
  projectManagerName?: string;
  meOfficerId?: string;
  meOfficerName?: string;
  sdgGoals?: number[];
  frameworks?: string[];
  reportingFrequency?: string;
  requiresEvidencePerActivity?: boolean;
  requiresDisaggregation?: boolean;
}

export interface CreateIndicatorDto {
  projectId: string;
  parentId?: string;
  level?: string;
  code: string;
  title: string;
  definition?: string;
  rationale?: string;
  unit?: string;
  indicatorType?: string;
  direction?: string;
  cumulative?: boolean;
  baseline?: number;
  baselineSource?: string;
  target: number;
  annualTargets?: AnnualTarget[];
  frequency?: string;
  disaggregation?: string[];
  disaggregationCategories?: DisaggregationCategory[];
  genderMarker?: string;
  isGenderDisaggregated?: boolean;
  isAgeDisaggregated?: boolean;
  dataSource?: string;
  dataCollectionMethod?: string;
  meansOfVerification?: string;
  dataCollectionTool?: string;
  reportingResponsibility?: string;
  verificationFrequency?: string;
  responsiblePerson?: string;
  responsibleUserId?: string;
  assumptions?: string;
  limitations?: string;
  precautionsForDataQuality?: string;
  isCore?: boolean;
  isStandardIndicator?: boolean;
  standardIndicatorCode?: string;
  standardFramework?: string;
  sdgGoals?: number[];
  sdgTargets?: string[];
  sortOrder?: number;
}

export interface CreateActivityDto {
  projectId: string;
  indicatorId?: string;
  title: string;
  description?: string;
  activityDate: string;
  activityType?: string;
  location?: string;
  country?: string;
  region?: string;
  district?: string;
  village?: string;
  site?: string;
  latitude?: number;
  longitude?: number;
  participants?: number;
  quantity?: number;
  participantsMale?: number;
  participantsFemale?: number;
  participantsOther?: number;
  participantsUnder18?: number;
  participantsOver60?: number;
  participantsPwd?: number;
  participantsIdp?: number;
  participantsRefugee?: number;
  disaggregationData?: DisaggregationEntry[];
  cost?: number;
  costCurrency?: string;
  grantId?: string;
  budgetLine?: string;
  evidenceUrl?: string;
  evidenceNotes?: string;
  hasPhotoEvidence?: boolean;
  hasSignatureSheet?: boolean;
  notes?: string;
  challenges?: string;
  recommendations?: string;
  followUpActions?: string;
  partnerId?: string;
  beneficiaryIds?: string[];
  templateId?: string;
  status?: 'draft' | 'submitted';
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface OrgDocument {
  _id: string;
  organizationId: string;
  projectId?: string;
  createdByUserId?: string;
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
  storageKey?: string;
  fileUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocumentVersion {
  _id: string;
  organizationId: string;
  documentId: string;
  versionNumber: number;
  releaseNotes?: string;
  storageKey?: string;
  fileUrl?: string;
  createdByUserId?: string;
  createdAt?: string;
}

export interface CreateDocumentDto {
  title: string;
  description?: string;
  projectId?: string;
  category?: string;
  tags?: string[];
  fileUrl?: string;
  storageKey?: string;
}


export interface CreateDocumentVersionDto {
  releaseNotes?: string;
  fileUrl?: string;
  storageKey?: string;
}

// ─── Cloud Storage Integrations ───────────────────────────────────────────────

export type CloudProvider = 'google_drive' | 'dropbox' | 'sharepoint';

export interface CloudStorageConnection {
  _id: string;
  organizationId: string;
  connectedByUserId: string;
  provider: CloudProvider;
  label: string;
  accountMeta: {
    email?: string;
    name?: string;
    accountId?: string;
    [key: string]: unknown;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CloudFile {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  modifiedAt?: string;
  webViewLink?: string;
  iconUrl?: string;
  isFolder: boolean;
  parentId?: string | null;
}

export interface ConnectCloudStorageDto {
  provider: CloudProvider;
  code: string;
  codeVerifier?: string;
  redirectUri: string;
  label?: string;
}

export interface ImportCloudFileDto {
  connectionId: string;
  fileId: string;
  fileName: string;
  fileUrl?: string;
  mimeType?: string;
  projectId?: string;
  category?: string;
}

export interface CloudAuthUrlResult {
  authUrl: string;
  state: string;
}

export type CloudProvidersConfig = Record<CloudProvider, { configured: boolean; label: string }>;

// ─── Beneficiary ──────────────────────────────────────────────────────────────

export interface HouseholdMember {
  name: string;
  relationship?: string;
  sex?: 'male' | 'female' | 'other';
  age?: number;
  hasDisability?: boolean;
  disabilityType?: string;
}

export interface ServiceRecord {
  _id?: string;
  projectId?: string;
  activityId?: string;
  serviceType: string;
  serviceDate: string;
  description?: string;
  quantity?: number;
  unit?: string;
  isExited?: boolean;
}

export interface ServiceRecordDto {
  projectId?: string;
  activityId?: string;
  serviceType: string;
  serviceDate: string;
  description?: string;
  quantity?: number;
  unit?: string;
}

export interface ProgramEnrollment {
  _id?: string;
  projectId: string | { _id: string; name: string };
  enrolledAt: string;
  exitedAt?: string;
  status: 'active' | 'completed' | 'transferred' | 'dropped_out' | 'deceased';
  exitReason?: string;
  notes?: string;
}

export type BeneficiaryRegistrationType = 'individual' | 'household' | 'group' | 'community';
export type BeneficiaryStatus = 'active' | 'inactive' | 'closed' | 'transferred' | 'deceased';
export type BeneficiaryAgeGroup = 'child_under5' | 'child_5_17' | 'youth_18_24' | 'adult_25_59' | 'elderly_60plus';

export interface Beneficiary {
  _id: string;
  organizationId?: string;
  registrationType: BeneficiaryRegistrationType;
  name: string;
  caseId?: string;
  nationalId?: string;
  phoneNumber?: string;
  email?: string;
  // Demographics
  sex?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  dateOfBirth?: string;
  age?: number;
  ageGroup?: BeneficiaryAgeGroup;
  nationality?: string;
  ethnicity?: string;
  primaryLanguage?: string;
  education?: string;
  // Household
  householdSize: number;
  householdMembers?: HouseholdMember[];
  childrenUnder5?: number;
  childrenUnder18?: number;
  // Vulnerability
  hasDisability: boolean;
  disabilityType?: string;
  isIdp: boolean;
  isRefugee: boolean;
  isFemaleHeadedHousehold: boolean;
  isOrphan: boolean;
  isChronicallyIll: boolean;
  isElderly: boolean;
  vulnerabilityCategories?: string[];
  vulnerabilityScore?: number;
  // Location
  country?: string;
  region?: string;
  district?: string;
  village?: string;
  location?: string;
  geoPoint?: { latitude: number; longitude: number };
  settlementType?: string;
  // Program
  programEnrollments?: ProgramEnrollment[];
  serviceHistory?: ServiceRecord[];
  // Status
  status: BeneficiaryStatus;
  groupType?: string;
  groupSize?: number;
  caseWorker?: string;
  assignedUserId?: string;
  registrationDate?: string;
  lastContactDate?: string;
  // Consent
  consentGiven: boolean;
  consentDate?: string;
  consentMethod?: string;
  // Misc
  notes?: string;
  customFields?: Record<string, unknown>;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BeneficiaryStatistics {
  total: number;
  bySex: Record<string, number>;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byAgeGroup: Record<string, number>;
  vulnerable: {
    disabled: number;
    idp: number;
    refugee: number;
    femaleHeaded: number;
    orphan: number;
    chronicallyIll: number;
    elderly: number;
    consentGiven: number;
    totalHouseholdSize: number;
  };
}

export interface CreateBeneficiaryDto {
  registrationType?: string;
  name: string;
  caseId?: string;
  nationalId?: string;
  phoneNumber?: string;
  email?: string;
  sex?: string;
  dateOfBirth?: string;
  age?: number;
  ageGroup?: string;
  nationality?: string;
  ethnicity?: string;
  primaryLanguage?: string;
  education?: string;
  householdSize?: number;
  householdMembers?: HouseholdMember[];
  childrenUnder5?: number;
  childrenUnder18?: number;
  hasDisability?: boolean;
  disabilityType?: string;
  isIdp?: boolean;
  isRefugee?: boolean;
  isFemaleHeadedHousehold?: boolean;
  isOrphan?: boolean;
  isChronicallyIll?: boolean;
  isElderly?: boolean;
  vulnerabilityCategories?: string[];
  vulnerabilityScore?: number;
  country?: string;
  region?: string;
  district?: string;
  village?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  settlementType?: string;
  programEnrollments?: Array<{ projectId: string; enrolledAt?: string; status?: string; notes?: string }>;
  status?: string;
  groupType?: string;
  groupSize?: number;
  caseWorker?: string;
  registrationDate?: string;
  consentGiven?: boolean;
  consentDate?: string;
  consentMethod?: string;
  notes?: string;
  tags?: string[];
}
// ─── Workflows ────────────────────────────────────────────────────────────────

export type WorkflowEntityType =
  | 'activity'
  | 'report'
  | 'grant'
  | 'budget'
  | 'document'
  | 'beneficiary'
  | 'indicator_result';

export type ApprovalAction = 'approve' | 'reject' | 'escalate' | 'recall' | 'comment';

export type WorkflowStatus =
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'escalated'
  | 'cancelled'
  | 'recalled';

export interface WorkflowStepDefinition {
  order: number;
  name: string;
  description?: string;
  approverRole: string;
  approverUserId?: string;
  escalateAfterHours: number;
  escalateTo?: string;
  requiresComment: boolean;
  isOptional: boolean;
}

export interface ApprovalEvent {
  stepOrder: number;
  stepName: string;
  action: ApprovalAction;
  actorUserId: string;
  actorName: string;
  actorRole: string;
  comment?: string;
  createdAt: string;
  delegatedFrom?: string;
}

export interface WorkflowDefinition {
  _id: string;
  organizationId: string;
  name: string;
  description?: string;
  entityType: WorkflowEntityType;
  steps: WorkflowStepDefinition[];
  isActive: boolean;
  isDefault: boolean;
  createdBy: string;
  lastModifiedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowInstance {
  _id: string;
  organizationId: string;
  definitionId: string;
  entityType: WorkflowEntityType;
  entityId: string;
  entityTitle: string;
  initiatedBy: string;
  initiatedByName?: string;
  status: WorkflowStatus;
  currentStep: number;
  totalSteps: number;
  steps: WorkflowStepDefinition[];
  history: ApprovalEvent[];
  escalatedAt?: string;
  escalatedTo?: string;
  escalationReason?: string;
  stepDeadline?: string;
  completedAt?: string;
  rejectionReason?: string;
  approvalNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowSummary {
  pending: number;
  inReview: number;
  escalated: number;
  approved: number;
  rejected: number;
  overdue: number;
}

// ─── Data Collection / External Integrations ─────────────────────────────────

export type IntegrationPlatform = 'kobo' | 'odk' | 'commcare' | 'ona' | 'webhook' | 'csv';
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'disabled';

export interface ExternalIntegration {
  _id: string;
  organizationId: string;
  projectId?: string;
  templateId?: string;
  name: string;
  description?: string;
  platform: IntegrationPlatform;
  isActive: boolean;
  config: Record<string, unknown>;
  fieldMapping: Record<string, string>;
  indicatorId?: string;
  activityId?: string;
  syncStatus: SyncStatus;
  lastSyncAt?: string;
  lastSyncError?: string;
  totalSynced: number;
  lastBatchCount: number;
  syncIntervalMinutes?: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface IntegrationStats {
  total: number;
  active: number;
  totalSynced: number;
  errors: number;
}

export interface SyncResult {
  synced: number;
  skipped: number;
  errors: string[];
}

export interface DataCollectionQuestion {
  key: string;
  label: string;
  description?: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox' | 'date' | 'boolean';
  required?: boolean;
  options?: string[];
  validation?: { min?: number; max?: number; pattern?: string; patternMessage?: string };
  conditional?: { dependsOn?: string; operator?: 'equals' | 'not_equals' | 'in' | 'not_in'; value?: unknown };
}

export interface DataCollectionSection {
  title: string;
  description?: string;
  questions: DataCollectionQuestion[];
}
// ─── Enterprise / Scale Features ──────────────────────────────────────────────

export interface ApiKey {
  _id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  allowedIps: string[];
  scopes: string[];
  isActive: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  useCount: number;
  createdAt: string;
}

export interface CreateApiKeyDto {
  name: string;
  allowedIps?: string[];
  scopes?: string[];
  expiresAt?: string;
}

export interface ApiKeyCreatedResponse {
  key: string;  // raw key shown ONCE
  record: ApiKey;
}

export type SsoProtocol = 'saml' | 'oidc';

export interface SsoConfig {
  _id: string;
  organizationId: string;
  protocol: SsoProtocol;
  isEnabled: boolean;
  enforced: boolean;
  samlMetadataUrl?: string;
  samlEntryPoint?: string;
  samlIssuer?: string;
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcDiscoveryUrl?: string;
  attributeMapping: { email: string; firstName?: string; lastName?: string; role?: string };
  allowedDomains: string[];
  defaultRole: string;
  lastTestedAt?: string;
  lastTestResult?: 'success' | 'failed';
}

export interface UpsertSsoConfigDto {
  protocol: SsoProtocol;
  isEnabled?: boolean;
  enforced?: boolean;
  samlMetadataUrl?: string;
  samlMetadataXml?: string;
  samlEntryPoint?: string;
  samlIssuer?: string;
  samlCert?: string;
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  oidcDiscoveryUrl?: string;
  attributeMapping?: { email: string; firstName?: string; lastName?: string };
  allowedDomains?: string[];
  defaultRole?: string;
}

export interface BrandingConfig {
  _id: string;
  organizationId: string;
  appName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  customDomain?: string;
  customDomainVerified: boolean;
  domainVerificationToken?: string;
  reportFooterText?: string;
  hidePoweredBy: boolean;
  defaultTheme: 'light' | 'dark' | 'system';
  supportEmail?: string;
  supportUrl?: string;
}

export interface UpdateBrandingDto {
  appName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  customDomain?: string;
  reportFooterText?: string;
  hidePoweredBy?: boolean;
  defaultTheme?: 'light' | 'dark' | 'system';
  supportEmail?: string;
  supportUrl?: string;
}

export type NetworkMemberRole = 'lead' | 'implementing' | 'observer';
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface NetworkMember {
  organizationId: string;
  role: NetworkMemberRole;
  status: InviteStatus;
  invitedAt?: string;
  acceptedAt?: string;
  label?: string;
  sharedIndicatorCodes: string[];
}

export interface OrgNetwork {
  _id: string;
  hubOrganizationId: string;
  name: string;
  description?: string;
  members: NetworkMember[];
  isActive: boolean;
  createdAt: string;
}

export interface NetworkRollupIndicator {
  code: string;
  title: string;
  unit?: string;
  totalTarget: number;
  totalAchieved: number;
  progressPct: number;
  byOrg: Array<{ orgId: string; orgName: string; target: number; achieved: number }>;
}

export interface NetworkRollupResult {
  networkId: string;
  networkName: string;
  generatedAt: string;
  memberCount: number;
  indicators: NetworkRollupIndicator[];
  activities: {
    total: number;
    approved: number;
    pending: number;
    totalParticipants: number;
    byOrg: Array<{ orgId: string; orgName: string; count: number; participants: number }>;
  };
  projects: {
    total: number;
    active: number;
    completed: number;
    totalBudget: number;
    totalExpenditure: number;
  };
}

export interface PlanFeatures {
  hasApiAccess: boolean;
  hasSso: boolean;
  hasWhiteLabel: boolean;
  hasMultiOrgAggregation: boolean;
  hasDedicatedSupport: boolean;
  hasAuditLog: boolean;
}