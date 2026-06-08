import {
  ChangeDetectionStrategy, Component, OnInit,
  computed, inject, signal,
} from '@angular/core';
import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import {
  Beneficiary, BeneficiaryStatistics, BeneficiaryStatus,
  BeneficiaryRegistrationType, Project, CreateBeneficiaryDto,
  ProgramEnrollment, ServiceRecord,
} from '../../core/models';

type DetailTab = 'profile' | 'household' | 'enrollment' | 'services';
type ViewMode  = 'list' | 'card';
type FormStep  = 1 | 2 | 3;

const VULNERABILITY_LABELS: Record<string, string> = {
  isIdp:                  'IDP',
  isRefugee:              'Refugee',
  hasDisability:          'Disability',
  isFemaleHeadedHousehold:'Female HH',
  isOrphan:               'Orphan',
  isChronicallyIll:       'Chronically ill',
  isElderly:              'Elderly',
};

const AGE_GROUP_LABELS: Record<string, string> = {
  child_under5:   'Under 5',
  child_5_17:     '5–17',
  youth_18_24:    '18–24',
  adult_25_59:    '25–59',
  elderly_60plus: '60+',
};

@Component({
  selector: 'app-beneficiaries',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, DatePipe, TitleCasePipe],
  templateUrl: './beneficiaries.component.html',
  styleUrls: ['./beneficiaries.component.scss'],
})
export class BeneficiariesComponent implements OnInit {
  private api  = inject(ApiService);
  private auth = inject(AuthService);
  private fb   = inject(FormBuilder);

  // ── Data ──────────────────────────────────────────────────────────────────
  beneficiaries = signal<Beneficiary[]>([]);
  stats         = signal<BeneficiaryStatistics | null>(null);
  projects      = signal<Project[]>([]);
  selected      = signal<Beneficiary | null>(null);
  total         = signal(0);
  pages         = signal(1);
  currentPage   = signal(1);

  // ── UI state ──────────────────────────────────────────────────────────────
  loading         = signal(true);
  saving          = signal(false);
  deleting        = signal(false);
  error           = signal('');
  showForm        = signal(false);
  showEditForm    = signal(false);
  showEnrollForm  = signal(false);
  showServiceForm = signal(false);
  detailTab       = signal<DetailTab>('profile');
  viewMode        = signal<ViewMode>('list');
  formStep        = signal<FormStep>(1);

  // ── Filters ───────────────────────────────────────────────────────────────
  search         = signal('');
  statusFilter   = signal<BeneficiaryStatus | 'all'>('all');
  typeFilter     = signal<BeneficiaryRegistrationType | 'all'>('all');
  sexFilter      = signal('');
  ageGroupFilter = signal('');
  projectFilter  = signal('');
  vulnFilter     = signal('');

  // ── Permissions ───────────────────────────────────────────────────────────
  canManage = computed(() =>
    this.auth.isOwner() || this.auth.isAdmin() || this.auth.isFinance()
  );

  // ── Computed stats ────────────────────────────────────────────────────────
  activeBenef = computed(() => this.stats()?.byStatus?.['active'] ?? 0);
  consentPct  = computed(() => {
    const s = this.stats();
    if (!s || !s.total) return 0;
    return Math.round((s.vulnerable.consentGiven / s.total) * 100);
  });

  vulnFlags = computed(() => {
    const s = this.stats();
    if (!s) return [];
    return Object.entries(VULNERABILITY_LABELS)
      .map(([key, label]) => ({
        key,
        label,
        count: (s.vulnerable as Record<string, number>)[key] ?? 0,
      }))
      .filter(v => v.count > 0);
  });

  // ── Static lookups ────────────────────────────────────────────────────────
  readonly statusOptions:  Array<BeneficiaryStatus | 'all'> =
    ['all', 'active', 'inactive', 'closed', 'transferred', 'deceased'];
  readonly typeOptions: Array<BeneficiaryRegistrationType | 'all'> =
    ['all', 'individual', 'household', 'group', 'community'];
  readonly sexOptions      = ['male', 'female', 'other', 'prefer_not_to_say'];
  readonly ageGroupOptions = Object.entries(AGE_GROUP_LABELS);
  readonly serviceTypes    = [
    'cash_transfer', 'food_assistance', 'health_service', 'shelter',
    'protection', 'education', 'wash', 'psychosocial', 'nfi_distribution',
    'livelihood', 'legal_assistance', 'other',
  ];
  readonly settleTypes   = ['urban', 'peri-urban', 'rural', 'camp', 'collective_center', 'host_community'];
  readonly consentMethods = ['written', 'verbal', 'digital'];
  readonly educationLevels = ['none', 'primary', 'secondary', 'tertiary', 'vocational'];
  readonly VULN_LABELS = VULNERABILITY_LABELS;
  readonly AGE_LABELS  = AGE_GROUP_LABELS;

