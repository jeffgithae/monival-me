import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { StrategicOverview } from '../../core/models';
import { canManageOrganization } from '../../core/roles';

@Component({
  selector: 'app-strategic-overview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="page-header">
      <div>
        <h1>Strategic Overview</h1>
        <p>Vision, mission, and strategic pillars.</p>
      </div>
      @if (canManageOrg) {
        <button type="button" class="primary">Edit</button>
      }
    </header>

    @if (overview(); as o) {
      <section class="panel">
        <div class="strategic-section">
          <h2>Vision</h2>
          <p class="vision-text">{{ o.vision }}</p>
        </div>

        <div class="strategic-section">
          <h2>Mission</h2>
          <p class="mission-text">{{ o.mission }}</p>
        </div>
      </section>

      <section class="grid-2">
        @for (pillar of o.strategicPillars; track pillar.pillar) {
          <div class="card pillar-card">
            <h3>{{ pillar.pillar }}</h3>
            <p>{{ pillar.description }}</p>
            @if (pillar.initiatives.length > 0) {
              <div class="initiatives">
                <strong>Key initiatives:</strong>
                <ul>
                  @for (init of pillar.initiatives; track init) {
                    <li>{{ init }}</li>
                  }
                </ul>
              </div>
            }
          </div>
        }
      </section>
    } @else {
      <div class="empty panel">
        <p>Strategic overview not configured. Contact your organization administrator.</p>
      </div>
    }
  `,
  styles: `
    .strategic-section {
      margin-bottom: 2rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid #e5e7eb;

      &:last-child {
        border-bottom: none;
      }

      h2 {
        font-size: 1.3rem;
        margin-bottom: 0.75rem;
        color: #1f2937;
      }
    }

    .vision-text,
    .mission-text {
      font-size: 1.1rem;
      line-height: 1.6;
      color: #374151;
      font-weight: 500;
    }

    .pillar-card {
      display: flex;
      flex-direction: column;

      h3 {
        font-size: 1.2rem;
        margin-bottom: 0.5rem;
        color: #1f2937;
      }

      > p {
        color: #6b7280;
        margin-bottom: 1rem;
        flex-grow: 1;
      }

      .initiatives {
        margin-top: auto;

        strong {
          display: block;
          margin-bottom: 0.5rem;
          color: #374151;
        }

        ul {
          list-style: none;
          padding: 0;
          margin: 0;

          li {
            padding: 0.3rem 0 0.3rem 1.5rem;
            position: relative;
            color: #6b7280;

            &::before {
              content: '▸';
              position: absolute;
              left: 0;
              color: #3b82f6;
            }
          }
        }
      }
    }

    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
    }

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
export class StrategicOverviewComponent implements OnInit {
  overview = signal<StrategicOverview | null>(null);
  canManageOrg = false;

  constructor(
    private readonly api: ApiService,
    readonly auth: AuthService,
  ) {
    this.canManageOrg = canManageOrganization(auth.user()?.role ?? 'viewer');
  }

  ngOnInit() {
    this.api.getStrategicOverview().subscribe({
      next: (overview) => this.overview.set(overview),
      error: () => this.overview.set(null),
    });
  }
}
