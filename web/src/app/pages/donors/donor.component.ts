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
<div class="page donors-page">
  <div class="page-header">
    <div>
      <h1>Donor Registry</h1>
      <p class="page-subtitle">Manage funders and their relationship with your organisation</p>
    </div>
    @if (canManage()) {
      <button class="btn btn-primary" (click)="showForm.set(!showForm())">
        {{ showForm() ? '✕ Cancel' : '+ Add Donor' }}
      </button>
    }
  </div>

  @if (error()) { <div class="alert alert-error">{{ error() }}</div> }

  @if (showForm() && canManage()) {
    <div class="card form-card">
      <h3>New Donor</h3>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <div class="form-grid-2">
          <div class="field">
            <label>Donor Name *</label>
            <input formControlName="name" placeholder="USAID" />
          </div>
          <div class="field">
            <label>Short Name / Acronym</label>
            <input formControlName="shortName" placeholder="USAID" />
          </div>
        </div>
        <div class="form-grid-3">
          <div class="field">
            <label>Type *</label>
            <select formControlName="type">
              @for (t of donorTypes; track t) { <option [value]="t">{{ t | titlecase }}</option> }
            </select>
          </div>
          <div class="field">
            <label>Country</label>
            <input formControlName="country" placeholder="United States" />
          </div>
          <div class="field">
            <label>Website</label>
            <input formControlName="website" placeholder="https://usaid.gov" />
          </div>
        </div>
        <div class="form-grid-2">
          <div class="field">
            <label>Primary Contact Name</label>
            <input formControlName="contactName" />
          </div>
          <div class="field">
            <label>Contact Email</label>
            <input formControlName="contactEmail" type="email" />
          </div>
        </div>
        <div class="field">
          <label>Description</label>
          <textarea formControlName="description" rows="2" placeholder="Brief description of the donor…"></textarea>
        </div>
        <div class="field-checkbox">
          <input formControlName="requiresDisaggregation" type="checkbox" id="disagg" />
          <label for="disagg">Requires disaggregated indicator results (by gender, age, etc.)</label>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" [disabled]="form.invalid || saving()">
            {{ saving() ? 'Saving…' : 'Add Donor' }}
          </button>
        </div>
      </form>
    </div>
  }

  <div class="donors-layout">
    <!-- List -->
    <div class="donors-list">
      @if (loading()) {
        <div class="loading">Loading…</div>
      } @else if (donors().length === 0) {
        <div class="empty-state"><p>No donors yet.</p></div>
      } @else {
        @for (d of donors(); track d._id) {
          <div class="donor-card" [class.active]="selected()?._id === d._id" (click)="select(d)">
            <div class="donor-name">{{ d.name }}</div>
            <div class="donor-meta">
              <span class="badge badge-gray">{{ d.type }}</span>
              @if (d.country) { <span class="muted">{{ d.country }}</span> }
            </div>
            @if (d.activeGrants) {
              <div class="donor-stats">{{ d.activeGrants }} active grants · $ {{ d.totalFunded | number }}</div>
            }
          </div>
        }
      }
    </div>

    <!-- Detail -->
    @if (selected()) {
      <div class="donor-detail card">
        <div class="detail-header">
          <h2>{{ selected()!.name }}</h2>
          @if (canManage()) {
            <button class="btn btn-outline btn-sm" (click)="startEdit()">Edit</button>
          }
        </div>
        <div class="donor-info-grid">
          <div class="info-item"><label>Type</label><span>{{ selected()!.type | titlecase }}</span></div>
          @if (selected()!.country) { <div class="info-item"><label>Country</label><span>{{ selected()!.country }}</span></div> }
          @if (selected()!.website) { <div class="info-item"><label>Website</label><a [href]="selected()!.website" target="_blank">{{ selected()!.website }}</a></div> }
          @if (selected()!.contactName) { <div class="info-item"><label>Contact</label><span>{{ selected()!.contactName }} · {{ selected()!.contactEmail }}</span></div> }
          @if (selected()!.requiresDisaggregation) { <div class="info-item full"><label>⚠️ Requires disaggregated reporting</label></div> }
        </div>
        @if (selected()!.description) {
          <div class="donor-desc"><p>{{ selected()!.description }}</p></div>
        }

        <!-- Grants linked to this donor -->
        <h3>Grants</h3>
        @if (donorGrants().length === 0) {
          <p class="muted">No grants linked to this donor.</p>
        } @else {
          <table class="data-table">
            <thead><tr><th>Grant</th><th>Status</th><th>Amount</th><th>Expires</th></tr></thead>
            <tbody>
              @for (g of donorGrants(); track g._id) {
                <tr>
                  <td><a [routerLink]="['/grants', g._id]">{{ g.title }}</a></td>
                  <td><span class="badge badge-gray">{{ g.status }}</span></td>
                  <td>{{ g.currency }} {{ g.totalAmount | number }}</td>
                  <td>{{ g.endDate | date:'d MMM y' }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    } @else {
      <div class="donor-placeholder card">
        <p>← Select a donor to view details and linked grants</p>
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
      next: res => { this.donors.set(res.data); this.loading.set(false); },
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