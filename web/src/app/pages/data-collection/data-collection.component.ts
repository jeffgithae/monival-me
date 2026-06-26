import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { OfflineQueueService, QueuedItem } from '../../core/offline-queue.service';
import { canManageDataCollection } from '../../core/roles';
import {
  ExternalIntegration, IntegrationPlatform, FormTemplate,
  FormResponse, SyncResult, IntegrationStats, Project,
} from '../../core/models';

type Tab = 'forms' | 'integrations' | 'responses';
type Modal =
  | 'none'
  | 'create-form'
  | 'edit-form'
  | 'view-form'
  | 'create-integration'
  | 'edit-integration'
  | 'sync-result'
  | 'csv-upload'
  | 'view-response'
  | 'field-map'
  | 'collect-form';

@Component({
  selector: 'app-data-collection',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './data-collection.component.html',
  styleUrl: './data-collection.component.scss',
})
export class DataCollectionComponent implements OnInit {

  // ── Permissions ──────────────────────────────────────────────────────────
  // Mirrors PERMISSIONS.MANAGE_DATA_COLLECTION on the backend — viewers and
  // finance-only users can see synced data but cannot create/edit/delete
  // form templates or integrations, or trigger a sync.
  canManage = computed(() =>
    canManageDataCollection(this.auth.user()?.role ?? 'viewer')
  );

  // ── State ────────────────────────────────────────────────────────────────
  activeTab    = signal<Tab>('forms');
  loading      = signal(true);
  saving       = signal(false);
  syncing      = signal<string | null>(null);
  error        = signal('');
  modalMode    = signal<Modal>('none');

  forms        = signal<FormTemplate[]>([]);
  integrations = signal<ExternalIntegration[]>([]);
  responses    = signal<FormResponse[]>([]);
  projects     = signal<Project[]>([]);
  stats        = signal<IntegrationStats | null>(null);

  selectedForm        = signal<FormTemplate | null>(null);
  selectedIntegration = signal<ExternalIntegration | null>(null);
  selectedResponse    = signal<FormResponse | null>(null);
  lastSyncResult      = signal<SyncResult | null>(null);
  savedResponseOfflineFlash = signal(false);
  queuedResponses     = signal<QueuedItem[]>([]);
  readonly pendingQueuedResponses = computed(() =>
    this.queuedResponses().filter(q => q.syncStatus !== 'synced'),
  );

  // Filters
  filterProject  = '';
  filterPlatform = '';
  filterStatus   = '';
  responseFilter = '';

  // CSV upload
  csvFile: File | null = null;
  csvDelimiter = ',';
  csvIntegrationId = '';

  formResponseDraft: Record<string, any> = {};

  // ── Form builder state ────────────────────────────────────────────────────
  formDraft: {
    name: string; description: string;
    projectId: string; indicatorId: string;
    status: 'draft' | 'active';
    sections: Array<{
      title: string; description: string;
      questions: Array<{
        key: string; label: string; description: string;
        type: string; required: boolean;
        options: string; optionsRaw: string[];
        validation: { min: string; max: string; pattern: string };
      }>;
    }>;
  } = this.blankFormDraft();

  // ── Integration form state ────────────────────────────────────────────────
  intDraft: {
    name: string; description: string;
    projectId: string; templateId: string;
    platform: IntegrationPlatform;
    isActive: boolean;
    syncIntervalMinutes: number | null;
    // KoboToolbox
    koboServer: string; koboToken: string; koboAssetUid: string;
    // ODK Central
    odkServer: string; odkProject: string; odkForm: string; odkEmail: string; odkPassword: string;
    // Ona
    onaServer: string; onaToken: string; onaFormId: string;
    // CommCare
    ccProjectSpace: string; ccApiKey: string; ccFormId: string;
    // Webhook
    webhookUrl: string;
  } = this.blankIntDraft();

  // Field mapping (for the map modal)
  fieldMapIntegration = signal<ExternalIntegration | null>(null);
  fieldMappingDraft: Record<string, string> = {};
  externalFields: string[] = [];

