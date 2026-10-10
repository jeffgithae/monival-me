import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';

/**
 * Pagination control for list views.
 *
 * Every list view that reads a paginated endpoint must render one of these.
 * Without it a page silently shows only the first slice of a collection with
 * nothing telling the user more exists — which reads as missing data, not as
 * an unpaged list.
 */
@Component({
  selector: 'app-pager',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (totalPages() > 1) {
      <nav class="pager" role="navigation" [attr.aria-label]="label + ' pagination'">
        <button
          type="button"
          class="pager-btn"
          (click)="go(page - 1)"
          [disabled]="page <= 1"
          [attr.aria-label]="'Previous page of ' + label"
        >‹ Prev</button>

        <span class="pager-info" aria-live="polite">
          Page {{ page }} of {{ totalPages() }}
          @if (total > 0) {
            <span class="pager-count">· {{ total | number }} {{ label }}</span>
          }
        </span>

        <button
          type="button"
          class="pager-btn"
          (click)="go(page + 1)"
          [disabled]="page >= totalPages()"
          [attr.aria-label]="'Next page of ' + label"
        >Next ›</button>
      </nav>
    }
  `,
  styles: [`
    .pager {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 1rem 0;
    }
    .pager-btn {
      padding: 0.45rem 0.9rem;
      border: 1px solid var(--border);
      border-radius: var(--r);
      background: var(--surface);
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .pager-btn:hover:not(:disabled) { background: var(--surface-2); }
    .pager-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .pager-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .pager-info { font-size: 0.875rem; color: var(--muted); }
    .pager-count { opacity: 0.8; }
  `],
})
export class PagerComponent {
  /** 1-based current page. */
  @Input({ required: true }) page = 1;
  /** Total number of records across all pages. */
  @Input({ required: true }) total = 0;
  /** Page size the list was requested with. */
  @Input() limit = 50;
  /** Plural noun for the records, used in the count and the aria labels. */
  @Input() label = 'items';

  @Output() pageChange = new EventEmitter<number>();

  readonly totalPages = computed(() => this.pagesSignal());
  private readonly pagesSignal = signal(1);

  ngOnChanges(): void {
    this.pagesSignal.set(Math.max(1, Math.ceil(this.total / Math.max(1, this.limit))));
  }

  go(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page) {
      return;
    }
    this.pageChange.emit(page);
  }
}
