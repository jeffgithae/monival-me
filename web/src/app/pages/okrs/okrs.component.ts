import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { OKR } from '../../core/models';
import { canManageOrganization } from '../../core/roles';

@Component({
  selector: 'app-okrs',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <header class="page-header">
      <div>
        <h1>Objectives & Key Results (OKRs)</h1>
        <p>Quarterly goals and key results for organizational focus.</p>
      </div>
      @if (canManageOrg) {
        <button type="button" class="primary">+ New OKR</button>
      }
    </header>

    @if (okrs().length > 0) {
      <section class="okrs-grid">
        @for (okr of okrs(); track okr._id) {
          <div class="okr-card" [class.completed]="okr.status === 'completed'">
            <div class="okr-header">
              <div>
                <h3>{{ okr.title }}</h3>
                <span class="quarter-year">Q{{ okr.quarter }} {{ okr.year }}</span>
              </div>
              <span class="status-pill" [class]="okr.status">{{ okr.status }}</span>
            </div>

            @if (okr.description) {
              <p class="description">{{ okr.description }}</p>
            }

            <div class="progress-bar">
              <div class="progress-fill" [style.width.%]="okr.progressPercentage"></div>
            </div>
            <span class="progress-text">{{ okr.progressPercentage }}% progress</span>

            <div class="key-results">
              <strong>Key Results:</strong>
              <ul>
                @for (kr of okr.keyResults; track kr.title) {
                  <li class="key-result-item" [class]="kr.status">
                    <div class="kr-title">{{ kr.title }}</div>
                    <div class="kr-progress">
                      <span class="kr-value">{{ kr.currentValue }} / {{ kr.targetValue }} {{ kr.unit }}</span>
                      <span class="kr-confidence">{{ kr.confidence }}% confident</span>
                    </div>
                  </li>
                }
              </ul>
            </div>

            <a [routerLink]="['/okrs', okr._id]" class="link">View details →</a>
          </div>
        }
      </section>
    } @else {
      <div class="empty panel">
        <p>No OKRs defined yet. Create your first quarterly objectives to align team efforts.</p>
      </div>
    }
  `,
  styles: `
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid #e5e7eb;

      > div {
        h1 {
          font-size: 2rem;
          margin: 0;
          color: #1f2937;
        }

        p {
          margin: 0.5rem 0 0;
          color: #6b7280;
        }
      }

      button {
        white-space: nowrap;
      }
    }

    .okrs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.5rem;
    }

    .okr-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      transition: box-shadow 0.2s, border-color 0.2s;
      display: flex;
      flex-direction: column;

      &:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        border-color: #d1d5db;
      }

      &.completed {
        opacity: 0.7;
        background: #f9fafb;
      }
    }

    .okr-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;

      h3 {
        font-size: 1.1rem;
        margin: 0;
        color: #1f2937;
      }

      .quarter-year {
        display: block;
        font-size: 0.85rem;
        color: #9ca3af;
        margin-top: 0.25rem;
      }
    }

    .status-pill {
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: capitalize;

      &.active {
        background: #dbeafe;
        color: #1e40af;
      }

      &.completed {
        background: #dcfce7;
        color: #166534;
      }

      &.draft {
        background: #f3f4f6;
        color: #4b5563;
      }
    }

    .description {
      font-size: 0.9rem;
      color: #6b7280;
      margin: 0.75rem 0;
      line-height: 1.5;
    }

    .progress-bar {
      height: 6px;
      background: #e5e7eb;
      border-radius: 3px;
      overflow: hidden;
      margin: 1rem 0 0.25rem 0;

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #3b82f6, #2563eb);
        transition: width 0.3s ease;
      }
    }

    .progress-text {
      font-size: 0.85rem;
      color: #6b7280;
      display: block;
      margin-bottom: 1rem;
    }

    .key-results {
      margin: 1rem 0;
      flex-grow: 1;

      > strong {
        display: block;
        font-size: 0.9rem;
        color: #374151;
        margin-bottom: 0.5rem;
      }

      ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }
    }

    .key-result-item {
      padding: 0.75rem;
      background: #f9fafb;
      border-left: 3px solid #d1d5db;
      margin-bottom: 0.5rem;
      border-radius: 2px;

      &.in_progress {
        border-left-color: #f59e0b;
      }

      &.on_track {
        border-left-color: #10b981;
      }

      &.at_risk {
        border-left-color: #ef4444;
      }

      &.completed {
        border-left-color: #3b82f6;
      }

      .kr-title {
        font-size: 0.9rem;
        color: #1f2937;
        font-weight: 500;
        margin-bottom: 0.25rem;
      }

      .kr-progress {
        display: flex;
        justify-content: space-between;
        font-size: 0.8rem;
        color: #6b7280;
      }

      .kr-value {
        font-weight: 600;
      }

      .kr-confidence {
        opacity: 0.7;
      }
    }

    .link {
      color: #3b82f6;
      text-decoration: none;
      font-size: 0.9rem;
      margin-top: 1rem;

      &:hover {
        text-decoration: underline;
      }
    }

    .empty {
      text-align: center;
      padding: 3rem 1rem;
      background: #f9fafb;
      border-radius: 8px;

      p {
        margin: 0;
        color: #6b7280;
      }
    }
  `,
})
export class OKRsComponent implements OnInit {
  okrs = signal<OKR[]>([]);
  canManageOrg = false;

  constructor(
    private readonly api: ApiService,
    readonly auth: AuthService,
  ) {
    this.canManageOrg = canManageOrganization(auth.user()?.role ?? 'viewer');
  }

  ngOnInit() {
    this.loadOKRs();
  }

  loadOKRs() {
    this.api.okrs().subscribe({
      next: (okrs) => this.okrs.set(okrs.sort((a, b) => (b.year * 10 + b.quarter) - (a.year * 10 + a.quarter))),
      error: () => this.okrs.set([]),
    });
  }
}
