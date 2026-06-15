import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  consequence?: string;   // e.g. "This will permanently delete 3 projects and all their data."
  confirmLabel?: string;  // default: "Confirm"
  cancelLabel?: string;   // default: "Cancel"
  danger?: boolean;       // red confirm button
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly isOpen   = signal(false);
  readonly options  = signal<ConfirmOptions>({ title: '', message: '' });

  private resolve!: (result: boolean) => void;

  /**
   * Show a confirmation dialog and return a Promise<boolean>.
   * Replaces all uses of window.confirm().
   *
   * Usage:
   *   if (await this.confirm.ask({ title: 'Delete project?', ... })) {
   *     // user clicked Confirm
   *   }
   */
  ask(opts: ConfirmOptions): Promise<boolean> {
    this.options.set(opts);
    this.isOpen.set(true);
    return new Promise<boolean>(res => { this.resolve = res; });
  }

  confirm() {
    this.isOpen.set(false);
    this.resolve(true);
  }

  cancel() {
    this.isOpen.set(false);
    this.resolve(false);
  }
}