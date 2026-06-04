import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Donor, CreateDonorDto, DonorType, Grant, DonorProfile, AddEngagementDto, AddComplianceConditionDto } from '../../core/models';

@Component({
  selector: 'app-donors',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, DecimalPipe, DatePipe],
  template: `
<!-- ─── Header ───────────────────────────────────────────────────────── -->
<div class="page-header">
  <div>
    <span class="eyebrow">Stakeholder Management</span>
    <h1>Donors</h1>
    <p class="subtitle">Manage funding relationships and track donor compliance across all programmes.</p>
  </div>
  @if (canManage()) {
    <button type="button" class="btn-new" (click)="toggleForm()">
      {{ showForm() ? '✕ Cancel' : '+ New donor' }}
    </button>
  }
</div>

<!-- ─── Status tabs + search ─────────────────────────────────────────── -->
<div class="status-tabs">
  <button type="button"
    class="status-tab"
    [class.active]="donorStatusFilter() === 'all'"
    (click)="donorStatusFilter.set('all')">
    All <span class="tab-count">{{ donorCounts().total }}</span>
  </button>
  <button type="button"
    class="status-tab"
    [class.active]="donorStatusFilter() === 'active'"
    (click)="donorStatusFilter.set('active')">
    Active <span class="tab-count">{{ donorCounts().active }}</span>
  </button>
  <button type="button"
    class="status-tab"
    [class.active]="donorStatusFilter() === 'prospect'"
    (click)="donorStatusFilter.set('prospect')">
    Prospects <span class="tab-count">{{ donorCounts().prospect }}</span>
  </button>
  <button type="button"
    class="status-tab"
    [class.active]="donorStatusFilter() === 'inactive'"
    (click)="donorStatusFilter.set('inactive')">
    Inactive <span class="tab-count">{{ donorCounts().inactive }}</span>
  </button>

  <div class="search-wrap">
    <span class="search-icon">🔍</span>
    <input
      type="search"
      class="search-input"
      placeholder="Search donors or countries…"
      [ngModel]="searchQuery()"
      (ngModelChange)="searchQuery.set($event)" />
  </div>
</div>

<!-- ─── Create form ──────────────────────────────────────────────────── -->
@if (showForm()) {
  <div class="create-panel">
    <div class="create-panel-head">
      <div>
        <h2>New donor</h2>
        <p>Add a funding partner and define reporting requirements.</p>
      </div>
    </div>
    <form [formGroup]="form" (ngSubmit)="submit()" class="create-form">
      <div class="form-row">
        <label>Donor name<input formControlName="name" required placeholder="e.g. USAID" /></label>
        <label>Short name / Acronym<input formControlName="shortName" placeholder="USAID" /></label>
      </div>
      <div class="form-row">
        <label>Type<select formControlName="type">
          @for (t of donorTypes; track t) { 
            <option [value]="t">{{ typeLabel(t) }}</option>
          }
        </select></label>
        <label>Status<select formControlName="status">
          @for (s of donorStatuses; track s) { 
            <option [value]="s">{{ statusLabel(s) }}</option>
          }
        </select></label>
      </div>
      <div class="form-row">
        <label>Country<input formControlName="country" placeholder="e.g. United States" /></label>
        <label>Website<input formControlName="website" placeholder="https://usaid.gov" /></label>
      </div>
      <div class="form-row">
        <label>Primary contact name<input formControlName="contactName" /></label>
        <label>Contact email<input formControlName="contactEmail" type="email" /></label>
      </div>
      <label class="full-label">Description
        <textarea formControlName="description" rows="3" placeholder="Brief overview of the donor organisation and funding priorities…"></textarea>
      </label>
      <label class="full-label checkbox">
        <input type="checkbox" formControlName="requiresDisaggregation" />
        Requires disaggregated indicator results (by gender, age, location, etc.)
      </label>
      <div class="form-actions">
        <button type="submit" class="btn-save" [disabled]="form.invalid || saving()">
          {{ saving() ? 'Creating…' : 'Create donor' }}
        </button>
        <button type="button" class="btn-ghost" (click)="toggleForm()">Cancel</button>
      </div>
    </form>
  </div>
}

<!-- ─── Donors grid ────────────────────────────────────────────────── -->
@if (loading()) {
  <div class="loading-grid">
    <div class="skeleton-card" *ngFor="let i of [1,2,3,4,5,6]"></div>
  </div>
} @else if (filteredDonors().length === 0) {
  <div class="empty-state">
    <span class="empty-icon">🤝</span>
    <h3>{{ donorCounts().total === 0 ? 'No donors yet' : 'No matches found' }}</h3>
    <p>{{ donorCounts().total === 0 ? 'Add your first funding partner to start tracking donor relationships and compliance.' : 'Try adjusting your search or filter.' }}</p>
    @if (canManage() && donorCounts().total === 0) {
      <button type="button" class="btn-new" (click)="toggleForm()">+ New donor</button>
    }
  </div>
} @else {
  <div class="donors-grid">
    @for (donor of filteredDonors(); track donor._id) {
      <button type="button" class="donor-card" (click)="selectDonor(donor)">
        <div class="card-top">
          <span class="status-dot" [class]="'dot-' + (donor.status || 'active')"></span>
          <span class="status-label" [class]="'label-' + (donor.status || 'active')">{{ statusLabel(donor.status) }}</span>
          <span class="card-arrow">→</span>
        </div>

        <h3 class="card-name">{{ donor.name }}</h3>

        @if (donor.shortName) {
          <p class="card-meta-item">💼 {{ donor.shortName }}</p>
        }

        <p class="card-type">{{ typeLabel(donor.type) }}</p>

        @if (donor.country) {
          <p class="card-meta-item">📍 {{ donor.country }}</p>
        }

        <div class="card-stats">
          @if (donor.activeGrants) {
            <span class="stat-item">{{ donor.activeGrants }} active grant{{ donor.activeGrants === 1 ? '' : 's' }}</span>
          }
          @if (donor.totalFunded) {
            <span class="stat-item">{{ donor.totalFunded | number:'1.0-0' }} funded</span>
          }
        </div>
      </button>
    }
  </div>
}

<!-- ─── Donor detail view ────────────────────────────────────────────── -->
@if (selected()) {
  <div class="detail-overlay">
    <div class="detail-panel">
      <div class="detail-header">
        <button type="button" class="btn-back" (click)="deselectDonor()">← Back to donors</button>
        <div class="detail-title">
          <h2>{{ selected()!.name }}</h2>
          <span class="status-badge" [attr.data-status]="selected()!.status || 'active'">{{ statusLabel(selected()!.status) }}</span>
        </div>
        @if (canManage()) {
          <button type="button" class="btn-secondary">Edit donor</button>
        }
      </div>

      @if (loading()) {
        <div class="detail-loading">Loading donor details…</div>
      } @else if (error()) {
        <div class="alert-error" style="margin-bottom: 1.5rem;">{{ error() }}</div>
      }
      @if (!loading()) {
        <!-- Organization Info -->
        <div class="detail-section">
          <h3>Organization</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Type</span>
              <span class="info-value">{{ typeLabel(selected()!.type) }}</span>
            </div>
            @if (selected()!.shortName) {
              <div class="info-item">
                <span class="info-label">Acronym</span>
                <span class="info-value">{{ selected()!.shortName }}</span>
              </div>
            }
            @if (selected()!.country) {
              <div class="info-item">
                <span class="info-label">Country</span>
                <span class="info-value">{{ selected()!.country }}</span>
              </div>
            }
            @if (selected()!.website) {
              <div class="info-item">
                <span class="info-label">Website</span>
                <a [href]="selected()!.website" target="_blank" class="info-link">{{ selected()!.website }} ↗</a>
              </div>
            }
          </div>
          @if (selected()!.description) {
            <div class="description-box">
              <p>{{ selected()!.description }}</p>
            </div>
          }
        </div>

        <!-- Contact Info -->
        @if (selected()!.contactName || selected()!.contactEmail || selected()!.contactPhone) {
          <div class="detail-section">
            <h3>Primary Contact</h3>
            <div class="contact-box">
              @if (selected()!.contactName) {
                <div class="contact-item">
                  <span class="contact-label">Name</span>
                  <span class="contact-value">{{ selected()!.contactName }}</span>
                </div>
              }
              @if (selected()!.contactEmail) {
                <div class="contact-item">
                  <span class="contact-label">Email</span>
                  <a [href]="'mailto:' + selected()!.contactEmail" class="contact-link">{{ selected()!.contactEmail }}</a>
                </div>
              }
              @if (selected()!.contactPhone) {
                <div class="contact-item">
                  <span class="contact-label">Phone</span>
                  <a [href]="'tel:' + selected()!.contactPhone" class="contact-link">{{ selected()!.contactPhone }}</a>
                </div>
              }
            </div>
          </div>
        }

        <!-- Financial Overview -->
        @if (donorProfile()) {
          <div class="detail-section">
            <h3>Financial Overview</h3>
            <div class="kpi-grid-compact">
              <div class="kpi-mini">
                <div class="kpi-value">{{ donorProfile()!.summary.totalGrants }}</div>
                <div class="kpi-label">Total Grants</div>
              </div>
              <div class="kpi-mini">
                <div class="kpi-value">{{ donorProfile()!.summary.activeGrants }}</div>
                <div class="kpi-label">Active</div>
              </div>
              <div class="kpi-mini">
                <div class="kpi-value">{{ donorProfile()!.summary.totalAwarded | number:'1.0-0' }}</div>
                <div class="kpi-label">Awarded</div>
              </div>
              <div class="kpi-mini">
                <div class="kpi-value">{{ donorProfile()!.summary.totalSpent | number:'1.0-0' }}</div>
                <div class="kpi-label">Spent</div>
              </div>
            </div>
          </div>
        }

        <!-- Reporting Requirements -->
        @if (selected()!.reportingCadence || selected()!.preferredReportingFormat || selected()!.requiresDisaggregation) {
          <div class="detail-section">
            <h3>Reporting Requirements</h3>
            <div class="info-grid">
              @if (selected()!.reportingCadence) {
                <div class="info-item">
                  <span class="info-label">Cadence</span>
                  <span class="info-value">{{ selected()!.reportingCadence }}</span>
                </div>
              }
              @if (selected()!.preferredReportingFormat) {
                <div class="info-item">
                  <span class="info-label">Format</span>
                  <span class="info-value">{{ selected()!.preferredReportingFormat }}</span>
                </div>
              }
              @if (selected()!.requiresDisaggregation) {
                <div class="alert-flag">⚠️ Requires disaggregated results (by gender, age, location)</div>
              }
            </div>
          </div>
        }

        <!-- Linked Grants -->
        @if (donorGrants().length > 0) {
          <div class="detail-section">
            <h3>Linked Grants ({{ donorGrants().length }})</h3>
            <div class="grants-list">
              @for (grant of donorGrants(); track grant._id) {
                <div class="grant-item">
                  <div class="grant-name">{{ grant.title || grant.name }}</div>
                  <div class="grant-meta">
                    <span class="grant-status" [attr.data-status]="grant.status">{{ grant.status }}</span>
                    <span class="grant-amount">{{ grant.currency }} {{ (grant.totalAmount ?? grant.amount) | number:'1.0-0' }}</span>
                  </div>
                </div>
              }
            </div>
          </div>
        }
      }
    </div>
  </div>
}
  `,
  styleUrls: ['./donor.component.scss'],
})
export class DonorsComponent implements OnInit {
  private api  = inject(ApiService);
  private auth = inject(AuthService);
  private fb   = inject(FormBuilder);