  // ── Forms ─────────────────────────────────────────────────────────────────
  form = this.fb.group({
    registrationType:         ['individual'],
    name:                     ['', [Validators.required, Validators.minLength(2)]],
    caseId:                   [''],
    nationalId:               [''],
    phoneNumber:              [''],
    sex:                      [''],
    dateOfBirth:              [''],
    age:                      [null as number | null],
    ageGroup:                 [''],
    nationality:              [''],
    primaryLanguage:          [''],
    education:                [''],
    householdSize:            [1, [Validators.min(1)]],
    childrenUnder5:           [null as number | null],
    childrenUnder18:          [null as number | null],
    hasDisability:            [false],
    disabilityType:           [''],
    isIdp:                    [false],
    isRefugee:                [false],
    isFemaleHeadedHousehold:  [false],
    isOrphan:                 [false],
    isChronicallyIll:         [false],
    isElderly:                [false],
    vulnerabilityScore:       [null as number | null],
    country:                  [''],
    region:                   [''],
    district:                 [''],
    village:                  [''],
    location:                 [''],
    settlementType:           [''],
    status:                   ['active'],
    caseWorker:               [''],
    consentGiven:             [false],
    consentMethod:            ['verbal'],
    consentDate:              [''],
    registrationDate:         [''],
    notes:                    [''],
    tags:                     [''],
  });

  enrollForm = this.fb.group({
    projectId:  ['', Validators.required],
    enrolledAt: [new Date().toISOString().slice(0, 10)],
    notes:      [''],
  });

