// web/src/app/pages/donors/donors.component.ts
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Donor, CreateDonorDto, DonorType, Grant } from '../../core/models';

@Component({
  selector: 'app-donors',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  template: `
<div class="projects-dashboard donors-page">
  <header class="dashboard-header glass-panel">
    <div class="header-content">
      <div class="header-titles">
        <h1 class="gradient-text">Donor Registry</h1>
        <p class="muted">Manage funders and their relationship with your organization</p>
      </div>
      <div class="header-stats">
        <div class="stat-badge active-badge">
          <span class="value">{{ donors().length }}</span>
          <span class="label">Total Donors</span>
        </div>
      </div>
      @if (canManage()) {
        <button class="btn-primary shadow-btn" (click)="showForm.set(!showForm())">
          <span class="icon">{{ showForm() ? '✕' : '+' }}</span> {{ showForm() ? 'Cancel' : 'Add Donor' }}
        </button>
      }
    </div>
  </header>

  @if (error()) { <div class="alert alert-error glass-panel">{{ error() }}</div> }

  @if (showForm() && canManage()) {
    <section class="form-panel glass-panel">
      <div class="panel-header">
        <h2>{{ editMode() ? 'Edit Donor' : 'New Donor' }}</h2>
      </div>
      <form [formGroup]="form" (ngSubmit)="submit()" class="form-grid">
        <div class="form-group">
          <label>Donor Name *</label>
          <input formControlName="name" class="glass-input" placeholder="e.g. USAID" />
        </div>
        <div class="form-group">
          <label>Short Name / Acronym</label>
          <input formControlName="shortName" class="glass-input" placeholder="USAID" />
        </div>
        <div class="form-group">
          <label>Type *</label>
          <select formControlName="type" class="status-select">
            @for (t of donorTypes; track t) { <option [value]="t">{{ t | titlecase }}</option> }
          </select>
        </div>
        <div class="form-group">
          <label>Country</label>
          <input formControlName="country" class="glass-input" placeholder="e.g. United States" />
        </div>
        <div class="form-group">
          <label>Website</label>
          <input formControlName="website" class="glass-input" placeholder="https://usaid.gov" />
        </div>
        <div class="form-group">
          <label>Primary Contact Name</label>
          <input formControlName="contactName" class="glass-input" />
        </div>
        <div class="form-group">
          <label>Contact Email</label>
          <input formControlName="contactEmail" type="email" class="glass-input" />
        </div>
        <div class="form-group full-width">
          <label>Description</label>
          <textarea formControlName="description" rows="3" class="glass-input" placeholder="Brief description of the donor…"></textarea>
        </div>
        <div class="form-group full-width field-checkbox">
          <label style="display:flex; gap:0.5rem; align-items:center;">
            <input formControlName="requiresDisaggregation" type="checkbox" id="disagg" />
            Requires disaggregated indicator results (by gender, age, etc.)
          </label>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary" [disabled]="form.invalid || saving()">
            {{ saving() ? 'Saving…' : (editMode() ? 'Save Changes' : 'Add Donor') }}
          </button>
        </div>
      </form>
    </section>
  }

  <div class="donors-layout grid-layout mt-4" style="display: grid; grid-template-columns: 1fr 2fr; gap: 1.5rem;">
    <!-- List -->
    <div class="donors-list glass-panel" style="padding: 1.5rem; max-height: 800px; overflow-y: auto;">
      @if (loading()) {
        <div class="state-message">
          <div class="spinner"></div>
          <p>Loading donors…</p>
        </div>
      } @else if (donors().length === 0) {
        <div class="state-message empty-state">
          <div class="empty-icon">🤝</div>
          <p>No donors yet.</p>
        </div>
      } @else {
        <div class="list-container" style="display:flex; flex-direction:column; gap:1rem;">
          @for (d of donors(); track d._id) {
            <div class="donor-card glass-card" [class.active]="selected()?._id === d._id" (click)="select(d)" style="cursor:pointer; padding: 1rem; border: 2px solid transparent;" [style.borderColor]="selected()?._id === d._id ? '#4f46e5' : 'transparent'">
              <div style="font-weight:700; font-size:1.1rem; color:#111827;">{{ d.name }}</div>
              <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.5rem;">
                <span class="status-pill secondary">{{ d.type }}</span>
                @if (d.country) { <span class="muted" style="font-size:0.8rem;">{{ d.country }}</span> }
              </div>
              @if (d.activeGrants) {
                <div class="muted" style="margin-top:0.5rem; font-size:0.85rem;">{{ d.activeGrants }} active grants · $ {{ d.totalFunded | number }}</div>
              }
            </div>
          }
        </div>
      }
    </div>

    <!-- Detail -->
    @if (selected()) {
      <div class="donor-detail glass-panel" style="padding: 2rem;">
        <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 2rem;">
          <h2 class="gradient-text" style="font-size: 1.8rem; margin:0;">{{ selected()!.name }}</h2>
          @if (canManage()) {
            <button class="btn-ghost" (click)="startEdit()">Edit Donor</button>
          }
        </div>
        
        <div class="metrics-grid" style="margin-bottom: 2rem;">
          <article class="metric-card">
            <div class="metric-icon">🏢</div>
            <div class="metric-content">
              <span class="label">Type</span>
              <strong style="font-size:1.1rem;">{{ selected()!.type | titlecase }}</strong>
            </div>
          </article>
          @if (selected()!.country) {
            <article class="metric-card">
              <div class="metric-icon">🌍</div>
              <div class="metric-content">
                <span class="label">Country</span>
                <strong style="font-size:1.1rem;">{{ selected()!.country }}</strong>
              </div>
            </article>
          }
          @if (selected()!.website) {
            <article class="metric-card">
              <div class="metric-icon">🔗</div>
              <div class="metric-content">
                <span class="label">Website</span>
                <a [href]="selected()!.website" target="_blank" style="font-weight:600; color:#4f46e5;">Visit Site ↗</a>
              </div>
            </article>
          }
        </div>

        @if (selected()!.contactName || selected()!.requiresDisaggregation) {
          <div class="contact-info glass-panel" style="padding: 1.5rem; margin-bottom: 2rem; background: rgba(79, 70, 229, 0.03);">
            @if (selected()!.contactName) { 
              <div style="margin-bottom:1rem;">
                <span class="muted" style="display:block; font-size:0.85rem; text-transform:uppercase; font-weight:600; margin-bottom:0.25rem;">Contact Person</span>
                <strong style="font-size:1.1rem; color:#1f2937;">{{ selected()!.contactName }}</strong>
                <a [href]="'mailto:' + selected()!.contactEmail" style="display:block; color:#4f46e5; margin-top:0.25rem;">{{ selected()!.contactEmail }}</a>
              </div>
            }
            @if (selected()!.requiresDisaggregation) { 
              <div style="display:flex; align-items:center; gap:0.5rem; color:#d97706; font-weight:600; background:rgba(245, 158, 11, 0.1); padding:0.5rem 1rem; border-radius:8px; display:inline-flex;">
                <span>⚠️</span> Requires disaggregated reporting
              </div>
            }
          </div>
        }

        @if (selected()!.description) {
          <div class="description-section" style="margin-bottom: 2rem;">
            <p style="font-size: 1.05rem; line-height:1.6; color:#4b5563;">{{ selected()!.description }}</p>
          </div>
        }

        <!-- Grants linked to this donor -->
        <h3 style="font-size:1.3rem; margin-bottom:1rem; color:#1f2937;">Linked Grants</h3>
        @if (donorGrants().length === 0) {
          <div class="glass-panel empty-state" style="padding:2rem;">
            <p class="muted">No grants linked to this donor yet.</p>
          </div>
        } @else {
          <div style="overflow-x:auto;">
            <table class="documents-table">
              <thead><tr><th>Grant Title</th><th>Status</th><th>Total Amount</th><th>Expires</th></tr></thead>
              <tbody>
                @for (g of donorGrants(); track g._id) {
                  <tr>
                    <td><a [routerLink]="['/grants', g._id]" style="font-weight:600; color:#4f46e5;">{{ g.title }}</a></td>
                    <td><span class="status-pill status-{{g.status}}">{{ g.status }}</span></td>
                    <td><strong>{{ g.currency }} {{ g.totalAmount | number }}</strong></td>
                    <td>{{ g.endDate | date:'d MMM y' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    } @else {
      <div class="donor-placeholder glass-panel empty-state" style="padding: 4rem 2rem;">
        <div class="empty-icon">👈</div>
        <h3 style="color:#1f2937;">Select a Donor</h3>
        <p class="muted">Choose a donor from the list to view their details and linked grants.</p>
      </div>
    }
  </div>
</div>
  `,
})
export class DonorsComponent implements OnInit {
  private api  = inject(ApiService);
  private auth = inject(AuthService);
  private fb   = inject(FormBuilder);

