import { Injectable, signal } from '@angular/core';

export type ToastType = 'error' | 'success' | 'warning' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

let nextId = 0;

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  show(message: string, type: ToastType = 'info', duration = 5000) {
    const id = ++nextId;
    this.toasts.update(t => [...t, { id, type, message, duration }]);
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
    return id;
  }

  error(message: string, duration = 7000)   { return this.show(message, 'error',   duration); }
  success(message: string, duration = 4000) { return this.show(message, 'success', duration); }
  warning(message: string, duration = 5000) { return this.show(message, 'warning', duration); }
  info(message: string, duration = 4000)    { return this.show(message, 'info',    duration); }

  dismiss(id: number) {
    this.toasts.update(t => t.filter(toast => toast.id !== id));
  }

  dismissAll() {
    this.toasts.set([]);
  }
}