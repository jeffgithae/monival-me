import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BreadcrumbService } from './breadcrumb.service';

@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (bc.crumbs().length > 1) {
      <nav class="breadcrumb" aria-label="Breadcrumb">
        @for (crumb of bc.crumbs(); track crumb.label; let last = $last) {
          @if (!last) {
            <a [routerLink]="crumb.route" class="bc-link">{{ crumb.label }}</a>
            <span class="bc-sep" aria-hidden="true">›</span>
          } @else {
            <span class="bc-current" aria-current="page">{{ crumb.label }}</span>
          }
        }
      </nav>
    }
  `,
  styles: [`
    .breadcrumb {
      display: flex; align-items: center; gap: .35rem;
      padding: .5rem 2.5rem; background: var(--surface-soft);
      border-bottom: 1px solid var(--border); font-size: .8rem;
    }
    .bc-link {
      color: var(--muted); text-decoration: none; transition: color .15s;
      &:hover { color: #4f46e5; }
    }
    .bc-sep { color: var(--muted); opacity: .5; }
    .bc-current { color: var(--text-strong); font-weight: 600; }
  `],
})
export class BreadcrumbComponent {
  bc = inject(BreadcrumbService);
}