  donors      = signal<Donor[]>([]);
  selected    = signal<Donor | null>(null);
  donorGrants = signal<Grant[]>([]);
  loading     = signal(true);
  saving      = signal(false);
  showForm    = signal(false);
  editMode    = signal(false);
  error       = signal('');

  canManage = computed(() => this.auth.isOwner() || this.auth.isAdmin());

  donorTypes: DonorType[] = ['bilateral','multilateral','foundation','corporate','individual','government','other'];

  form = this.fb.group({
    name:                   ['', Validators.required],
    shortName:              [''],
    type:                   ['bilateral' as DonorType, Validators.required],
    country:                [''],
    website:                [''],
    contactName:            [''],
    contactEmail:           ['', Validators.email],
    description:            [''],
    requiresDisaggregation: [false],
  });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.donors().subscribe({
      next: res => {
        const donors = Array.isArray(res) ? res : res.data;
        this.donors.set(donors);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  select(d: Donor) {
    this.selected.set(d);
    this.api.donorGrants(d._id).subscribe({ next: gs => this.donorGrants.set(gs), error: () => this.donorGrants.set([]) });
  }

  startEdit() {
    const d = this.selected();
    if (!d) return;
    this.form.patchValue(d as any);
    this.editMode.set(true);
    this.showForm.set(true);
  }

  submit() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const call = this.editMode() && this.selected()
      ? this.api.updateDonor(this.selected()!._id, this.form.value as any)
      : this.api.createDonor(this.form.value as CreateDonorDto);

    call.subscribe({
      next: () => { this.load(); this.showForm.set(false); this.editMode.set(false); this.saving.set(false); },
      error: err => { this.error.set(err.error?.message || 'Failed'); this.saving.set(false); }
    });
  }
}