  readonly platforms = [
    { id: 'kobo',     label: 'KoboToolbox',  icon: '🟦', color: '#006FC1' },
    { id: 'odk',      label: 'ODK Central',  icon: '🟩', color: '#4CAF50' },
    { id: 'ona',      label: 'Ona',          icon: '🟧', color: '#FF5722' },
    { id: 'commcare', label: 'CommCare',     icon: '🟪', color: '#7C3AED' },
    { id: 'webhook',  label: 'Webhook',      icon: '🔗', color: '#0EA5E9' },
    { id: 'csv',      label: 'CSV Import',   icon: '📄', color: '#10B981' },
  ] as const;

  readonly questionTypes = [
    'text', 'textarea', 'number', 'select', 'radio', 'checkbox', 'date', 'boolean',
  ];

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly filteredForms = computed(() => {
    let f = this.forms();
    if (this.filterProject) f = f.filter(x => x.projectId === this.filterProject);
    if (this.filterStatus) f = f.filter(x => x.status === this.filterStatus);
    return f;
  });

  readonly filteredIntegrations = computed(() => {
    let i = this.integrations();
    if (this.filterProject)  i = i.filter(x => x.projectId === this.filterProject);
    if (this.filterPlatform) i = i.filter(x => x.platform === this.filterPlatform);
    return i;
  });

  readonly filteredResponses = computed(() => {
    let r = this.responses();
    if (this.filterProject) r = r.filter(x => x.projectId === this.filterProject);
    if (this.responseFilter) {
      const q = this.responseFilter.toLowerCase();
      r = r.filter(x =>
        JSON.stringify(x.answers).toLowerCase().includes(q)
      );
    }
    return r;
  });

  constructor(
    private readonly api: ApiService,
    readonly auth: AuthService,
    readonly queue: OfflineQueueService,
  ) {}

  ngOnInit() {
    this.loadAll();
    this.refreshQueuedResponses();
  }

  async refreshQueuedResponses(): Promise<void> {
    this.queuedResponses.set(await this.queue.getAllOfType('formResponse'));
  }

  retryQueuedResponseSync(): void {
    this.queue.syncAll().then(() => {
      this.refreshQueuedResponses();
      this.loadAll();
    });
  }

  async discardQueuedResponse(clientId: string, label: string): Promise<void> {
    if (!confirm(`Discard the queued response "${label}"? It has not been saved to the server.`)) return;
    await this.queue.remove(clientId);
    await this.refreshQueuedResponses();
  }

  queuedResponseStatusLabel(status: QueuedItem['syncStatus']): string {
    const m: Record<QueuedItem['syncStatus'], string> = {
      pending: 'Waiting to sync', syncing: 'Syncing…', synced: 'Synced', error: 'Sync failed',
    };
    return m[status];
  }

