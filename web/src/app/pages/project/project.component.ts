import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, signal, inject, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { OfflineQueueService, QueuedItem } from '../../core/offline-queue.service';
import { AutosaveService } from '../../shared/autosave.service';
import { BreadcrumbService } from '../../shared/breadcrumb.service';
import {
  Activity,
  ActivityTemplate,
  DonorReport,
  FormResponse,
  FormTemplate,
  Indicator,
  IndicatorAchievement,
  IndicatorResult,
  IndicatorTarget,
  OrgDocument,
  Project,
  ReportingPeriod,
  BudgetAllocation,
  Grant,
  OKR,
} from '../../core/models';
import {
  canApproveActivities,
  canLogActivities,
  canManageIndicators,
} from '../../core/roles';
import { LeafletMapComponent, MapPoint } from '../../shared/map/leaflet-map.component';
import { ConfirmService } from '../../shared/confirm.service';

type Tab = 'framework' | 'indicators' | 'activities' | 'reporting' | 'report' | 'budgets' | 'documents';

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

import { PagerComponent } from '../../shared/pager/pager.component';

@Component({
  selector: 'app-project',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, DatePipe, LeafletMapComponent, PagerComponent],
  templateUrl: './project.component.html',
  styleUrl: './project.component.scss',
})
export class ProjectComponent implements OnInit, OnDestroy {
  private confirmSvc = inject(ConfirmService);
  private api      = inject(ApiService);
  private auth     = inject(AuthService);
  private route    = inject(ActivatedRoute);
  private autosave = inject(AutosaveService);
  private confirm  = inject(ConfirmService);
  private breadcrumb = inject(BreadcrumbService);
  queue = inject(OfflineQueueService);

  readonly hasDraft = signal(false);
  readonly draftAge = signal<string | null>(null);
  readonly savedActivityOfflineFlash = signal(false);
  readonly activityFormError = signal('');
  readonly queuedActivities = signal<QueuedItem[]>([]);
  readonly pendingQueuedActivities = computed(() =>
    this.queuedActivities().filter(q => q.syncStatus !== 'synced'),
  );

  project = signal<Project | null>(null);
  indicators = signal<Indicator[]>([]);
  activities = signal<Activity[]>([]);
  /**
   * Server-computed achievement per indicator, keyed by indicator id.
   *
   * Achievement is never summed from `activities()` on this page: that signal
   * holds one page of activities (the API defaults to 50) and includes drafts
   * and rejected entries, so a client-side sum silently under-reports on any
   * project past its first page and disagrees with the donor report.
   */
  indicatorAchievement = signal<Map<string, IndicatorAchievement>>(new Map());
  showActivityMap = signal(false);
  readonly activityMapPoints = computed<MapPoint[]>(() =>
    this.activities()
      .filter(a => a.geoPoint)
      .map(a => ({
        id: a._id,
        type: 'activity' as const,
        latitude: a.geoPoint!.latitude,
        longitude: a.geoPoint!.longitude,
        title: a.title,
        subtitle: a.activityDate ? new Date(a.activityDate).toLocaleDateString() : undefined,
      })),
  );
  activityTemplates = signal<ActivityTemplate[]>([]);
  formTemplates = signal<FormTemplate[]>([]);
  formResponses = signal<FormResponse[]>([]);
  reportingPeriods = signal<ReportingPeriod[]>([]);
  indicatorResults = signal<IndicatorResult[]>([]);
  indicatorTargets = signal<IndicatorTarget[]>([]);
  partners = signal<Array<{ _id: string; name: string }>>([]);
  beneficiaries = signal<Array<{ _id: string; name: string }>>([]);
  report = signal<DonorReport | null>(null);
  budgetAllocations = signal<BudgetAllocation[]>([]);
  /** What funds this project, and which OKRs it delivers — the links out of the project. */
  linkedGrants = signal<Grant[]>([]);
  linkedOkrs = signal<OKR[]>([]);
  documents = signal<OrgDocument[]>([]);
  tab = signal<Tab>('framework');
  projectId = '';