  serviceForm = this.fb.group({
    serviceType:  ['', Validators.required],
    serviceDate:  [new Date().toISOString().slice(0, 10), Validators.required],
    projectId:    [''],
    description:  [''],
    quantity:     [null as number | null],
    unit:         [''],
  });

  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.load();
    this.api.projects().subscribe({
      next: (r: { data: Project[]; total: number } | Project[]) => {
        this.projects.set(Array.isArray(r) ? r : (r as { data: Project[] })?.data ?? []);
      },
      error: () => {},
    });
  }

  load(): void {
    this.loading.set(true);
    const q: Record<string, string | number | boolean> = {
      page: this.currentPage(),
      limit: 50,
    };
    if (this.search())              q['search']           = this.search();
    if (this.statusFilter() !== 'all') q['status']        = this.statusFilter();
    if (this.typeFilter()   !== 'all') q['registrationType'] = this.typeFilter();
    if (this.sexFilter())           q['sex']              = this.sexFilter();
    if (this.ageGroupFilter())      q['ageGroup']         = this.ageGroupFilter();
    if (this.projectFilter())       q['projectId']        = this.projectFilter();
    if (this.vulnFilter())          q[this.vulnFilter()]  = 'true';

    this.api.beneficiaries(q as Parameters<ApiService['beneficiaries']>[0]).subscribe({
      next: (res: { data: Beneficiary[]; total: number; page: number; limit: number; pages: number }) => {
        this.beneficiaries.set(res.data ?? []);
        this.total.set(res.total);
        this.pages.set(res.pages ?? 1);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.error.set(err?.error?.message ?? 'Failed to load');
        this.loading.set(false);
      },
    });

    this.api.beneficiaryStats(this.projectFilter() || undefined).subscribe({
      next: (s: BeneficiaryStatistics) => this.stats.set(s),
      error: () => {},
    });
  }

  applyFilters(): void { this.currentPage.set(1); this.selected.set(null); this.load(); }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
    this.typeFilter.set('all');
    this.sexFilter.set('');
    this.ageGroupFilter.set('');
    this.projectFilter.set('');
    this.vulnFilter.set('');
    this.applyFilters();
  }

  hasFilters(): boolean {
    return !!(
      this.search() || this.statusFilter() !== 'all' || this.typeFilter() !== 'all' ||
      this.sexFilter() || this.ageGroupFilter() || this.projectFilter() || this.vulnFilter()
    );
  }

  nextPage(): void {
    if (this.currentPage() < this.pages()) {
      this.currentPage.update((p: number) => p + 1);
      this.load();
    }
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update((p: number) => p - 1);
      this.load();
    }
  }

  // ─── Selection ─────────────────────────────────────────────────────────────
  select(b: Beneficiary): void {
    if (this.selected()?._id === b._id) { this.selected.set(null); return; }
    this.selected.set(b);
    this.detailTab.set('profile');
    this.showEditForm.set(false);
    this.showEnrollForm.set(false);
    this.showServiceForm.set(false);
    this.error.set('');
  }

  deselect(): void {
    this.selected.set(null);
    this.showEditForm.set(false);
  }

  // ─── Create ────────────────────────────────────────────────────────────────
  nextStep(): void {
    if (this.formStep() < 3) this.formStep.update((s: FormStep) => (s + 1) as FormStep);
  }

  prevStep(): void {
    if (this.formStep() > 1) this.formStep.update((s: FormStep) => (s - 1) as FormStep);
  }

  submitCreate(): void {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set('');
    const v = this.form.value;

    const body: CreateBeneficiaryDto = {
      registrationType:        (v.registrationType ?? 'individual') as BeneficiaryRegistrationType,
      name:                    v.name ?? '',
      caseId:                  v.caseId || undefined,
      nationalId:              v.nationalId || undefined,
      phoneNumber:             v.phoneNumber || undefined,
      sex:                     v.sex || undefined,
      dateOfBirth:             v.dateOfBirth || undefined,
      age:                     v.age ?? undefined,
      ageGroup:                v.ageGroup || undefined,
      nationality:             v.nationality || undefined,
      primaryLanguage:         v.primaryLanguage || undefined,
      education:               v.education || undefined,
      householdSize:           Number(v.householdSize) || 1,
      childrenUnder5:          v.childrenUnder5 ?? undefined,
      childrenUnder18:         v.childrenUnder18 ?? undefined,
      hasDisability:           v.hasDisability ?? false,
      disabilityType:          v.disabilityType || undefined,
      isIdp:                   v.isIdp ?? false,
      isRefugee:               v.isRefugee ?? false,
      isFemaleHeadedHousehold: v.isFemaleHeadedHousehold ?? false,
      isOrphan:                v.isOrphan ?? false,
      isChronicallyIll:        v.isChronicallyIll ?? false,
      isElderly:               v.isElderly ?? false,
      vulnerabilityScore:      v.vulnerabilityScore ?? undefined,
      country:                 v.country || undefined,
      region:                  v.region || undefined,
      district:                v.district || undefined,
      village:                 v.village || undefined,
      location:                v.location || undefined,
      settlementType:          v.settlementType || undefined,
      status:                  (v.status ?? 'active') as BeneficiaryStatus,
      caseWorker:              v.caseWorker || undefined,
      consentGiven:            v.consentGiven ?? false,
      consentMethod:           v.consentMethod || 'verbal',
      consentDate:             v.consentDate || undefined,
      registrationDate:        v.registrationDate || new Date().toISOString().slice(0, 10),
      notes:                   v.notes || undefined,
      tags:                    v.tags
        ? (v.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean)
        : [],
    };

    this.api.createBeneficiary(body).subscribe({
      next: (created: Beneficiary) => {
        this.saving.set(false);
        this.showForm.set(false);
        this.formStep.set(1);
        this.form.reset({
          registrationType: 'individual', status: 'active',
          consentMethod: 'verbal', householdSize: 1,
        });
        this.load();
        this.select(created);
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Create failed');
      },
    });
  }

  // ─── Edit ──────────────────────────────────────────────────────────────────
  openEdit(): void {
    const b = this.selected();
    if (!b) return;
    this.form.patchValue({
      registrationType:        b.registrationType,
      name:                    b.name,
      caseId:                  b.caseId ?? '',
      nationalId:              b.nationalId ?? '',
      phoneNumber:             b.phoneNumber ?? '',
      sex:                     b.sex ?? '',
      dateOfBirth:             b.dateOfBirth?.slice(0, 10) ?? '',
      age:                     b.age ?? null,
      ageGroup:                b.ageGroup ?? '',
      nationality:             b.nationality ?? '',
      primaryLanguage:         b.primaryLanguage ?? '',
      education:               b.education ?? '',
      householdSize:           b.householdSize,
      childrenUnder5:          b.childrenUnder5 ?? null,
      childrenUnder18:         b.childrenUnder18 ?? null,
      hasDisability:           b.hasDisability,
      disabilityType:          b.disabilityType ?? '',
      isIdp:                   b.isIdp,
      isRefugee:               b.isRefugee,
      isFemaleHeadedHousehold: b.isFemaleHeadedHousehold,
      isOrphan:                b.isOrphan,
      isChronicallyIll:        b.isChronicallyIll,
      isElderly:               b.isElderly,
      vulnerabilityScore:      b.vulnerabilityScore ?? null,
      country:                 b.country ?? '',
      region:                  b.region ?? '',
      district:                b.district ?? '',
      village:                 b.village ?? '',
      location:                b.location ?? '',
      settlementType:          b.settlementType ?? '',
      status:                  b.status,
      caseWorker:              b.caseWorker ?? '',
      consentGiven:            b.consentGiven,
      consentMethod:           b.consentMethod ?? 'verbal',
      consentDate:             b.consentDate?.slice(0, 10) ?? '',
      notes:                   b.notes ?? '',
      tags:                    (b.tags ?? []).join(', '),
    });
    this.showEditForm.set(true);
    this.showForm.set(false);
    this.formStep.set(1);
  }

  submitEdit(): void {
    const id = this.selected()?._id;
    if (!id || this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.value;

    this.api.updateBeneficiary(id, {
      name:                    v.name ?? undefined,
      caseId:                  v.caseId || undefined,
      phoneNumber:             v.phoneNumber || undefined,
      sex:                     v.sex || undefined,
      dateOfBirth:             v.dateOfBirth || undefined,
      age:                     v.age ?? undefined,
      ageGroup:                v.ageGroup || undefined,
      nationality:             v.nationality || undefined,
      householdSize:           Number(v.householdSize) || 1,
      hasDisability:           v.hasDisability ?? false,
      disabilityType:          v.disabilityType || undefined,
      isIdp:                   v.isIdp ?? false,
      isRefugee:               v.isRefugee ?? false,
      isFemaleHeadedHousehold: v.isFemaleHeadedHousehold ?? false,
      vulnerabilityScore:      v.vulnerabilityScore ?? undefined,
      country:                 v.country || undefined,
      region:                  v.region || undefined,
      district:                v.district || undefined,
      village:                 v.village || undefined,
      location:                v.location || undefined,
      settlementType:          v.settlementType || undefined,
      status:                  (v.status ?? 'active') as BeneficiaryStatus,
      caseWorker:              v.caseWorker || undefined,
      consentGiven:            v.consentGiven ?? false,
      consentDate:             v.consentDate || undefined,
      notes:                   v.notes || undefined,
      tags:                    v.tags
        ? (v.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean)
        : [],
    }).subscribe({
      next: (updated: Beneficiary) => {
        this.saving.set(false);
        this.showEditForm.set(false);
        this.selected.set(updated);
        this.beneficiaries.update((list: Beneficiary[]) =>
          list.map((b: Beneficiary) => b._id === updated._id ? updated : b)
        );
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Update failed');
      },
    });
  }

  // ─── Delete ────────────────────────────────────────────────────────────────
  confirmDelete(): void {
    const b = this.selected();
    if (!b || !confirm(`Permanently delete "${b.name}"? This removes all their records.`)) return;
    this.deleting.set(true);
    this.api.deleteBeneficiary(b._id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deselect();
        this.load();
      },
      error: (err: { error?: { message?: string } }) => {
        this.deleting.set(false);
        this.error.set(err?.error?.message ?? 'Delete failed');
      },
    });
  }

  // ─── Enrollment ────────────────────────────────────────────────────────────
  submitEnroll(): void {
    const id = this.selected()?._id;
    if (!id || this.enrollForm.invalid) return;
    this.saving.set(true);
    const v = this.enrollForm.value;
    this.api.enrollBeneficiary(id, {
      projectId:  v.projectId ?? '',
      enrolledAt: v.enrolledAt || undefined,
      notes:      v.notes || undefined,
    }).subscribe({
      next: (updated: Beneficiary) => {
        this.saving.set(false);
        this.showEnrollForm.set(false);
        this.selected.set(updated);
        this.enrollForm.reset({ enrolledAt: new Date().toISOString().slice(0, 10) });
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Enroll failed');
      },
    });
  }

  exitProgram(enrollment: ProgramEnrollment): void {
    const id = this.selected()?._id;
    const projectId = typeof enrollment.projectId === 'object'
      ? (enrollment.projectId as { _id: string; name: string })._id
      : enrollment.projectId as string;
    if (!id || !projectId) return;
    const reason = (prompt('Exit reason (optional):') ?? undefined) as string | undefined;
    this.api.exitBeneficiaryProgram(id, projectId, reason).subscribe({
      next: (updated: Beneficiary) => {
        this.selected.set(updated);
        this.beneficiaries.update((list: Beneficiary[]) =>
          list.map((b: Beneficiary) => b._id === updated._id ? updated : b)
        );
      },
      error: (err: { error?: { message?: string } }) => this.error.set(err?.error?.message ?? 'Exit failed'),
    });
  }

  // ─── Service record ────────────────────────────────────────────────────────
  submitService(): void {
    const id = this.selected()?._id;
    if (!id || this.serviceForm.invalid) return;
    this.saving.set(true);
    const v = this.serviceForm.value;
    this.api.addBeneficiaryServiceRecord(id, {
      serviceType: v.serviceType ?? '',
      serviceDate: v.serviceDate ?? '',
      projectId:   v.projectId || undefined,
      description: v.description || undefined,
      quantity:    v.quantity ?? undefined,
      unit:        v.unit || undefined,
    }).subscribe({
      next: (updated: Beneficiary) => {
        this.saving.set(false);
        this.showServiceForm.set(false);
        this.selected.set(updated);
        this.serviceForm.reset({ serviceDate: new Date().toISOString().slice(0, 10) });
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Failed');
      },
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  avatarClass(b: Beneficiary): string {
    if (b.registrationType === 'household') return 'household';
    if (b.registrationType === 'group' || b.registrationType === 'community') return 'group';
    if (b.sex === 'female') return 'female';
    return '';
  }

  avatarLetter(b: Beneficiary): string {
    return b.name.charAt(0).toUpperCase();
  }

  ageLabel(b: Beneficiary): string {
    if (b.dateOfBirth) {
      const yrs = Math.floor((Date.now() - new Date(b.dateOfBirth).getTime()) / 31557600000);
      return `${yrs}y`;
    }
    if (b.age) return `${b.age}y`;
    if (b.ageGroup) return this.AGE_LABELS[b.ageGroup] ?? b.ageGroup;
    return '';
  }

  vulnFlagsFor(b: Beneficiary): Array<{ label: string; cls: string }> {
    const flags: Array<{ label: string; cls: string }> = [];
    if (b.isIdp)                   flags.push({ label: 'IDP',        cls: 'idp' });
    if (b.isRefugee)               flags.push({ label: 'Refugee',    cls: 'refugee' });
    if (b.hasDisability)           flags.push({ label: 'Disability', cls: 'disabled' });
    if (b.isFemaleHeadedHousehold) flags.push({ label: 'Female HH',  cls: 'female-hh' });
    if (b.isOrphan)                flags.push({ label: 'Orphan',     cls: '' });
    if (b.isChronicallyIll)        flags.push({ label: 'Ill',        cls: '' });
    if (b.isElderly)               flags.push({ label: 'Elderly',    cls: '' });
    return flags;
  }

  projectLabel(projectId: string | { _id: string; name: string }): string {
    if (typeof projectId === 'object') return (projectId as { _id: string; name: string }).name;
    return this.projects().find((p: Project) => p._id === projectId)?.name ?? (projectId as string);
  }

  activeEnrollments(b: Beneficiary): ProgramEnrollment[] {
    return (b.programEnrollments ?? []).filter((e: ProgramEnrollment) => e.status === 'active');
  }

  vulnScoreClass(score?: number): 'low' | 'medium' | 'high' {
    if (!score) return 'low';
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  statsCount(type: string): number {
    return this.stats()?.byStatus?.[type] ?? 0;
  }

  skeletons(): number[] { return Array(8).fill(0); }
  
}