  loadAll() {
    this.loading.set(true);
    this.api.projects().subscribe({
      next: (res: any) => this.projects.set(Array.isArray(res) ? res : (res.data ?? [])),
      error: () => {},
    });
    this.api.formTemplates().subscribe({
      next: (f: FormTemplate[]) => { this.forms.set(f); if (this.activeTab() === 'forms') this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.api.integrations().subscribe({
      next: i => { this.integrations.set(i); if (this.activeTab() === 'integrations') this.loading.set(false); },
      error: () => {},
    });
    this.api.formResponses().subscribe({
      next: (r: FormResponse[]) => { this.responses.set(r); if (this.activeTab() === 'responses') this.loading.set(false); },
      error: () => {},
    });
    this.api.integrationStats().subscribe({
      next: s => this.stats.set(s),
      error: () => {},
    });
  }

  setTab(tab: Tab) {
    this.activeTab.set(tab);
    this.loading.set(false);
  }

  // ── Form CRUD ─────────────────────────────────────────────────────────────
  openCreateForm() {
    this.formDraft = this.blankFormDraft();
    this.addSection();
    this.selectedForm.set(null);
    this.modalMode.set('create-form');
  }

  openEditForm(f: FormTemplate) {
    this.selectedForm.set(f);
    this.formDraft = {
      name: f.name, description: f.description ?? '',
      projectId: f.projectId ?? '', indicatorId: (f as any).indicatorId ?? '',
      status: f.status,
      sections: (f.sections ?? []).map((s: any) => ({
        title: s.title, description: s.description ?? '',
        questions: (s.questions ?? []).map((q: any) => ({
          key: q.key, label: q.label, description: q.description ?? '',
          type: q.type, required: q.required ?? false,
          options: (q.options ?? []).join('\n'),
          optionsRaw: q.options ?? [],
          validation: {
            min: q.validation?.min ?? '',
            max: q.validation?.max ?? '',
            pattern: q.validation?.pattern ?? '',
          },
        })),
      })),
    };
    this.modalMode.set('edit-form');
  }

  openViewForm(f: FormTemplate) {
    this.selectedForm.set(f);
    this.modalMode.set('view-form');
  }

  openCollectForm(f: FormTemplate) {
    this.selectedForm.set(f);
    this.formResponseDraft = {};
    for (const sec of f.sections || []) {
      for (const q of sec.questions || []) {
        if (q.type === 'checkbox') this.formResponseDraft[q.key] = [];
        else if (q.type === 'boolean') this.formResponseDraft[q.key] = null;
        else this.formResponseDraft[q.key] = '';
      }
    }
    this.modalMode.set('collect-form');
  }

  toggleCheckbox(key: string, option: string, checked: boolean) {
    const arr = this.formResponseDraft[key] || [];
    if (checked) {
      if (!arr.includes(option)) arr.push(option);
    } else {
      const idx = arr.indexOf(option);
      if (idx > -1) arr.splice(idx, 1);
    }
    this.formResponseDraft[key] = arr;
  }

  submitResponse() {
    const f = this.selectedForm();
    if (!f) return;

    const payload = {
      projectId: f.projectId,
      templateId: f._id,
      indicatorId: (f as any).indicatorId,
      answers: this.formResponseDraft,
      status: 'submitted',
    };

    // Offline-first: queue locally instead of calling the API when there's
    // no connection. submitFormResponseNew() validates the answers against
    // the live template server-side (project/template/indicator existence,
    // answer shape) — that validation simply runs later, when the queued
    // response actually syncs, rather than at submit time. If the template
    // changed in the meantime, the sync surfaces that as a per-item error
    // the field worker (or an admin) can review, rather than silently
    // corrupting data.
    if (!this.queue.isOnline()) {
      this.saving.set(true);
      this.queue.enqueue('formResponse', payload, f.name || 'Form response').then(() => {
        this.saving.set(false);
        this.closeModal();
        this.savedResponseOfflineFlash.set(true);
        setTimeout(() => this.savedResponseOfflineFlash.set(false), 3000);
        this.refreshQueuedResponses();
      });
      return;
    }

    this.saving.set(true);
    this.api.submitFormResponseNew(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeModal();
        this.loadAll();
      },
      error: (e: any) => {
        this.saving.set(false);
        this.error.set(e?.error?.message ?? 'Failed to submit response');
      }
    });
  }

  addSection() {
    this.formDraft.sections.push({ title: '', description: '', questions: [] });
    this.addQuestion(this.formDraft.sections.length - 1);
  }

  removeSection(i: number) {
    this.formDraft.sections.splice(i, 1);
  }

  addQuestion(si: number) {
    const q = this.formDraft.sections[si].questions;
    q.push({
      key: `q${Date.now()}`, label: '', description: '',
      type: 'text', required: false, options: '', optionsRaw: [],
      validation: { min: '', max: '', pattern: '' },
    });
  }

  removeQuestion(si: number, qi: number) {
    this.formDraft.sections[si].questions.splice(qi, 1);
  }

  saveForm() {
    this.saving.set(true);
    const payload = {
      name: this.formDraft.name,
      description: this.formDraft.description || undefined,
      projectId: this.formDraft.projectId || undefined,
      indicatorId: this.formDraft.indicatorId || undefined,
      status: this.formDraft.status,
      sections: this.formDraft.sections.map(s => ({
        title: s.title,
        description: s.description || undefined,
        questions: s.questions.map(q => ({
          key: q.key,
          label: q.label,
          description: q.description || undefined,
          type: q.type,
          required: q.required,
          options: ['select','radio','checkbox'].includes(q.type)
            ? q.options.split('\n').map(o => o.trim()).filter(Boolean)
            : undefined,
          validation: (q.validation.min || q.validation.max || q.validation.pattern) ? {
            min: q.validation.min ? +q.validation.min : undefined,
            max: q.validation.max ? +q.validation.max : undefined,
            pattern: q.validation.pattern || undefined,
          } : undefined,
        })),
      })),
    };

    const isEdit = this.modalMode() === 'edit-form';
    const obs = isEdit
      ? this.api.updateFormTemplateById(this.selectedForm()!._id, payload)
      : this.api.createFormTemplateNew(payload);

    obs.subscribe({
      next: () => { this.saving.set(false); this.closeModal(); this.loadAll(); },
      error: (e: any) => { this.saving.set(false); this.error.set(e?.error?.message ?? 'Failed to save form'); },
    });
  }

  toggleFormStatus(f: FormTemplate) {
    this.api.updateFormTemplateById(f._id, { status: f.status === 'active' ? 'draft' : 'active' })
      .subscribe({ next: () => this.loadAll(), error: (e: any) => this.error.set(e?.error?.message) });
  }

  deleteForm(f: FormTemplate) {
    if (!confirm(`Delete form "${f.name}"?`)) return;
    this.api.deleteFormTemplateById(f._id).subscribe({
      next: () => this.loadAll(),
      error: (e: any) => this.error.set(e?.error?.message),
    });
  }

  // ── Integration CRUD ──────────────────────────────────────────────────────
  openCreateIntegration() {
    this.intDraft = this.blankIntDraft();
    this.selectedIntegration.set(null);
    this.modalMode.set('create-integration');
  }

  openEditIntegration(i: ExternalIntegration) {
    this.selectedIntegration.set(i);
    this.intDraft = this.blankIntDraft();
    this.intDraft.name        = i.name;
    this.intDraft.description = i.description ?? '';
    this.intDraft.projectId   = i.projectId ?? '';
    this.intDraft.templateId  = i.templateId ?? '';
    this.intDraft.platform    = i.platform;
    this.intDraft.isActive    = i.isActive;
    this.intDraft.syncIntervalMinutes = i.syncIntervalMinutes ?? null;

    const c = i.config;
    this.intDraft.koboServer   = (c['serverUrl'] as string) ?? '';
    this.intDraft.koboToken    = (c['apiToken'] as string) ?? '';
    this.intDraft.koboAssetUid = (c['assetUid'] as string) ?? '';
    this.intDraft.odkServer    = (c['serverUrl'] as string) ?? '';
    this.intDraft.odkProject   = String(c['projectId'] ?? '');
    this.intDraft.odkForm      = (c['formId'] as string) ?? '';
    this.intDraft.odkEmail     = (c['email'] as string) ?? '';
    this.intDraft.odkPassword  = (c['password'] as string) ?? '';
    this.intDraft.onaServer    = (c['serverUrl'] as string) ?? '';
    this.intDraft.onaToken     = (c['apiToken'] as string) ?? '';
    this.intDraft.onaFormId    = String(c['formId'] ?? '');
    this.intDraft.ccProjectSpace = (c['projectSpace'] as string) ?? '';
    this.intDraft.ccApiKey     = (c['apiKey'] as string) ?? '';
    this.intDraft.ccFormId     = (c['formId'] as string) ?? '';
    this.intDraft.webhookUrl   = (c['url'] as string) ?? '';

    this.modalMode.set('edit-integration');
  }

  saveIntegration() {
    this.saving.set(true);
    const config = this.buildConfig();
    const payload: Record<string, unknown> = {
      name: this.intDraft.name,
      description: this.intDraft.description || undefined,
      projectId: this.intDraft.projectId || undefined,
      templateId: this.intDraft.templateId || undefined,
      platform: this.intDraft.platform,
      isActive: this.intDraft.isActive,
      config,
      syncIntervalMinutes: this.intDraft.syncIntervalMinutes || undefined,
    };

    const isEdit = this.modalMode() === 'edit-integration';
    const obs = isEdit
      ? this.api.updateIntegration(this.selectedIntegration()!._id, payload)
      : this.api.createIntegration(payload);

    obs.subscribe({
      next: () => { this.saving.set(false); this.closeModal(); this.loadAll(); },
      error: (e: any) => { this.saving.set(false); this.error.set(e?.error?.message ?? 'Failed to save integration'); },
    });
  }

  deleteIntegration(i: ExternalIntegration) {
    if (!confirm(`Delete integration "${i.name}"?`)) return;
    this.api.deleteIntegration(i._id).subscribe({
      next: () => this.loadAll(),
      error: (e: any) => this.error.set(e?.error?.message),
    });
  }

  toggleIntegration(i: ExternalIntegration) {
    this.api.updateIntegration(i._id, { isActive: !i.isActive }).subscribe({
      next: () => this.loadAll(),
      error: (e: any) => this.error.set(e?.error?.message),
    });
  }

  // ── Sync ─────────────────────────────────────────────────────────────────
  triggerSync(i: ExternalIntegration) {
    this.syncing.set(i._id);
    this.api.syncIntegration(i._id).subscribe({
      next: (result: SyncResult) => {
        this.syncing.set(null);
        this.lastSyncResult.set(result);
        this.modalMode.set('sync-result');
        this.loadAll();
      },
      error: (e: any) => {
        this.syncing.set(null);
        this.error.set(e?.error?.message ?? 'Sync failed');
      },
    });
  }

  openCsvUpload(i: ExternalIntegration) {
    this.selectedIntegration.set(i);
    this.csvIntegrationId = i._id;
    this.csvFile = null;
    this.csvDelimiter = ',';
    this.modalMode.set('csv-upload');
  }

  onCsvFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.csvFile = input.files?.[0] ?? null;
  }

