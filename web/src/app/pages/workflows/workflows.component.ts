import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import {
  WorkflowInstance, WorkflowDefinition, WorkflowSummary,
  WorkflowEntityType, WorkflowStepDefinition,
} from '../../core/models';

type Tab = 'tasks' | 'instances' | 'definitions';
type ModalMode = 'none' | 'create-def' | 'edit-def' | 'view-instance' | 'start-workflow' | 'act';

@Component({
  selector: 'app-workflows',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './workflows.component.html',
  styleUrl: './workflows.component.scss',
})
export class WorkflowsComponent implements OnInit {
  // ── State ────────────────────────────────────────────────────────────────

  activeTab = signal<Tab>('tasks');
  loading   = signal(true);
  error     = signal('');
  saving    = signal(false);

  summary     = signal<WorkflowSummary | null>(null);
  myTasks     = signal<WorkflowInstance[]>([]);
  instances   = signal<WorkflowInstance[]>([]);
  definitions = signal<WorkflowDefinition[]>([]);
  members     = signal<Array<{ id: string; userId: string; email: string; name: string; role: string }>>([]);
  availableEntities = signal<Array<{ id: string; name: string }>>([]);
  entitiesLoading   = signal(false);

  // Instance filters
  filterStatus     = '';
  filterEntityType = '';
  instancePage     = 1;
  instanceTotal    = 0;
  readonly pageSize = 20;

  // Def filter
  filterDefEntityType = '';

  // Modal state
  modalMode = signal<ModalMode>('none');
  selectedInstance = signal<WorkflowInstance | null>(null);
  selectedDef      = signal<WorkflowDefinition | null>(null);

  // Create/Edit definition form
  defForm = {
    name: '',
    description: '',
    entityType: 'activity' as WorkflowEntityType,
    isDefault: false,
    isActive: true,
    steps: [] as Array<{
      order: number; name: string; description: string;
      approverRole: string; approverUserId: string;
      escalateAfterHours: number; escalateTo: string;
      requiresComment: boolean; isOptional: boolean;
    }>,
  };

  // Act form
  actForm = {
    action: 'approve' as string,
    comment: '',
    escalateToUserId: '',
  };

  // Start workflow form
  startForm = {
    definitionId: '',
    entityType: 'activity' as WorkflowEntityType,
    entityId: '',
    entityTitle: '',
  };

  readonly entityTypes: WorkflowEntityType[] = [
    'activity', 'report', 'grant', 'budget', 'document', 'beneficiary', 'indicator_result',
  ];

  readonly roleOptions = [
    { value: 'owner',         label: 'Owner' },
    { value: 'admin',         label: 'Admin' },
    { value: 'me_officer',    label: 'M&E Officer' },
    { value: 'finance',       label: 'Finance' },
    { value: 'field_officer', label: 'Field Officer' },
    { value: 'viewer',        label: 'Viewer' },
  ];

  // ── Computed ─────────────────────────────────────────────────────────────

  readonly isAdminOrOwner = computed(() => {
    const r = this.auth.user()?.role;
    return r === 'owner' || r === 'admin';
  });

  readonly canManageDefs = computed(() => {
    const r = this.auth.user()?.role;
    return r === 'owner' || r === 'admin';
  });

