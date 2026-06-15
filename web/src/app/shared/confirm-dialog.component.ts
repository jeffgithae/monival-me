import { Component, inject, HostListener } from '@angular/core';
import { ConfirmService } from './confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    @if (confirm.isOpen()) {
      <div class="cd-backdrop" (click)="confirm.cancel()">
        <div class="cd-modal" (click)="$event.stopPropagation()" role="alertdialog"
          [attr.aria-labelledby]="'cd-title'"
          [attr.aria-describedby]="'cd-body'"
          aria-modal="true">

          <div class="cd-header" [class.cd-danger]="confirm.options().danger">
            <span class="cd-icon">{{ confirm.options().danger ? '⚠️' : 'ℹ️' }}</span>
            <h2 id="cd-title" class="cd-title">{{ confirm.options().title }}</h2>
          </div>

          <div class="cd-body" id="cd-body">
            <p class="cd-message">{{ confirm.options().message }}</p>
            @if (confirm.options().consequence) {
              <div class="cd-consequence">
                <span class="cd-consequence-icon">💥</span>
                {{ confirm.options().consequence }}
              </div>
            }
          </div>

          <div class="cd-footer">
            <button class="cd-cancel" (click)="confirm.cancel()">
              {{ confirm.options().cancelLabel ?? 'Cancel' }}
            </button>
            <button class="cd-confirm"
              [class.cd-confirm-danger]="confirm.options().danger"
              (click)="confirm.confirm()">
              {{ confirm.options().confirmLabel ?? 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .cd-backdrop {
      position: fixed; inset: 0; z-index: 10001;
      background: rgba(0,0,0,.5); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center;
      padding: 1.25rem;
      animation: fadeIn .15s ease;
    }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }

    .cd-modal {
      width: min(460px, 100%); background: var(--card-bg);
      border: 1px solid var(--border); border-radius: 18px;
      box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden;
      animation: pop .18s cubic-bezier(.22,1,.36,1);
    }
    @keyframes pop { from { opacity:0; transform:scale(.95); } to { opacity:1; transform:scale(1); } }

    .cd-header {
      display: flex; align-items: center; gap: .85rem;
      padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border);
      background: var(--surface-soft);
      &.cd-danger { background: rgba(239,68,68,.06); border-bottom-color: rgba(239,68,68,.2); }
    }
    .cd-icon { font-size: 1.3rem; }
    .cd-title { margin: 0; font-size: 1rem; font-weight: 700; color: var(--text-strong); }

    .cd-body { padding: 1.25rem 1.5rem; }
    .cd-message { margin: 0 0 .75rem; font-size: .9rem; color: var(--text); line-height: 1.5; }
    .cd-consequence {
      display: flex; gap: .6rem; align-items: flex-start;
      padding: .75rem 1rem; background: rgba(239,68,68,.07);
      border: 1px solid rgba(239,68,68,.2); border-radius: 10px;
      font-size: .85rem; color: var(--red); line-height: 1.45;
      .cd-consequence-icon { flex-shrink: 0; margin-top: .05rem; }
    }

    .cd-footer {
      display: flex; justify-content: flex-end; gap: .75rem;
      padding: 1rem 1.5rem; border-top: 1px solid var(--border);
    }
    .cd-cancel {
      padding: .6rem 1.2rem; background: var(--surface-soft);
      border: 1px solid var(--border); border-radius: 10px;
      color: var(--muted); font-weight: 600; font-size: .875rem;
      cursor: pointer; transition: background .15s;
      &:hover { background: var(--surface-hover); color: var(--text); }
    }
    .cd-confirm {
      padding: .6rem 1.4rem; background: #4f46e5; color: #fff;
      border: none; border-radius: 10px; font-weight: 700;
      font-size: .875rem; cursor: pointer; transition: opacity .15s;
      &:hover { opacity: .88; }
      &.cd-confirm-danger { background: #ef4444; }
    }
  `],
})
export class ConfirmDialogComponent {
  confirm = inject(ConfirmService);

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.confirm.isOpen()) this.confirm.cancel();
  }

  @HostListener('document:keydown.enter')
  onEnter() {
    if (this.confirm.isOpen()) this.confirm.confirm();
  }
}