  uploadCsv() {
    if (!this.csvFile) return;
    this.saving.set(true);
    this.api.uploadCsvData(this.csvIntegrationId, this.csvFile, this.csvDelimiter).subscribe({
      next: (result: SyncResult) => {
        this.saving.set(false);
        this.lastSyncResult.set(result);
        this.modalMode.set('sync-result');
        this.loadAll();
      },
      error: (e: any) => { this.saving.set(false); this.error.set(e?.error?.message ?? 'Upload failed'); },
    });
  }

  // ── Field mapping ─────────────────────────────────────────────────────────
  openFieldMap(i: ExternalIntegration) {
    this.fieldMapIntegration.set(i);
    this.fieldMappingDraft = { ...(i.fieldMapping ?? {}) };
    // Collect local form field keys
    const tmpl = this.forms().find(f => f._id === i.templateId);
    this.externalFields = tmpl
      ? tmpl.sections.flatMap((s: any) => (s.questions ?? []).map((q: any) => q.key))
      : [];
    this.modalMode.set('field-map');
  }

  addFieldMapRow() {
    this.fieldMappingDraft[''] = '';
  }

  fieldMapKeys() { return Object.keys(this.fieldMappingDraft); }

  updateMapKey(old: string, newKey: string) {
    const val = this.fieldMappingDraft[old];
    delete this.fieldMappingDraft[old];
    this.fieldMappingDraft[newKey] = val;
  }

