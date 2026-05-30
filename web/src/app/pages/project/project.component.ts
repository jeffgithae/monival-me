import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Activity, ActivityTemplate, DonorReport, Indicator, IndicatorResult, Project, FormTemplate, FormResponse, ReportingPeriod } from '../../core/models';
import {
  canApproveActivities,
  canLogActivities,
  canManageIndicators,
} from '../../core/roles';

type Tab = 'framework' | 'indicators' | 'activities' | 'reporting' | 'report';

interface IndicatorNode extends Indicator {
  children: IndicatorNode[];
  achieved: number;
  percentComplete: number;
  remaining: number | null;
  variance: number | null;
  trend: 'up' | 'down' | 'stable' | 'n/a';
  status: string;
  lastActivityDate?: string;
}

@Component({
  selector: 'app-project',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, DatePipe],
  templateUrl: './project.component.html',
  styleUrl: './project.component.scss',
})
export class ProjectComponent implements OnInit {
  project = signal<Project | null>(null);
  indicators = signal<Indicator[]>([]);
  activities = signal<Activity[]>([]);
  activityTemplates = signal<ActivityTemplate[]>([]);
  formTemplates = signal<FormTemplate[]>([]);
  formResponses = signal<FormResponse[]>([]);
  reportingPeriods = signal<ReportingPeriod[]>([]);
  indicatorResults = signal<IndicatorResult[]>([]);
  partners = signal<Array<{ _id: string; name: string }>>([]);
  beneficiaries = signal<Array<{ _id: string; name: string }>>([]);
  report = signal<DonorReport | null>(null);
  tab = signal<Tab>('framework');
  projectId = '';

