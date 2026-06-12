import { DatePipe } from '@angular/common';
import { Component, signal, OnInit, DestroyRef, inject, computed } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import { roleLabel } from '../core/roles';
import { AppNotification, NavItem } from '../core/models';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ThemeService } from '../core/theme.service';
import { ToastContainerComponent } from '../shared/toast-container.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DatePipe, ToastContainerComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  readonly roleLabel = roleLabel;
  readonly sidebarOpen = signal(false);
  readonly notificationsOpen = signal(false);

  readonly notifications = signal<AppNotification[]>([]);
  readonly unreadCount = signal(0);

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    readonly auth: AuthService,
    readonly theme: ThemeService,
    private readonly api: ApiService,
    private readonly router: Router
  ) {}

  /** Group nav items by section for rendering dividers */
  readonly groupedNav = computed(() => {
    const items = this.auth.navMenu();
    const groups: Array<{ section?: string; items: NavItem[] }> = [];
    let current: NavItem[] = [];
    let currentSection: string | undefined = undefined;

    for (const item of items) {
      if (item.section && item.section !== currentSection) {
        if (current.length > 0) {
          groups.push({ section: currentSection, items: current });
        }
        currentSection = item.section;
        current = [item];
      } else {
        current.push(item);
      }
    }
    if (current.length > 0) {
      groups.push({ section: currentSection, items: current });
    }
    return groups;
  });

  ngOnInit() {
    this.loadNotifications();
    setInterval(() => this.loadNotifications(), 60000);
  }

  loadNotifications() {
    if (!this.auth.user()) return;
    this.api.notifications({ limit: 50 }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.notifications.set(res.data);
        this.unreadCount.set(res.unreadCount);
      }
    });
  }

  toggleSidebar() { this.sidebarOpen.update(v => !v); }
  closeSidebar()  { this.sidebarOpen.set(false); }

  toggleNotifications() { this.notificationsOpen.update(v => !v); }
  closeNotifications()  { this.notificationsOpen.set(false); }

  markAsRead(id: string, link?: string) {
    this.api.markNotificationRead(id).subscribe(() => {
      this.notifications.update(list => list.map(n => n._id === id ? { ...n, isRead: true } : n));
      this.unreadCount.update(c => Math.max(0, c - 1));
      if (link) {
        this.router.navigateByUrl(link);
        this.closeNotifications();
      }
    });
  }

  markAllAsRead() {
    this.api.markAllNotificationsRead().subscribe(() => {
      this.notifications.update(list => list.map(n => ({ ...n, isRead: true })));
      this.unreadCount.set(0);
    });
  }
}