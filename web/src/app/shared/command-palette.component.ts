import {
  Component, inject, OnInit, OnDestroy, signal, ElementRef, ViewChild, AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CommandPaletteService, PaletteCommand } from './command-palette.service';

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (palette.isOpen()) {
      <div class="cp-backdrop" (click)="palette.close()">
        <div class="cp-modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Command palette" aria-modal="true">
          <div class="cp-search-row">
            <span class="cp-search-icon">⌕</span>
            <input
              #searchInput
              type="text"
              class="cp-input"
              placeholder="Search pages, actions…"
              [ngModel]="palette.query()"
              (ngModelChange)="palette.query.set($event)"
              (keydown)="onKeydown($event)"
              autocomplete="off"
              spellcheck="false"
            />
            <kbd class="cp-esc" (click)="palette.close()">esc</kbd>
          </div>

          <div class="cp-results">
            @if (palette.filteredCommands.length === 0) {
              <div class="cp-empty">No results for "{{ palette.query() }}"</div>
            } @else {
              @for (cmd of palette.filteredCommands; track cmd.id; let i = $index) {
                <button
                  class="cp-item"
                  [class.cp-item-active]="activeIndex() === i"
                  (click)="run(cmd)"
                  (mouseenter)="activeIndex.set(i)">
                  <span class="cp-item-icon">{{ cmd.icon }}</span>
                  <span class="cp-item-body">
                    <span class="cp-item-label">{{ cmd.label }}</span>
                    @if (cmd.description) {
                      <span class="cp-item-desc">{{ cmd.description }}</span>
                    }
                  </span>
                  <span class="cp-item-cat">{{ cmd.category }}</span>
                </button>
              }
            }
          </div>

          <div class="cp-footer">
            <span><kbd>↑↓</kbd> navigate</span>
            <span><kbd>↵</kbd> select</span>
            <span><kbd>esc</kbd> close</span>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .cp-backdrop {
      position: fixed; inset: 0; z-index: 10000;
      background: rgba(0,0,0,.45); backdrop-filter: blur(4px);
      display: flex; align-items: flex-start; justify-content: center;
      padding-top: clamp(60px, 10vh, 120px);
      animation: fadeIn .15s ease;
    }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }

    .cp-modal {
      width: min(620px, calc(100vw - 2rem));
      background: var(--card-bg); border: 1px solid var(--border);
      border-radius: 16px; box-shadow: 0 24px 80px rgba(0,0,0,.3);
      overflow: hidden;
      animation: slideDown .18s cubic-bezier(.22,1,.36,1);
    }
    @keyframes slideDown { from { opacity:0; transform:translateY(-12px); } to { opacity:1; transform:translateY(0); } }

    .cp-search-row {
      display: flex; align-items: center; gap: .75rem;
      padding: 1rem 1.25rem; border-bottom: 1px solid var(--border);
    }
    .cp-search-icon { font-size: 1.15rem; color: var(--muted); }
    .cp-input {
      flex: 1; background: none; border: none; outline: none;
      font-size: 1rem; color: var(--text); font-family: inherit;
      &::placeholder { color: var(--muted); }
    }
    .cp-esc {
      padding: .2rem .5rem; border: 1px solid var(--border); border-radius: 5px;
      font-size: .72rem; color: var(--muted); cursor: pointer;
      font-family: inherit; background: var(--surface-soft);
    }

    .cp-results { max-height: 360px; overflow-y: auto; padding: .4rem; }
    .cp-empty { padding: 2rem; text-align: center; color: var(--muted); font-size: .9rem; }

    .cp-item {
      width: 100%; display: flex; align-items: center; gap: .85rem;
      padding: .65rem .9rem; border: none; background: transparent;
      border-radius: 10px; cursor: pointer; text-align: left;
      transition: background .1s;
      &.cp-item-active { background: var(--primary-ghost); }
    }
    .cp-item-icon { font-size: 1.1rem; flex-shrink: 0; width: 24px; text-align: center; }
    .cp-item-body { flex: 1; display: flex; flex-direction: column; gap: .1rem; min-width: 0; }
    .cp-item-label { font-size: .9rem; font-weight: 600; color: var(--text-strong); }
    .cp-item-desc { font-size: .78rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cp-item-cat { font-size: .68rem; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); flex-shrink: 0; }

    .cp-footer {
      display: flex; gap: 1.25rem; padding: .65rem 1.25rem;
      border-top: 1px solid var(--border); background: var(--surface-soft);
      font-size: .75rem; color: var(--muted);
      kbd { padding: .15rem .4rem; border: 1px solid var(--border); border-radius: 4px; font-size: .7rem; background: var(--card-bg); }
    }
  `],
})
export class CommandPaletteComponent implements OnInit, OnDestroy, AfterViewInit {
  palette = inject(CommandPaletteService);
  activeIndex = signal(0);

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  private keyHandler = (e: KeyboardEvent) => {
    // Cmd+K or Ctrl+K
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      this.palette.toggle();
    }
  };

  ngOnInit() { document.addEventListener('keydown', this.keyHandler); }
  ngOnDestroy() { document.removeEventListener('keydown', this.keyHandler); }

  ngAfterViewInit() {
    // Focus input when palette opens
    if (this.palette.isOpen() && this.searchInput) {
      setTimeout(() => this.searchInput.nativeElement.focus(), 50);
    }
  }

  run(cmd: PaletteCommand) {
    cmd.action();
    this.palette.close();
  }

  onKeydown(e: KeyboardEvent) {
    const len = this.palette.filteredCommands.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.activeIndex.set((this.activeIndex() + 1) % len);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activeIndex.set((this.activeIndex() - 1 + len) % len);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = this.palette.filteredCommands[this.activeIndex()];
      if (cmd) this.run(cmd);
    }
  }
}