  readonly indicatorCount = computed(() => this.indicators().length);
  readonly activityCount = computed(() => this.activities().length);
  readonly activityStatusCounts = computed(() => {
    return this.activities().reduce(
      (counts, activity) => {
        const status = activity.status || 'approved';
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      },
      {} as Record<string, number>,
    );
  });
  readonly lastActivity = computed(() => {
    const activities = this.activities();
    if (!activities.length) return null;
    return activities.reduce((latest, activity) => {
      return new Date(activity.activityDate).getTime() > new Date(latest.activityDate).getTime() ? activity : latest;
    });
  });
  readonly dataFreshnessDays = computed(() => {
    const last = this.lastActivity();
    if (!last) return null;
    const diff = Math.ceil((Date.now() - new Date(last.activityDate).getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  });
  readonly healthSignal = computed(() => {
    const progress = this.indicatorProgress();
    const days = this.dataFreshnessDays();
    if (!this.indicatorCount()) return 'No baseline';
    if (days === null) return 'No data';
    if (days > 60) return 'Behind schedule';
    if (progress < 40) return 'At risk';
    if (progress < 75) return 'At risk';
    return 'On track';
  });
  readonly healthDetail = computed(() => {
    const days = this.dataFreshnessDays();
    if (days === null) {
      return 'No field reports submitted yet.';
    }
    if (days > 60) {
      return `Field data is stale; last update was ${days} days ago.`;
    }
    if (days > 30) {
      return `Data is slowing down; last activity was ${days} days ago.`;
    }
    return `Latest field data is ${days} days old.`;
  });
  readonly indicatorProgress = computed(() => {
    const indicators = this.indicators();
    if (indicators.length === 0) {
      return 0;
    }
    const values = indicators.map((indicator) => {
      if (!indicator.target) {
        return 0;
      }
      const achieved = this.activities()
        .filter((activity) => activity.indicatorId === indicator._id)
        .reduce((sum, activity) => sum + Number(activity.quantity || 0), 0);
      return Math.min(100, Math.round((achieved / indicator.target) * 100));
    });
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  });
  readonly timelineProgress = computed(() => {
    const project = this.project();
    if (!project || !project.startDate || !project.endDate) {
      return null;
    }
    const start = new Date(project.startDate).getTime();
    const end = new Date(project.endDate).getTime();
    const total = end - start;
    if (total <= 0) {
      return 0;
    }
    const elapsed = Date.now() - start;
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  });
  readonly indicatorSummaries = computed(() =>
    this.indicators().map((indicator) => {
      const achieved = this.activities()
        .filter((activity) => activity.indicatorId === indicator._id)
        .reduce((sum, activity) => sum + Number(activity.quantity || 0), 0);
      const percent = indicator.target ? Math.min(100, Math.round((achieved / indicator.target) * 100)) : 0;
      const trend = this.getIndicatorTrend(indicator);
      return {
        ...indicator,
        achieved,
        percentComplete: percent,
        status:
          percent >= 75 ? 'On track' : percent >= 40 ? 'At risk' : 'Behind',
        remaining: indicator.target ? Math.max(0, indicator.target - achieved) : null,
        variance: indicator.target ? Math.max(0, indicator.target - achieved) : null,
        trend,
        lastActivityDate: this.getLastActivityDate(indicator),
        nextDueDate: this.getIndicatorNextDueDate(indicator),
      };
    }),
  );
  readonly frameworkRoots = computed(() => {
    const nodes = new Map<string, IndicatorNode>();
    this.indicatorSummaries().forEach((summary) => {
      nodes.set(summary._id, {
        ...summary,
        children: [],
      });
    });

    const roots: IndicatorNode[] = [];
    nodes.forEach((node) => {
      if (node.parentId && nodes.has(node.parentId)) {
        nodes.get(node.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    });
    const order = ['goal', 'outcome', 'output', 'activity'];
    return roots.sort((a, b) => order.indexOf(a.level ?? 'output') - order.indexOf(b.level ?? 'output'));
  });
  readonly qualityAlerts = computed(() => {
    const alerts: Array<{ title: string; message: string; severity: 'critical' | 'warning' | 'info' }> = [];
    this.indicators().forEach((indicator) => {
      const achieved = this.activities()
        .filter((activity) => activity.indicatorId === indicator._id)
        .reduce((sum, activity) => sum + Number(activity.quantity || 0), 0);
      const lastDate = this.getLastActivityDate(indicator);
      const lastDays = lastDate
        ? Math.ceil((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      if (!indicator.target) {
        alerts.push({
          title: indicator.code,
          message: 'Indicator has no target defined.',
          severity: 'critical',
        });
      } else if (!lastDate) {
        alerts.push({
          title: indicator.code,
          message: 'No data collected against this indicator yet.',
          severity: 'warning',
        });
      } else if (lastDays !== null && lastDays > 45) {
        alerts.push({
          title: indicator.code,
          message: `Last data point is ${lastDays} days old; this indicator may be stale.`,
          severity: 'warning',
        });
      }

      if (indicator.target && achieved < indicator.target * 0.3) {
        alerts.push({
          title: indicator.code,
          message: 'Indicator is below 30% of the target and needs closer attention.',
          severity: 'info',
        });
      }
    });
    return alerts;
  });
  readonly daysRemaining = computed(() => {
    const project = this.project();
    if (!project || !project.endDate) return null;
    const end = new Date(project.endDate);
    const diff = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff : 0;
  });
  readonly projectHealth = computed(() => {
    const progress = this.indicatorProgress();
    if (!this.indicatorCount()) {
      return 'No baseline';
    }
    if (progress >= 75) {
      return 'On track';
    }
    if (progress >= 40) {
      return 'At risk';
    }
    return 'Behind';
  });
  readonly recentActivities = computed(() =>
    [...this.activities()].sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime()).slice(0, 4),
  );

  getLastActivityDate(indicator: Indicator): string | undefined {
    const activities = this.activities()
      .filter((activity) => activity.indicatorId === indicator._id)
      .sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime());
    return activities.length ? activities[0].activityDate : undefined;
  }

  getIndicatorTrend(indicator: Indicator): 'up' | 'down' | 'stable' | 'n/a' {
    const values = this.activities()
      .filter((activity) => activity.indicatorId === indicator._id)
      .sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime())
      .map((activity) => Number(activity.quantity || 0));
    if (values.length < 2) {
      return 'n/a';
    }
    if (values[0] > values[1]) {
      return 'up';
    }
    if (values[0] < values[1]) {
      return 'down';
    }
    return 'stable';
  }

  getIndicatorNextDueDate(indicator: Indicator): string | null {
    const lastUpdate = this.getLastActivityDate(indicator);
    const fallback = this.project()?.startDate;
    const referenceDate = lastUpdate ? new Date(lastUpdate) : fallback ? new Date(fallback) : null;
    if (!referenceDate) {
      return null;
    }
    const next = new Date(referenceDate);
    switch (indicator.frequency) {
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
      case 'annual':
        next.setFullYear(next.getFullYear() + 1);
        break;
      default:
        next.setMonth(next.getMonth() + 3);
    }
    return next.toISOString().slice(0, 10);
  }

  indicatorForm = {
    code: '',
    title: '',
    unit: '',
    level: 'output',
    baseline: 0,
    target: 0,
    frequency: 'quarterly',
    meansOfVerification: '',
    assumptions: '',
    disaggregationText: '',
  };
  reportFrom = '';
  reportTo = '';
  selectedReportingPeriodId = '';
  reportingPeriodForm = {
    name: '',
    cadence: 'quarterly',
    startDate: '',
    endDate: '',
    notes: '',
  };
  activityForm = {
    title: '',
    activityDate: new Date().toISOString().slice(0, 10),
    indicatorId: '',
    partnerId: '',
    beneficiaryIds: [] as string[],
    location: '',
    activityType: '',
    templateId: '',
    evidenceUrl: '',
    evidenceNotes: '',
    participants: 0,
    quantity: 0,
    notes: '',
    status: 'submitted' as 'draft' | 'submitted',
  };

  partnerQuery = signal('');
  beneficiaryQuery = signal('');

  readonly complianceReminder = computed(() => {
    const project = this.project();
    if (!project) return null;
    if (project.nextReviewDate) {
      const due = new Date(project.nextReviewDate);
      const diff = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (diff < 0) {
        return `Review overdue by ${Math.abs(diff)} days`;
      }
      return `Next review in ${diff} days`;
    }
    if (project.endDate) {
      const ends = new Date(project.endDate);
      const diff = Math.ceil((ends.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return diff >= 0 ? `${diff} days until project end` : 'Project is past end date';
    }
    return 'No review timeline set';
  });

  indicatorOptions = computed(() => this.indicators());

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {}

  get canManageIndicators() {
    return canManageIndicators(this.auth.user()?.role ?? 'viewer');
  }
  get canLogActivities() {
    return canLogActivities(this.auth.user()?.role ?? 'viewer');
  }
  get canApprove() {
    return canApproveActivities(this.auth.user()?.role ?? 'viewer');
  }

  ngOnInit() {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    this.reload();
  }

  setTab(t: Tab) {
    this.tab.set(t);
    if (t === 'report') {
      this.loadReport();
    }
  }

  reload() {
    this.api.project(this.projectId).subscribe((p) => this.project.set(p));
    this.api.indicators(this.projectId).subscribe((items) => this.indicators.set(items));
    this.api.activities(this.projectId).subscribe((items) => this.activities.set(items));
    this.api.activityTemplates(this.projectId).subscribe((items) => this.activityTemplates.set(items));
    this.api.formTemplates(this.projectId).subscribe((items) => this.formTemplates.set(items));
    this.api.formResponses(this.projectId).subscribe((items) => this.formResponses.set(items));
    this.api.reportingPeriods({ projectId: this.projectId }).subscribe((items) => {
     this.reportingPeriods.set(items.data);
if (!this.selectedReportingPeriodId && items.data.length > 0) {
  this.selectedReportingPeriodId = items.data[0]._id;
        this.loadIndicatorResults();
      }
    });
    this.api.partners().subscribe((items) => this.partners.set(items));
    this.api.beneficiaries().subscribe((items) => this.beneficiaries.set(items));
  }

  loadReport() {
    this.api.donorReport(this.projectId, {
      reportingPeriodId: this.selectedReportingPeriodId || undefined,
      fromDate: this.reportFrom || undefined,
      toDate: this.reportTo || undefined,
    }).subscribe((r) => this.report.set(r as any));
  }

  addIndicator() {
    this.api
      .createIndicator({
        ...this.indicatorForm,
        projectId: this.projectId,
        disaggregation: this.indicatorForm.disaggregationText
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      })
      .subscribe(() => {
        this.indicatorForm = {
          code: '',
          title: '',
          unit: '',
          level: 'output',
          baseline: 0,
          target: 0,
          frequency: 'quarterly',
          meansOfVerification: '',
          assumptions: '',
          disaggregationText: '',
        };
        this.reload();
      });
  }

  addActivity() {
    this.api
      .createActivity({
        projectId: this.projectId,
        title: this.activityForm.title,
        activityDate: this.activityForm.activityDate,
        indicatorId: this.activityForm.indicatorId || undefined,
        partnerId: this.activityForm.partnerId || undefined,
        beneficiaryIds: this.activityForm.beneficiaryIds?.length ? this.activityForm.beneficiaryIds : undefined,
        location: this.activityForm.location || undefined,
        activityType: this.activityForm.activityType || undefined,
        templateId: this.activityForm.templateId || undefined,
        evidenceUrl: this.activityForm.evidenceUrl || undefined,
        evidenceNotes: this.activityForm.evidenceNotes || undefined,
        participants: Number(this.activityForm.participants),
        quantity: Number(this.activityForm.quantity),
        notes: this.activityForm.notes || undefined,
        status: this.activityForm.status,
      })
      .subscribe(() => {
        this.activityForm = {
          title: '',
          activityDate: new Date().toISOString().slice(0, 10),
          indicatorId: '',
          partnerId: '',
          beneficiaryIds: [],
          location: '',
          activityType: '',
          templateId: '',
          evidenceUrl: '',
          evidenceNotes: '',
          participants: 0,
          quantity: 0,
          notes: '',
          status: 'submitted',
        };
        this.reload();
      });
  }

  selectActivityTemplate(templateId: string) {
    this.activityForm.templateId = templateId;
    const template = this.activityTemplates().find((t) => t._id === templateId);
    if (!template) {
      return;
    }
    this.activityForm.title = template.name;
    this.activityForm.indicatorId = template.indicatorId || '';
    this.activityForm.location = template.defaultLocation || '';
    this.activityForm.activityType = template.defaultActivityType || '';
    this.activityForm.evidenceUrl = template.defaultEvidenceUrl || '';
    this.activityForm.participants = template.defaultParticipants;
    this.activityForm.quantity = template.defaultQuantity;
    this.activityForm.notes = template.defaultNotes || '';
    this.activityForm.evidenceNotes = '';
    this.activityForm.partnerId = '';
    this.activityForm.beneficiaryIds = [];
  }

  filteredPartners() {
    const q = this.partnerQuery().toLowerCase().trim();
    if (!q) return this.partners();
    return this.partners().filter((p) => p.name.toLowerCase().includes(q));
  }

  filteredBeneficiaries() {
    const q = this.beneficiaryQuery().toLowerCase().trim();
    if (!q) return this.beneficiaries();
    return this.beneficiaries().filter((b) => b.name.toLowerCase().includes(q));
  }

  selectPartner(id: string) {
    this.activityForm.partnerId = id;
    const partner = this.partners().find((p) => p._id === id);
    if (partner) this.partnerQuery.set(partner.name);
  }

  toggleBeneficiary(id: string) {
    const set = new Set(this.activityForm.beneficiaryIds || []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.activityForm.beneficiaryIds = Array.from(set);
  }

  isBeneficiarySelected(id: string) {
    return (this.activityForm.beneficiaryIds || []).includes(id);
  }

  saveActivityTemplate() {
    const templateName = this.activityForm.activityType || this.activityForm.title || 'Field activity template';
    this.api
      .createActivityTemplate({
        projectId: this.projectId,
        name: templateName,
        description: 'Saved from the current activity form',
        indicatorId: this.activityForm.indicatorId || undefined,
        defaultLocation: this.activityForm.location || undefined,
        defaultActivityType: this.activityForm.activityType || undefined,
        defaultEvidenceUrl: this.activityForm.evidenceUrl || undefined,
        defaultParticipants: Number(this.activityForm.participants),
        defaultQuantity: Number(this.activityForm.quantity),
        defaultNotes: this.activityForm.notes || undefined,
      })
      .subscribe(() => this.reload());
  }

  saveProjectEvaluation() {
    const project = this.project();
    if (!project) return;
    this.api
      .updateProject(this.projectId, {
        evaluationStatus: project.evaluationStatus,
        evaluationSummary: project.evaluationSummary,
        lessonsLearned: project.lessonsLearned,
        nextReviewDate: project.nextReviewDate,
      })
      .subscribe(() => this.reload());
  }

  createReportingPeriod() {
    this.api
      .createReportingPeriod({
        projectId: this.projectId,
        name: this.reportingPeriodForm.name,
        frequency: this.reportingPeriodForm.cadence as any,
        startDate: this.reportingPeriodForm.startDate,
        endDate: this.reportingPeriodForm.endDate,
      })
      .subscribe((period) => {
        this.reportingPeriodForm = {
          name: '',
          cadence: 'quarterly',
          startDate: '',
          endDate: '',
          notes: '',
        };
        this.selectedReportingPeriodId = period._id;
        this.reload();
      });
  }

  loadIndicatorResults() {
    if (!this.selectedReportingPeriodId) {
      this.indicatorResults.set([]);
      return;
    }
    this.api
      .indicatorResults(this.selectedReportingPeriodId)
      .subscribe((results) => this.indicatorResults.set(results));
  }

  calculateReportingResults() {
    if (!this.selectedReportingPeriodId) return;
    this.api
      .calculateReportingResults(this.selectedReportingPeriodId)
      .subscribe((results) => this.indicatorResults.set(results));
  }

  transitionReportingPeriod(status: 'submitted' | 'approved' | 'locked') {
    if (!this.selectedReportingPeriodId) return;
    this.api
      .updateReportingPeriodStatus(this.selectedReportingPeriodId, status)
      .subscribe(() => {
        this.reload();
        this.loadIndicatorResults();
      });
  }

  resultIndicator(result: IndicatorResult): Indicator | null {
    return typeof result.indicatorId === 'string' ? null : result.indicatorId;
  }

  deleteActivityTemplate(id: string) {
    this.api.deleteActivityTemplate(id).subscribe(() => this.reload());
  }

  reviewActivity(id: string, status: 'approved' | 'rejected') {
    this.api.reviewActivity(id, status).subscribe(() => this.reload());
  }

  printReport() {
    window.print();
  }
}