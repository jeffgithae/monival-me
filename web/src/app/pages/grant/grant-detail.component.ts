import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from '../../core/api.service';
import { Grant, GrantAwardTree, GrantFinancialRollup } from '../../core/models';

type Tab = 'overview' | 'disbursements' | 'reporting' | 'budget' | 'amendments' | 'subawards';

@Component({
  selector: 'app-grant-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, DecimalPipe, DatePipe],
  templateUrl: './grant-detail.component.html',
  styleUrl: './grant-detail.component.scss',
})
export class GrantDetailComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  grant = signal<Grant | null>(null);
  financials = signal<GrantFinancialRollup | null>(null);
  awardTree = signal<GrantAwardTree | null>(null);
  loading = signal(true);
  error = signal('');
  saving = signal(false);
  tab = signal<Tab>('overview');

  // ─── Inline forms ───────────────────────────────────────────────────────────
  newDisbursement = { plannedDate: '', amount: null as number | null, reference: '', status: 'scheduled' };
  newObligation = { dueDate: '', type: 'narrative', notes: '' };
  newAmendment = {
    effectiveDate: '', type: 'no_cost_extension', reason: '',
    newEndDate: '', newAmount: null as number | null, donorReference: '',
  };

  private id = '';

  // ─── Derived ────────────────────────────────────────────────────────────────
  utilisation = computed(() => this.grant()?.burnRatePct ?? 0);
  isSubAward = computed(() => !!this.grant()?.parentGrantId);
  donorName = computed(() => {
    const d = this.grant()?.donorId;
    return typeof d === 'object' && d ? d.name : '';
  });
  /** Rate is stale or missing — the base-currency figure can't be trusted. */
  fxUnavailable = computed(() => this.grant()?.exchangeRateSource === 'unavailable');
  showsBaseCurrency = computed(() => {
    const g = this.grant();
    return !!g && !!g.baseCurrency && g.baseCurrency !== g.currency;
  });

  openObligations = computed(() =>
    (this.grant()?.reportingSchedule ?? []).filter(o => o.status === 'pending' || o.status === 'overdue'),
  );
  overdueObligations = computed(() => this.openObligations().filter(o => o.status === 'overdue'));

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    this.load();
  }

  private load() {
    this.loading.set(true);
    forkJoin({
      grant: this.api.grant(this.id),
      financials: this.api.grantFinancials(this.id).pipe(catchError(() => of(null))),
      // Only prime awards have a tree; a sub-award returns 400.
      tree: this.api.grantAwardTree(this.id).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ grant, financials, tree }) => {
        this.grant.set(grant);
        this.financials.set(financials);
        this.awardTree.set(tree);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.error?.message || 'Failed to load grant');
        this.loading.set(false);
      },
    });
  }

  setTab(t: Tab) { this.tab.set(t); }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  private apply(res: any) {
    this.grant.set(res);
    this.saving.set(false);
    // Disbursement/obligation changes move the financial position too.
    this.api.grantFinancials(this.id).pipe(catchError(() => of(null)))
      .subscribe(f => this.financials.set(f));
  }

  private fail = (err: any) => {
    this.error.set(err.error?.message || 'Action failed');
    this.saving.set(false);
  };

  addDisbursement() {
    if (!this.newDisbursement.plannedDate || !this.newDisbursement.amount) return;
    this.saving.set(true);
    this.api.addGrantDisbursement(this.id, { ...this.newDisbursement } as any).subscribe({
      next: g => {
        this.apply(g);
        this.newDisbursement = { plannedDate: '', amount: null, reference: '', status: 'scheduled' };
      },
      error: this.fail,
    });
  }

  markReceived(disbursementId: string) {
    this.saving.set(true);
    this.api.updateGrantDisbursement(this.id, disbursementId, { status: 'received' })
      .subscribe({ next: g => this.apply(g), error: this.fail });
  }

  removeDisbursement(disbursementId: string) {
    this.saving.set(true);
    this.api.removeGrantDisbursement(this.id, disbursementId)
      .subscribe({ next: g => this.apply(g), error: this.fail });
  }

  addObligation() {
    if (!this.newObligation.dueDate) return;
    this.saving.set(true);
    this.api.addGrantObligation(this.id, { ...this.newObligation } as any).subscribe({
      next: g => {
        this.apply(g);
        this.newObligation = { dueDate: '', type: 'narrative', notes: '' };
      },
      error: this.fail,
    });
  }

  markSubmitted(obligationId: string) {
    this.saving.set(true);
    this.api.updateGrantObligation(this.id, obligationId, { status: 'submitted' })
      .subscribe({ next: g => this.apply(g), error: this.fail });
  }

  removeObligation(obligationId: string) {
    this.saving.set(true);
    this.api.removeGrantObligation(this.id, obligationId)
      .subscribe({ next: g => this.apply(g), error: this.fail });
  }

  recordAmendment() {
    const a = this.newAmendment;
    if (!a.effectiveDate || !a.reason) return;
    this.saving.set(true);
    const body: any = {
      effectiveDate: a.effectiveDate, type: a.type, reason: a.reason,
      donorReference: a.donorReference || undefined,
    };
    if (a.newEndDate) body.newEndDate = a.newEndDate;
    if (a.newAmount != null) body.newAmount = a.newAmount;

    this.api.recordGrantAmendment(this.id, body).subscribe({
      next: g => {
        this.apply(g);
        this.newAmendment = {
          effectiveDate: '', type: 'no_cost_extension', reason: '',
          newEndDate: '', newAmount: null, donorReference: '',
        };
      },
      error: this.fail,
    });
  }

  dueClass(o: { status: string }) {
    return o.status === 'overdue' ? 'pill overdue'
      : o.status === 'submitted' || o.status === 'accepted' ? 'pill done'
      : 'pill pending';
  }

  amendmentLabel(t: string) {
    return t.replace(/_/g, ' ');
  }
}