  updateMapVal(key: string, val: string) {
    this.fieldMappingDraft[key] = val;
  }

  removeMapRow(key: string) {
    delete this.fieldMappingDraft[key];
  }

  saveFieldMap() {
    const i = this.fieldMapIntegration();
    if (!i) return;
    this.saving.set(true);
    this.api.updateIntegration(i._id, { fieldMapping: this.fieldMappingDraft }).subscribe({
      next: () => { this.saving.set(false); this.closeModal(); this.loadAll(); },
      error: (e: any) => { this.saving.set(false); this.error.set(e?.error?.message); },
    });
  }

  // ── Responses ─────────────────────────────────────────────────────────────
  viewResponse(r: FormResponse) {
    this.selectedResponse.set(r);
    this.modalMode.set('view-response');
  }

  responseKeys(r: FormResponse): string[] {
    return Object.keys(r.answers ?? {}).filter(k => !k.startsWith('__'));
  }

  exportResponsesCsv() {
    const rows = this.filteredResponses();
    if (!rows.length) return;
    const allKeys = [...new Set(rows.flatMap(r => this.responseKeys(r)))];
    const header = ['collected_at', 'status', ...allKeys].join(',');
    const lines = rows.map(r =>
      [r.collectedAt, r.status, ...allKeys.map(k => JSON.stringify(r.answers[k] ?? ''))].join(',')
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'responses.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  closeModal() {
    this.modalMode.set('none');
    this.selectedForm.set(null);
    this.selectedIntegration.set(null);
    this.selectedResponse.set(null);
    this.error.set('');
  }

  platformMeta(p: string) {
    return this.platforms.find(x => x.id === p) ?? { id: p, label: p, icon: '🔌', color: '#64748b' };
  }

  syncStatusClass(s: string) {
    return { success: 'status-ok', error: 'status-err', syncing: 'status-sync', idle: 'status-idle', disabled: 'status-idle' }[s] ?? 'status-idle';
  }

  syncStatusLabel(s: string) {
    return { success: 'Connected', error: 'Error', syncing: 'Syncing…', idle: 'Idle', disabled: 'Disabled' }[s] ?? s;
  }

  projectName(id?: string) {
    if (!id) return '—';
    return this.projects().find(p => p._id === id)?.name ?? id;
  }

  formName(id?: string) {
    if (!id) return '—';
    return this.forms().find(f => f._id === id)?.name ?? id;
  }

  countQuestions(f: FormTemplate) {
    return (f.sections ?? []).reduce((s: number, sec: any) => s + (sec.questions?.length ?? 0), 0);
  }

  needsOptions(type: string) { return ['select','radio','checkbox'].includes(type); }
  needsValidation(type: string) { return ['number','text','textarea'].includes(type); }

  private buildConfig(): Record<string, unknown> {
    switch (this.intDraft.platform) {
      case 'kobo':
        return { serverUrl: this.intDraft.koboServer, apiToken: this.intDraft.koboToken, assetUid: this.intDraft.koboAssetUid };
      case 'odk':
        return { serverUrl: this.intDraft.odkServer, projectId: this.intDraft.odkProject, formId: this.intDraft.odkForm, email: this.intDraft.odkEmail, password: this.intDraft.odkPassword };
      case 'ona':
        return { serverUrl: this.intDraft.onaServer, apiToken: this.intDraft.onaToken, formId: this.intDraft.onaFormId };
      case 'commcare':
        return { projectSpace: this.intDraft.ccProjectSpace, apiKey: this.intDraft.ccApiKey, formId: this.intDraft.ccFormId || undefined };
      case 'webhook':
        return { url: this.intDraft.webhookUrl };
      case 'csv':
        return {};
      default:
        return {};
    }
  }

  private blankFormDraft() {
    return { name: '', description: '', projectId: '', indicatorId: '', status: 'draft' as 'draft', sections: [] as any[] };
  }

  private blankIntDraft() {
    return {
      name: '', description: '', projectId: '', templateId: '',
      platform: 'kobo' as IntegrationPlatform, isActive: true, syncIntervalMinutes: null,
      koboServer: 'https://kf.kobotoolbox.org', koboToken: '', koboAssetUid: '',
      odkServer: '', odkProject: '', odkForm: '', odkEmail: '', odkPassword: '',
      onaServer: 'https://api.ona.io', onaToken: '', onaFormId: '',
      ccProjectSpace: '', ccApiKey: '', ccFormId: '',
      webhookUrl: '',
    };
  }
}