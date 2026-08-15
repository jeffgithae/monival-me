import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { RouterLink } from '@angular/router';

/**
 * 404 page.
 *
 * The wildcard route used to redirect to /dashboard, so a mistyped or stale URL
 * landed somewhere plausible with no indication anything was wrong — a broken
 * bookmark looked like the app losing the user's data.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="nf">
      <p class="nf-code" aria-hidden="true">404</p>
      <h1 class="nf-title">We couldn't find that page</h1>
      <p class="nf-body">
        The link may be out of date, or the record may have been moved or deleted.
        Nothing has been lost — this page simply doesn't exist.
      </p>
      <div class="nf-actions">
        <button type="button" class="nf-btn" (click)="goBack()">← Go back</button>
        <a class="nf-btn nf-btn-primary" routerLink="/dashboard">Go to dashboard</a>
      </div>
    </main>
  `,
  styles: [`
    .nf {
      max-width: 34rem;
      margin: 0 auto;
      padding: 4rem 1.5rem;
      text-align: center;
    }
    .nf-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 3rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      margin: 0 0 0.5rem;
      opacity: 0.35;
    }
    .nf-title { margin: 0 0 0.75rem; font-size: 1.5rem; }
    .nf-body { margin: 0 0 2rem; line-height: 1.6; opacity: 0.8; }
    .nf-actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
    .nf-btn {
      display: inline-block;
      padding: 0.6rem 1.1rem;
      border: 1px solid var(--border, #d8dde5);
      border-radius: 6px;
      background: var(--surface, #fff);
      color: inherit;
      font: inherit;
      text-decoration: none;
      cursor: pointer;
    }
    .nf-btn:hover { background: var(--surface-2, #f2f4f7); }
    .nf-btn:focus-visible { outline: 2px solid var(--accent, #1f5f8b); outline-offset: 2px; }
    .nf-btn-primary {
      background: var(--accent, #1f5f8b);
      border-color: var(--accent, #1f5f8b);
      color: #fff;
    }
    .nf-btn-primary:hover { filter: brightness(1.08); }
  `],
})
export class NotFoundComponent {
  private readonly location = inject(Location);

  goBack(): void {
    this.location.back();
  }
}