  readonly filteredDefinitions = computed(() => {
    const defs = this.definitions();
    if (!this.filterDefEntityType) return defs;
    return defs.filter(d => d.entityType === this.filterDefEntityType);
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {}

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.loading.set(true);
    this.error.set('');

    // Load summary
    this.api.workflowSummary().subscribe({
      next: s => this.summary.set(s),
      error: () => {},
    });

    // Load my tasks
    this.api.myWorkflowTasks().subscribe({
      next: tasks => this.myTasks.set(tasks),
      error: () => {},
    });

    // Load instances
    this.loadInstances();

    // Load definitions
    this.loadDefinitions();

    // Load members
    this.api.members().subscribe({
      next: m => this.members.set(m),
      error: () => {},
    });
  }

  loadInstances() {
    const params: any = { page: this.instancePage, limit: this.pageSize };
    if (this.filterStatus)     params.status = this.filterStatus;
    if (this.filterEntityType) params.entityType = this.filterEntityType;

    this.api.workflowInstances(params).subscribe({
      next: (res: any) => {
        this.instances.set(res.data ?? res);
        this.instanceTotal = res.total ?? (res.data ?? res).length;
        this.loading.set(false);
      },
      error: (err: any) => {
        this.error.set(err?.error?.message ?? 'Failed to load workflow instances');
        this.loading.set(false);
      },
    });
  }

  loadDefinitions() {
    this.api.workflowDefinitions().subscribe({
      next: defs => this.definitions.set(defs),
      error: () => {},
    });
  }

  // ── Tab ───────────────────────────────────────────────────────────────────

  setTab(tab: Tab) {
    this.activeTab.set(tab);
  }

  // ── Definitions CRUD ──────────────────────────────────────────────────────

  openCreateDef() {
    this.defForm = {
      name: '', description: '', entityType: 'activity',
      isDefault: false, isActive: true, steps: [],
    };
    this.addStep();
    this.selectedDef.set(null);
    this.modalMode.set('create-def');
  }

  openEditDef(def: WorkflowDefinition) {
    this.selectedDef.set(def);
    this.defForm = {
      name: def.name,
      description: def.description ?? '',
      entityType: def.entityType,
      isDefault: def.isDefault,
      isActive: def.isActive,
      steps: def.steps.map(s => ({
        order: s.order,
        name: s.name,
        description: s.description ?? '',
        approverRole: s.approverRole,
        approverUserId: s.approverUserId ?? '',
        escalateAfterHours: s.escalateAfterHours,
        escalateTo: s.escalateTo ?? '',
        requiresComment: s.requiresComment,
        isOptional: s.isOptional,
      })),
    };
    this.modalMode.set('edit-def');
  }

  addStep() {
    const order = (this.defForm.steps.length ?? 0) + 1;
    this.defForm.steps.push({
      order, name: '', description: '',
      approverRole: 'admin', approverUserId: '',
      escalateAfterHours: 72, escalateTo: '',
      requiresComment: false, isOptional: false,
    });
  }

  removeStep(i: number) {
    this.defForm.steps.splice(i, 1);
    // Re-number
    this.defForm.steps.forEach((s, idx) => (s.order = idx + 1));
  }

  saveDef() {
    this.saving.set(true);
    const payload = {
      ...this.defForm,
      steps: this.defForm.steps.map(s => ({
        ...s,
        approverUserId: s.approverUserId || undefined,
        escalateTo: s.escalateTo || undefined,
        description: s.description || undefined,
      })),
    };

    const isEdit = this.modalMode() === 'edit-def';
    const obs = isEdit
      ? this.api.updateWorkflowDefinition(this.selectedDef()!._id, payload)
      : this.api.createWorkflowDefinition(payload);

    obs.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.loadDefinitions();
      },
      error: (err: any) => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Failed to save definition');
      },
    });
  }

  deleteDef(def: WorkflowDefinition) {
    if (!confirm(`Delete workflow definition "${def.name}"? This cannot be undone.`)) return;
    this.api.deleteWorkflowDefinition(def._id).subscribe({
      next: () => this.loadDefinitions(),
      error: (err: any) => this.error.set(err?.error?.message ?? 'Cannot delete definition'),
    });
  }

  toggleDefActive(def: WorkflowDefinition) {
    this.api.updateWorkflowDefinition(def._id, { isActive: !def.isActive }).subscribe({
      next: () => this.loadDefinitions(),
      error: (err: any) => this.error.set(err?.error?.message ?? 'Failed to update'),
    });
  }

  // ── Instances ─────────────────────────────────────────────────────────────

  viewInstance(inst: WorkflowInstance) {
    this.selectedInstance.set(inst);
    this.actForm = { action: 'approve', comment: '', escalateToUserId: '' };
    this.modalMode.set('view-instance');
  }

  openStartWorkflow() {
    this.startForm = { definitionId: '', entityType: 'activity', entityId: '', entityTitle: '' };
    this.onEntityTypeChange();
    this.modalMode.set('start-workflow');
  }

  onEntityTypeChange() {
    this.startForm.entityId    = '';
    this.startForm.entityTitle = '';
    this.availableEntities.set([]);
    this.entitiesLoading.set(true);

    const et  = this.startForm.entityType;
    const set = (items: Array<{ id: string; name: string }>) => {
      this.availableEntities.set(items);
      this.entitiesLoading.set(false);
    };
    const fail = () => this.entitiesLoading.set(false);

    if (et === 'activity') {
      this.api.activities({ limit: 200 } as any).subscribe({
        next: (res: any) => { const d = res.data ?? res; set(d.map((a: any) => ({ id: a._id, name: a.title }))); },
        error: fail,
      });
    } else if (et === 'grant') {
      this.api.grants().subscribe({
        next: (res: any) => { const d = res.data ?? res; set(d.map((g: any) => ({ id: g._id, name: g.title ?? g.name }))); },
        error: fail,
      });
    } else if (et === 'report') {
      this.api.reportingPeriods().subscribe({
        next: (res: any) => { const d = res.data ?? res; set(d.map((r: any) => ({ id: r._id, name: r.name }))); },
        error: fail,
      });
    } else if (et === 'budget') {
      this.api.budgetAllocations().subscribe({
        next: (res: any) => { const d = res.data ?? res; set(d.map((b: any) => ({ id: b._id, name: b.name ?? b.title }))); },
        error: fail,
      });
    } else if (et === 'beneficiary') {
      this.api.beneficiaries({ limit: 200 } as any).subscribe({
        next: (res: any) => { const d = res.data ?? res; set(d.map((b: any) => ({ id: b._id, name: b.name ?? b.caseId }))); },
        error: fail,
      });
    } else if (et === 'indicator_result') {
      this.api.indicatorResults().subscribe({
        next: (res: any) => { const d = res.data ?? res; set(d.map((r: any) => ({ id: r._id, name: r.indicatorName ?? r.periodName ?? r._id }))); },
        error: fail,
      });
    } else if (et === 'document') {
      this.api.documents({ limit: 200 } as any).subscribe({
        next: (res: any) => { const d = res.data ?? res; set(d.map((doc: any) => ({ id: doc._id, name: doc.title ?? doc.name ?? doc.fileName }))); },
        error: fail,
      });
    } else {
      this.entitiesLoading.set(false);
    }
  }

  onEntityChange() {
    const selected = this.availableEntities().find(e => e.id === this.startForm.entityId);
    if (selected) {
      this.startForm.entityTitle = selected.name;
    }
  }

  startWorkflow() {
    this.saving.set(true);
    this.api.startWorkflow(this.startForm).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.loadAll();
      },
      error: (err: any) => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Failed to start workflow');
      },
    });
  }

  actOnInstance() {
    const inst = this.selectedInstance();
    if (!inst) return;
    this.saving.set(true);

    const payload: any = { action: this.actForm.action };
    if (this.actForm.comment) payload.comment = this.actForm.comment;
    if (this.actForm.action === 'escalate' && this.actForm.escalateToUserId) {
      payload.escalateToUserId = this.actForm.escalateToUserId;
    }

    this.api.actOnWorkflow(inst._id, payload).subscribe({
      next: (updated: WorkflowInstance) => {
        this.saving.set(false);
        this.selectedInstance.set(updated);
        this.loadAll();
      },
      error: (err: any) => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Action failed');
      },
    });
  }

  // ── Filters / Pagination ──────────────────────────────────────────────────

  applyFilters() {
    this.instancePage = 1;
    this.loadInstances();
  }

  prevPage() {
    if (this.instancePage > 1) { this.instancePage--; this.loadInstances(); }
  }

  nextPage() {
    if (this.instancePage * this.pageSize < this.instanceTotal) {
      this.instancePage++;
      this.loadInstances();
    }
  }

  get totalPages() {
    return Math.max(1, Math.ceil(this.instanceTotal / this.pageSize));
  }

  // ── Modal ─────────────────────────────────────────────────────────────────

  closeModal() {
    this.modalMode.set('none');
    this.selectedInstance.set(null);
    this.selectedDef.set(null);
    this.error.set('');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  statusClass(status: string): string {
    const map: Record<string, string> = {
      pending: 'badge-pending',
      in_review: 'badge-review',
      approved: 'badge-approved',
      rejected: 'badge-rejected',
      escalated: 'badge-escalated',
      cancelled: 'badge-cancelled',
      recalled: 'badge-recalled',
    };
    return map[status] ?? 'badge-muted';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: 'Pending', in_review: 'In Review', approved: 'Approved',
      rejected: 'Rejected', escalated: 'Escalated', cancelled: 'Cancelled', recalled: 'Recalled',
    };
    return map[status] ?? status;
  }

  entityLabel(type: string): string {
    const map: Record<string, string> = {
      activity: 'Activity', report: 'Report', grant: 'Grant',
      budget: 'Budget', document: 'Document', beneficiary: 'Beneficiary',
      indicator_result: 'Indicator Result',
    };
    return map[type] ?? type;
  }

  actionLabel(action: string): string {
    const map: Record<string, string> = {
      approve: '✅ Approved', reject: '❌ Rejected', escalate: '⬆️ Escalated',
      recall: '↩️ Recalled', comment: '💬 Comment',
    };
    return map[action] ?? action;
  }

  isOverdue(inst: WorkflowInstance): boolean {
    if (!inst.stepDeadline) return false;
    return new Date(inst.stepDeadline) < new Date() &&
      ['pending', 'in_review'].includes(inst.status);
  }

  canAct(inst: WorkflowInstance): boolean {
    if (['approved', 'rejected', 'cancelled', 'recalled'].includes(inst.status)) return false;
    const user = this.auth.user();
    if (!user) return false;
    if (user.role === 'owner' || user.role === 'admin') return true;
    const step = inst.steps.find(s => s.order === inst.currentStep);
    if (!step) return false;
    if (step.approverRole === user.role) return true;
    if (step.approverUserId === user.id) return true;
    if (inst.escalatedTo === user.id) return true;
    return false;
  }

  canRecall(inst: WorkflowInstance): boolean {
    return inst.initiatedBy === this.auth.user()?.id &&
      !['approved', 'rejected', 'cancelled', 'recalled'].includes(inst.status);
  }

  currentStepDef(inst: WorkflowInstance): WorkflowStepDefinition | undefined {
    return inst.steps.find(s => s.order === inst.currentStep);
  }

  trackBy(_: number, item: any): string { return item._id; }
}