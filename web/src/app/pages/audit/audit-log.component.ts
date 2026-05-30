// web/src/app/pages/audit-log/audit-log.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuditEvent } from '../../core/models';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="page audit-page">
  <div class="page-header">
    <div>
      <h1>Audit Log</h1>
      <p class="page-subtitle">Full immutable history of all changes across the system</p>
    </div>
    <button class="btn btn-outline" (click)="exportCsv()">⬇ Export CSV</button>
  </div>

  <!-- Filters -->
  <div class="filter-row card filter-card">
    <div class="field-inline">
      <label>Entity</label>
      <select [(ngModel)]="filterEntity" (ngModelChange)="load()">
        <option value="">All Entities</option>
        <option value="BudgetAllocation">Budget Allocation</option>
        <option value="BudgetLineItem">Budget Line Item</option>
        <option value="BudgetVariance">Budget Variance</option>
        <option value="Grant">Grant</option>
        <option value="Donor">Donor</option>
        <option value="ReportingPeriod">Reporting Period</option>
        <option value="Activity">Activity</option>
        <option value="Indicator">Indicator</option>
        <option value="Project">Project</option>
        <option value="User">User</option>
      </select>
    </div>
    <div class="field-inline">
      <label>Action</label>
      <select [(ngModel)]="filterAction" (ngModelChange)="load()">
        <option value="">All Actions</option>
        <option value="CREATE">Create</option>
        <option value="UPDATE">Update</option>
        <option value="DELETE">Delete</option>
        <option value="APPROVE">Approve</option>
        <option value="REJECT">Reject</option>
        <option value="SUBMIT">Submit</option>
        <option value="LOCK">Lock</option>
        <option value="REVISE">Revise</option>
        <option value="EXPORT">Export</option>
      </select>
    </div>
    <div class="field-inline">
      <label>User Email</label>
      <input [(ngModel)]="filterEmail" (ngModelChange)="onEmailChange()" placeholder="user@org.org" />
    </div>
    <button class="btn btn-ghost btn-sm" (click)="clearFilters()">Clear</button>
  </div>

  @if (loading()) { <div class="loading">Loading audit events…</div> }
  @if (error())   { <div class="alert alert-error">{{ error() }}</div> }

  @if (!loading() && events().length === 0) {
    <div class="empty-state card"><p>No audit events match your filters.</p></div>
  }

  @if (!loading() && events().length > 0) {
    <div class="card table-wrapper">
      <table class="data-table audit-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>User</th>
            <th>Action</th>
            <th>Entity</th>
            <th>Entity ID</th>
            <th>Reason / Changes</th>
          </tr>
        </thead>
        <tbody>
          @for (e of events(); track e._id) {
            <tr>
              <td class="audit-time">{{ e.createdAt | date:'d MMM y HH:mm:ss' }}</td>
              <td class="audit-user">{{ e.userEmail }}</td>
              <td>
                <span [class]="'badge ' + actionBadge(e.action)">{{ e.action }}</span>
              </td>
              <td>{{ e.entity }}</td>
              <td class="audit-id">
                <code title="{{ e.entityId }}">{{ e.entityId | slice:0:8 }}…</code>
              </td>
              <td class="audit-detail">
                @if (e.reason) { <div class="audit-reason">{{ e.reason }}</div> }
                @if (e.before || e.after) {
                  <button class="btn btn-xs btn-ghost" (click)="toggleDiff(e._id)">
                    {{ expandedId() === e._id ? 'Hide diff' : 'View diff' }}
                  </button>
                  @if (expandedId() === e._id) {
                    <div class="diff-panel">
                      @if (e.before) {
                        <div class="diff-before">
                          <strong>Before:</strong>
                          <pre>{{ e.before | json }}</pre>
                        </div>
                      }
                      @if (e.after) {
                        <div class="diff-after">
                          <strong>After:</strong>
                          <pre>{{ e.after | json }}</pre>
                        </div>
                      }
                    </div>
                  }
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    @if (totalPages > 1) {
      <div class="pagination">
        <button [disabled]="page() <= 1" (click)="prevPage()" class="btn btn-sm btn-ghost">← Prev</button>
        <span>{{ page() }} / {{ totalPages }}</span>
        <button [disabled]="page() >= totalPages" (click)="nextPage()" class="btn btn-sm btn-ghost">Next →</button>
      </div>
    }
  }
</div>
  `,
  styleUrl: './audit-log.component.scss',
})
export class AuditLogComponent implements OnInit {
  private api = inject(ApiService);

  events     = signal<AuditEvent[]>([]);
  loading    = signal(true);
  error      = signal('');
  expandedId = signal<string | null>(null);
  page       = signal(1);
  total      = signal(0);
  limit      = 50;

  filterEntity = '';
  filterAction = '';
  filterEmail  = '';
  private emailTimer: any;

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    const params: any = { page: this.page(), limit: this.limit };
    if (this.filterEntity) params.entity = this.filterEntity;
    if (this.filterAction) params.action = this.filterAction;
    if (this.filterEmail)  params.userId = this.filterEmail; // backend can resolve by email

    this.api.auditLog(params).subscribe({
      next: res => { this.events.set(res.data); this.total.set(res.total); this.loading.set(false); },
      error: err => { this.error.set(err.error?.message || 'Failed to load audit log'); this.loading.set(false); }
    });
  }

  onEmailChange() {
    clearTimeout(this.emailTimer);
    this.emailTimer = setTimeout(() => this.load(), 600);
  }

  clearFilters() {
    this.filterEntity = '';
    this.filterAction = '';
    this.filterEmail  = '';
    this.page.set(1);
    this.load();
  }

  toggleDiff(id: string) {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  nextPage() { this.page.update(p => p + 1); this.load(); }
  prevPage() { this.page.update(p => Math.max(1, p - 1)); this.load(); }

  exportCsv() {
    const rows = [
      ['Time','User','Action','Entity','EntityID','Reason'],
      ...this.events().map(e => [
        e.createdAt, e.userEmail, e.action, e.entity, e.entityId, e.reason ?? ''
      ])
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  actionBadge(action: string): string {
    if (['CREATE','CREATE_ALLOCATION','CREATE_LINE_ITEM'].includes(action)) return 'badge-green';
    if (['DELETE','DELETE_ALLOCATION','DELETE_LINE_ITEM'].includes(action)) return 'badge-red';
    if (['APPROVE','APPROVE_ALLOCATION'].includes(action)) return 'badge-blue';
    if (['LOCK','CLOSE','CLOSE_ALLOCATION'].includes(action)) return 'badge-dark';
    if (['REVISE','REVISE_ALLOCATION'].includes(action)) return 'badge-orange';
    return 'badge-gray';
  }

  get totalPages() { return Math.ceil(this.total() / this.limit); }
}