  readonly indicatorCount = computed(() => this.indicators().length);
  readonly activityCount = computed(() => this.activities().length);

  // The activity log is shown a page at a time; counts above cover all of it.
  readonly activityPageSize = 25;
  readonly activityPage = signal(1);
  readonly currentActivityPage = computed(() => Math.min(this.activityPage(), Math.max(1, Math.ceil(this.activities().length / this.activityPageSize))));
  readonly pagedActivities = computed(() => {
    const start = (this.currentActivityPage() - 1) * this.activityPageSize;
    return this.activities().slice(start, start + this.activityPageSize);
  });
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
    const values = indicators.map(
      (indicator) => this.achievementFor(indicator)?.percentComplete ?? 0,
    );
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
      const achievement = this.achievementFor(indicator);
      const achieved = achievement?.achieved ?? 0;
      const percent = achievement?.percentComplete ?? 0;
      const trend = this.getIndicatorTrend(indicator);
      return {
        ...indicator,
        achieved,
        percentComplete: percent,
        status:
          percent >= 75 ? 'On track' : percent >= 40 ? 'At risk' : 'Behind',
        remaining: achievement?.remaining ?? null,
        variance: achievement?.remaining ?? null,
        isLocked: achievement?.isLocked ?? false,
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
      const achieved = this.achievementFor(indicator)?.achieved ?? 0;
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

  /** Server-computed achievement for one indicator, or undefined before it loads. */
  achievementFor(indicator: Indicator): IndicatorAchievement | undefined {
    return this.indicatorAchievement().get(indicator._id);
  }

  getLastActivityDate(indicator: Indicator): string | undefined {
    // The server figure covers every activity, not just the loaded page.
    const fromServer = this.achievementFor(indicator)?.lastActivityDate;
    if (fromServer) {
      return fromServer;
    }
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
    // Restore autosaved activity draft if one exists
    const draftKey = `activity-form-${this.projectId}`;
    if (this.autosave.hasDraft(draftKey)) {
      const draft = this.autosave.restore<typeof this.activityForm>(draftKey);
      if (draft) {
        this.activityForm = { ...this.activityForm, ...draft.data };
        this.hasDraft.set(true);
        this.draftAge.set(this.autosave.draftAge(draftKey));
      }
    }
    this.reload();
    this.refreshQueuedActivities();
    this.loadLinks();
  }

  async refreshQueuedActivities(): Promise<void> {
    const all = await this.queue.getAllOfType('activity');
    // Scope to this project — the global queue may hold activities queued
    // from other projects (or from /field-collect) too.
    this.queuedActivities.set(all.filter(i => i.payload['projectId'] === this.projectId));
  }

  retryQueuedActivitySync(): void {
    this.queue.syncAll().then(() => {
      this.refreshQueuedActivities();
      this.reload();
    });
  }

  async discardQueuedActivity(clientId: string, label: string): Promise<void> {
    if (!(await this.confirmSvc.ask({ title: `Discard the queued activity "${label}"?`, message: `It has not been saved to the server.`, danger: true, confirmLabel: 'Delete' }))) return;
    await this.queue.remove(clientId);
    await this.refreshQueuedActivities();
  }

  queuedActivityStatusLabel(status: QueuedItem['syncStatus']): string {
    const m: Record<QueuedItem['syncStatus'], string> = {
      pending: 'Waiting to sync', syncing: 'Syncing…', synced: 'Synced', error: 'Sync failed',
    };
    return m[status];
  }

  ngOnDestroy() {
    // Persist any pending activity form changes immediately on leaving
    const draftKey = `activity-form-${this.projectId}`;
    if (this.activityForm.title.trim()) {
      this.autosave.save(draftKey, this.activityForm);
    }
  }

  clearDraft() {
    this.autosave.clear(`activity-form-${this.projectId}`);
    this.hasDraft.set(false);
    this.draftAge.set(null);
  }

  /** Called by the activity form on any field change to schedule autosave */
  onActivityFormChange() {
    if (this.activityForm.title.trim()) {
      this.autosave.schedule(`activity-form-${this.projectId}`, this.activityForm);
    }
  }

  setTab(t: Tab) {
    this.tab.set(t);
    if (t === 'report')     this.loadReport();
    if (t === 'budgets')    this.loadBudgets();
    if (t === 'documents')  this.loadDocuments();
  }

  /**
   * Achievement is computed server-side over every activity, so it is refreshed
   * whenever activity data changes rather than derived from the loaded page.
   */
  loadIndicatorAchievement() {
    this.api.indicatorAchievement(this.projectId).subscribe({
      next: (res) => this.indicatorAchievement.set(
        new Map(res.indicators.map((entry) => [entry.indicatorId, entry])),
      ),
      error: () => this.indicatorAchievement.set(new Map()),
    });
  }

  /** Best-effort: the page is complete without these, so failures are silent. */
  private loadLinks() {
    this.api.grants({ projectId: this.projectId, limit: 20 }).subscribe({ next: (r) => this.linkedGrants.set(r.data), error: () => this.linkedGrants.set([]) });
    this.api.okrs({ projectId: this.projectId }).subscribe({
      next: (okrs) => this.linkedOkrs.set(okrs.filter((o) => o.status === 'active' || o.status === 'draft')),
      error: () => this.linkedOkrs.set([]),
    });
  }

  loadBudgets() {
    this.api.budgetAllocations({ projectId: this.projectId }).subscribe(data => this.budgetAllocations.set(data));
  }

  loadDocuments() {
    this.api.documents({ projectId: this.projectId }).subscribe({
      next: (res: any) => this.documents.set(Array.isArray(res) ? res : (res.data ?? [])),
      error: () => {},
    });
  }

  reload() {
    this.api.project(this.projectId).subscribe((p) => this.project.set(p));
    this.api.indicators(this.projectId).subscribe((res: any) => this.indicators.set(Array.isArray(res) ? res : (res.data ?? [])));
    this.loadIndicatorAchievement();
    this.api.activities(this.projectId).subscribe((res) => this.activities.set(res));
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
    this.api.beneficiaries().subscribe((res: any) => this.beneficiaries.set(Array.isArray(res) ? res : (res.data ?? [])));
  }

  loadReport() {
    this.api.donorReport(this.projectId, {
      reportingPeriodId: this.selectedReportingPeriodId || undefined,
      fromDate: this.reportFrom || undefined,
      toDate: this.reportTo || undefined,
    }).subscribe((r) => this.report.set(r));
  }

  /** The activity types the API accepts; anything else is rejected on save. */
  readonly activityTypes = [
    'training', 'distribution', 'meeting', 'survey', 'assessment', 'construction',
    'repair', 'health_service', 'awareness', 'coordination', 'monitoring', 'community_engagement',
    'capacity_building', 'advocacy', 'research', 'data_collection', 'cash_transfer', 'other',
  ];

  activityTypeLabel(type: string): string {
    const text = type.replace(/_/g, ' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  addIndicator() {
    // disaggregationText is the raw comma-separated input; the API takes the list.
    const { disaggregationText, ...indicator } = this.indicatorForm;
    this.api
      .createIndicator({
        ...indicator,
        projectId: this.projectId,
        disaggregation: disaggregationText
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
    // Inline validation — don't round-trip an obviously incomplete form.
    this.activityFormError.set('');
    if (!this.activityForm.title.trim()) {
      this.activityFormError.set('Give the activity a title before logging it.');
      return;
    }
    if (!this.activityForm.activityDate) {
      this.activityFormError.set('Pick the date the activity took place.');
      return;
    }

    const body = {
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
    };

    const resetForm = () => {
      this.clearDraft();
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
    };

    // Offline-first: queue locally instead of calling the API when there's
    // no connection. The form clears immediately with a "saved on this
    // device" confirmation; the activity appears in the list below once it
    // syncs (see refreshQueuedActivities for how the local queue is shown
    // in the meantime).
    if (!this.queue.isOnline()) {
      this.queue.enqueue('activity', body, body.title || 'Activity').then(() => {
        resetForm();
        this.savedActivityOfflineFlash.set(true);
        setTimeout(() => this.savedActivityOfflineFlash.set(false), 3000);
        this.refreshQueuedActivities();
      });
      return;
    }

    this.api.createActivity(body).subscribe({
      next: () => {
        resetForm();
        this.reload();
      },
      error: (err) => {
        const msg = err?.error?.message;
        this.activityFormError.set(Array.isArray(msg) ? msg.join('. ') : (msg || 'Failed to log activity.'));
      },
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
        cadence: this.reportingPeriodForm.cadence as any,
        startDate: this.reportingPeriodForm.startDate,
        endDate: this.reportingPeriodForm.endDate,
        notes: this.reportingPeriodForm.notes || undefined,
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
      this.indicatorTargets.set([]);
      return;
    }
    this.loadIndicatorTargets();
    this.api
      .indicatorResults(this.selectedReportingPeriodId)
      .subscribe((results) => this.indicatorResults.set(results));
  }

  loadIndicatorTargets() {
    if (!this.selectedReportingPeriodId) {
      this.indicatorTargets.set([]);
      return;
    }
    this.api
      .indicatorTargets(this.selectedReportingPeriodId)
      .subscribe((targets) => this.indicatorTargets.set(targets));
  }

  calculateReportingResults() {
    if (!this.selectedReportingPeriodId) return;
    this.api
      .calculatePeriodResults(this.selectedReportingPeriodId)
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
    if (typeof result.indicatorId !== 'string') {
      return result.indicatorId;
    }
    return this.indicators().find((indicator) => indicator._id === result.indicatorId) ?? null;
  }

  targetForIndicator(indicatorId: string): IndicatorTarget | null {
    return this.indicatorTargets().find((target) => {
      const targetIndicatorId =
        typeof target.indicatorId === 'string' ? target.indicatorId : target.indicatorId._id;
      return targetIndicatorId === indicatorId;
    }) ?? null;
  }

  targetValueForIndicator(indicator: Indicator): number {
    return this.targetForIndicator(indicator._id)?.target ?? indicator.target ?? 0;
  }

  targetValueForResult(result: IndicatorResult): number | null {
    const indicator = this.resultIndicator(result);
    return indicator ? this.targetValueForIndicator(indicator) : null;
  }

  saveIndicatorTarget(indicator: Indicator, value: string | number) {
    if (!this.selectedReportingPeriodId) return;
    const target = Number(value);
    if (!Number.isFinite(target)) return;

    this.api
      .upsertIndicatorTarget({
        reportingPeriodId: this.selectedReportingPeriodId,
        indicatorId: indicator._id,
        baseline: indicator.baseline ?? 0,
        target,
      })
      .subscribe(() => {
        this.loadIndicatorTargets();
        this.loadReport();
      });
  }

  deleteActivityTemplate(id: string) {
    this.api.deleteActivityTemplate(id).subscribe(() => this.reload());
  }

  // A rejection must say why: the person who logged the activity has to know
  // what to fix, and the reason is part of the audit trail.
  rejectingId = signal<string | null>(null);
  rejectReason = '';

  startReject(id: string) {
    this.rejectReason = '';
    this.rejectingId.set(id);
  }

  confirmReject(id: string) {
    const reason = this.rejectReason.trim();
    if (reason.length < 3) return;
    this.api.reviewActivity(id, 'rejected', reason).subscribe({
      next: () => { this.rejectingId.set(null); this.reload(); },
      error: () => undefined, // the interceptor has already shown the message
    });
  }

  reviewActivity(id: string, status: 'approved' | 'rejected') {
    this.api.reviewActivity(id, status).subscribe(() => this.reload());
  }

  printReport() {
    window.print();
  }

  exportDonorReportCsv() {
    this.api
      .donorReportCsv(this.projectId, {
        reportingPeriodId: this.selectedReportingPeriodId || undefined,
        fromDate: this.reportFrom || undefined,
        toDate: this.reportTo || undefined,
      })
      .subscribe((blob) => {
        const projectName = this.project()?.name || 'donor-report';
        const safeName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeName || 'donor-report'}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      });
  }
}