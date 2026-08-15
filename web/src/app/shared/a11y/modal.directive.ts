import {
  AfterViewInit,
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  inject,
} from '@angular/core';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Makes a modal or slide-over panel usable without a mouse.
 *
 * Applies the dialog semantics assistive technology needs (`role="dialog"`,
 * `aria-modal`, a label), moves focus into the panel on open, keeps Tab inside
 * it while it is open, closes on Escape, and returns focus to whatever was
 * focused before. Panels without this can only be reached and dismissed with a
 * pointer.
 *
 * Usage:
 *   <div class="modal" appModal modalLabel="Edit indicator" (modalClose)="close()">
 */
@Directive({
  selector: '[appModal]',
  standalone: true,
})
export class ModalDirective implements AfterViewInit, OnDestroy {
  /** Accessible name for the dialog. Ignored when `modalLabelledBy` is set. */
  @Input() modalLabel = '';
  /** Id of an element (usually the panel's heading) that names the dialog. */
  @Input() modalLabelledBy = '';
  /** Set false for a panel that must not be dismissable with Escape. */
  @Input() modalCloseOnEscape = true;

  /** Fired on Escape. The host component owns the actual close. */
  @Output() modalClose = new EventEmitter<void>();

  private readonly host = inject(ElementRef<HTMLElement>);
  private previouslyFocused: HTMLElement | null = null;

  ngAfterViewInit(): void {
    const el = this.host.nativeElement as HTMLElement;

    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    if (this.modalLabelledBy) {
      el.setAttribute('aria-labelledby', this.modalLabelledBy);
    } else if (this.modalLabel) {
      el.setAttribute('aria-label', this.modalLabel);
    }
    // Needed so focus can land on the panel itself when it holds no focusable
    // child (a confirmation with only text, for example).
    if (!el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '-1');
    }

    this.previouslyFocused = document.activeElement as HTMLElement | null;
    // Defer so the panel's own content has rendered before we look for a target.
    queueMicrotask(() => {
      const first = el.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? el).focus();
    });
  }

  ngOnDestroy(): void {
    // Returning focus is what makes a modal usable in a keyboard flow — without
    // it, focus resets to the top of the document on every close.
    this.previouslyFocused?.focus?.();
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.modalCloseOnEscape) {
      event.preventDefault();
      event.stopPropagation();
      this.modalClose.emit();
      return;
    }

    if (event.key !== 'Tab') return;

    const el = this.host.nativeElement as HTMLElement;
    const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((node) => node.offsetParent !== null || node === document.activeElement);
    if (focusable.length === 0) {
      // Nothing to move to — keep focus on the panel rather than escaping to
      // the page behind it.
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey && (active === first || active === el)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
