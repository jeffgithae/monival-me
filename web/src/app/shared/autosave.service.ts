import { Injectable, OnDestroy } from '@angular/core';

export interface AutosaveEntry<T = unknown> {
  data: T;
  savedAt: string;
  version: number;
}

/**
 * AutosaveService — persists form state to localStorage with debounce.
 *
 * Usage in a component:
 *
 *   private autosave = inject(AutosaveService);
 *
 *   ngOnInit() {
 *     // Restore draft if exists
 *     const draft = this.autosave.restore<MyFormValue>('activity-form');
 *     if (draft) { this.form.patchValue(draft.data); }
 *
 *     // Wire to form changes
 *     this.form.valueChanges.subscribe(v => this.autosave.schedule('activity-form', v));
 *   }
 *
 *   onSubmit() {
 *     // Clear draft after successful save
 *     this.autosave.clear('activity-form');
 *   }
 */
@Injectable({ providedIn: 'root' })
export class AutosaveService implements OnDestroy {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly PREFIX   = 'monival_draft_';
  private readonly DEBOUNCE = 1500; // ms

  /**
   * Schedule a save after DEBOUNCE ms. Resets the timer on each call,
   * so rapid edits only trigger one write.
   */
  schedule<T>(key: string, data: T, debounceMs = this.DEBOUNCE) {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.save(key, data);
      this.timers.delete(key);
    }, debounceMs);

    this.timers.set(key, timer);
  }

  /** Immediately persist to localStorage */
  save<T>(key: string, data: T) {
    const existing = this.restore(key);
    const entry: AutosaveEntry<T> = {
      data,
      savedAt: new Date().toISOString(),
      version: (existing?.version ?? 0) + 1,
    };
    try {
      localStorage.setItem(this.PREFIX + key, JSON.stringify(entry));
    } catch {
      // localStorage quota — silently skip
    }
  }

  /** Restore a draft. Returns null if none exists. */
  restore<T>(key: string): AutosaveEntry<T> | null {
    try {
      const raw = localStorage.getItem(this.PREFIX + key);
      return raw ? (JSON.parse(raw) as AutosaveEntry<T>) : null;
    } catch {
      return null;
    }
  }

  /** Returns true if a draft exists for this key */
  hasDraft(key: string): boolean {
    return !!localStorage.getItem(this.PREFIX + key);
  }

  /** Clear draft after successful submit */
  clear(key: string) {
    const existing = this.timers.get(key);
    if (existing) { clearTimeout(existing); this.timers.delete(key); }
    localStorage.removeItem(this.PREFIX + key);
  }

  /** Clear all drafts (e.g. on logout) */
  clearAll() {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(this.PREFIX)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    this.timers.forEach(t => clearTimeout(t));
    this.timers.clear();
  }

  /** How long ago the draft was saved, as a human string */
  draftAge(key: string): string | null {
    const entry = this.restore(key);
    if (!entry) return null;
    const diffMs = Date.now() - new Date(entry.savedAt).getTime();
    const secs   = Math.floor(diffMs / 1000);
    if (secs < 60)   return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  }

  ngOnDestroy() {
    this.timers.forEach(t => clearTimeout(t));
    this.timers.clear();
  }
}