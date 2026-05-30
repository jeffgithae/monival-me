// web/src/app/shared/notifications/notification-bell.component.ts
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AppNotification } from '../../core/models';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
<div class="notification-bell" (clickOutside)="close()">
  <button class="bell-btn" (click)="toggle()" [class.has-unread]="unreadCount() > 0">
    🔔
    @if (unreadCount() > 0) {
      <span class="unread-badge">{{ unreadCount() > 99 ? '99+' : unreadCount() }}</span>
    }
  </button>

  @if (open()) {
    <div class="notif-dropdown">
      <div class="notif-header">
        <span>Notifications</span>
        @if (unreadCount() > 0) {
          <button class="btn btn-xs btn-ghost" (click)="markAllRead()">Mark all read</button>
        }
      </div>

      @if (loading()) {
        <div class="notif-loading">Loading…</div>
      } @else if (notifications().length === 0) {
        <div class="notif-empty">You're all caught up! ✅</div>
      } @else {
        <div class="notif-list">
          @for (n of notifications(); track n._id) {
            <div class="notif-item" [class.unread]="!n.isRead" (click)="handleClick(n)">
              <div class="notif-icon">{{ typeIcon(n.type) }}</div>
              <div class="notif-content">
                <div class="notif-title">{{ n.title }}</div>
                <div class="notif-msg">{{ n.message }}</div>
                <div class="notif-time">{{ n.createdAt | date:'d MMM, HH:mm' }}</div>
              </div>
              <button class="notif-dismiss" (click)="$event.stopPropagation(); dismiss(n._id)">✕</button>
            </div>
          }
        </div>
        @if (total() > notifications().length) {
          <div class="notif-footer">
            <button class="btn btn-ghost btn-sm" (click)="loadMore()">Load more</button>
          </div>
        }
      }
    </div>
  }
</div>
  `,
  styleUrl: './notification-bell.component.scss',
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  private api    = inject(ApiService);
  private router = inject(Router);

  notifications = signal<AppNotification[]>([]);
  unreadCount   = signal(0);
  total         = signal(0);
  loading       = signal(false);
  open          = signal(false);
  page          = 1;
  limit         = 10;

  private pollInterval: any;

  ngOnInit() {
    this.loadNotifications();
    // Poll every 60s for new notifications
    this.pollInterval = setInterval(() => this.loadNotifications(true), 60_000);
  }

  ngOnDestroy() { clearInterval(this.pollInterval); }

  toggle() {
    this.open.update(v => !v);
    if (this.open()) this.loadNotifications();
  }
  close() { this.open.set(false); }

  loadNotifications(silent = false) {
    if (!silent) this.loading.set(true);
    this.api.notifications({ page: 1, limit: this.limit }).subscribe({
      next: res => {
        this.notifications.set(res.data);
        this.unreadCount.set(res.unreadCount);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadMore() {
    this.page++;
    this.api.notifications({ page: this.page, limit: this.limit }).subscribe({
      next: res => {
        this.notifications.update(ns => [...ns, ...res.data]);
        this.total.set(res.total);
      }
    });
  }

  handleClick(n: AppNotification) {
    if (!n.isRead) this.markRead(n._id);
    this.close();
    if (n.link) this.router.navigateByUrl(n.link);
  }

  markRead(id: string) {
    this.api.markNotificationRead(id).subscribe(() => {
      this.notifications.update(ns => ns.map(n => n._id === id ? { ...n, isRead: true } : n));
      this.unreadCount.update(c => Math.max(0, c - 1));
    });
  }

  markAllRead() {
    this.api.markAllNotificationsRead().subscribe(() => {
      this.notifications.update(ns => ns.map(n => ({ ...n, isRead: true })));
      this.unreadCount.set(0);
    });
  }

  dismiss(id: string) {
    this.api.deleteNotification(id).subscribe(() => {
      const n = this.notifications().find(x => x._id === id);
      if (n && !n.isRead) this.unreadCount.update(c => Math.max(0, c - 1));
      this.notifications.update(ns => ns.filter(x => x._id !== id));
    });
  }

  typeIcon(type: string): string {
    const map: Record<string, string> = {
      activity_pending_review:  '📋',
      activity_approved:        '✅',
      activity_rejected:        '❌',
      grant_expiring_soon:      '⚠️',
      grant_report_due:         '📅',
      budget_threshold_warning: '💰',
      budget_threshold_critical:'🚨',
      period_due_soon:          '⏰',
      period_submitted:         '📤',
      period_approved:          '✅',
      team_invite_accepted:     '👋',
      indicator_target_missed:  '📉',
    };
    return map[type] ?? '🔔';
  }
}