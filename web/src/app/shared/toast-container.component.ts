import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- role="status" on the container announces new toasts without stealing
         focus; each error toast additionally carries role="alert" so a failure
         interrupts rather than waiting for a pause in speech. -->
    <div class="toast-stack" role="status" aria-live="polite" aria-atomic="false">
      @for (toast of toaster.toasts(); track toast.id) {
        <div class="toast toast-{{ toast.type }}"
             [attr.role]="toast.type === 'error' ? 'alert' : null">
          <span class="toast-icon">{{ icons[toast.type] }}</span>
          <span class="toast-msg">{{ toast.message }}</span>
          <button type="button" class="toast-close" (click)="toaster.dismiss(toast.id)" aria-label="Dismiss">✕</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-stack {
      position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 9999;
      display: flex; flex-direction: column; gap: .6rem;
      max-width: min(420px, calc(100vw - 2rem)); pointer-events: none;
    }
    .toast {
      display: flex; align-items: flex-start; gap: .75rem;
      padding: .85rem 1.1rem; border-radius: var(--r-lg); box-shadow: var(--shadow);
      font-size: .875rem; line-height: 1.45; pointer-events: all;
      animation: slideIn .25s cubic-bezier(.22,1,.36,1) forwards;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(24px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .toast-error   { background: var(--red-bg); color: var(--red-strong); border: 1px solid var(--red-line); }
    .toast-success { background: var(--green-bg); color: var(--green-strong); border: 1px solid var(--green-line); }
    .toast-warning { background: var(--amber-bg); color: var(--amber-strong); border: 1px solid var(--amber); }
    .toast-info    { background: var(--blue-bg); color: var(--blue-strong); border: 1px solid var(--blue-line); }
    .toast-icon { font-size: 1rem; flex-shrink: 0; margin-top: .05rem; }
    .toast-msg  { flex: 1; }
    .toast-close {
      background: none; border: none; cursor: pointer; opacity: .55; font-size: .9rem;
      padding: 0; margin-left: .25rem; flex-shrink: 0;
      &:hover { opacity: 1; }
    }
  `],
})
export class ToastContainerComponent {
  toaster = inject(ToastService);
  icons = { error: '⚠️', success: '✓', warning: '⚡', info: 'ℹ️' };
}