  donors      = signal<Donor[]>([]);
  selected    = signal<Donor | null>(null);
  donorProfile = signal<DonorProfile | null>(null);
  donorGrants = signal<Grant[]>([]);
  loading     = signal(true);
  saving      = signal(false);
  showForm    = signal(false);
  error       = signal('');
  
  searchQuery = signal('');
  donorStatusFilter = signal<'all' | 'active' | 'prospect' | 'inactive'>('all');

  canManage = computed(() => this.auth.isOwner() || this.auth.isAdmin());
  
  donorCounts = computed(() => ({
    total: this.donors().length,
    active: this.donors().filter((d) => d.status === 'active').length,
    prospect: this.donors().filter((d) => d.status === 'prospect').length,
    inactive: this.donors().filter((d) => d.status === 'inactive').length,
  }));

  filteredDonors = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    return this.donors().filter((donor) => {
      const matchesStatus = this.donorStatusFilter() === 'all' || donor.status === this.donorStatusFilter();
      const matchesQuery =
        !query ||
        donor.name.toLowerCase().includes(query) ||
        (donor.country?.toLowerCase().includes(query) ?? false) ||
        (donor.type?.toLowerCase().includes(query) ?? false);
      return matchesStatus && matchesQuery;
    });
  });

  donorTypes: DonorType[] = ['bilateral','multilateral','foundation','corporate','individual','government','other'];
  donorStatuses = ['active', 'prospect', 'inactive', 'former'];

  form = this.fb.group({
    name:                   ['', Validators.required],
    shortName:              [''],
    type:                   ['bilateral' as DonorType, Validators.required],
    status:                 ['active'],
    country:                [''],
    website:                [''],
    contactName:            [''],
    contactEmail:           ['', Validators.email],
    description:            [''],
    reportingCadence:       [''],
    requiresDisaggregation: [false],
  });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.donors().subscribe({
      next: res => {
        const donors = Array.isArray(res) ? res : (res as any).data ?? [];
        this.donors.set(donors);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  toggleForm() {
    this.showForm.update((v) => !v);
  }

  selectDonor(donor: Donor) {
    this.selected.set(donor);
    this.loading.set(true);
    // Try to load full profile, fall back to just grants if profile fails
    this.api.donorProfile(donor._id).subscribe({
      next: (profile) => {
        this.donorProfile.set(profile);
        this.donorGrants.set(profile.grants ?? []);
        this.loading.set(false);
      },
      error: () => {
        // Profile endpoint may not exist yet - try just grants
        this.api.donorGrants(donor._id).subscribe({
          next: (grants) => {
            this.donorGrants.set(grants);
            this.loading.set(false);
          },
          error: () => {
            // Neither endpoint worked - just show donor data we already have
            this.loading.set(false);
            this.error.set('Could not load full profile. Try refreshing the API server.');
          },
        });
      },
    });
  }

  deselectDonor() {
    this.selected.set(null);
    this.donorProfile.set(null);
    this.donorGrants.set([]);
  }

  submit() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.api.createDonor(this.form.value as CreateDonorDto).subscribe({
      next: () => { this.load(); this.showForm.set(false); this.form.reset({ status: 'active' }); this.saving.set(false); },
      error: err => { this.error.set(err.error?.message || 'Failed'); this.saving.set(false); }
    });
  }

  typeLabel(type?: string): string {
    const labels: Record<string, string> = {
      bilateral: 'Bilateral',
      multilateral: 'Multilateral',
      foundation: 'Foundation',
      corporate: 'Corporate',
      individual: 'Individual',
      government: 'Government',
      other: 'Other',
    };
    return labels[type || ''] || 'Unknown';
  }

  statusLabel(status?: string): string {
    const labels: Record<string, string> = {
      active: 'Active',
      prospect: 'Prospect',
      inactive: 'Inactive',
      former: 'Former',
    };
    return labels[status || 'active'] || 'Unknown';
  }
}