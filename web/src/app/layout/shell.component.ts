import { DatePipe } from '@angular/common';
import { Component, signal, OnInit, DestroyRef, inject, computed, effect } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import { roleLabel } from '../core/roles';
import { AppNotification, NavItem } from '../core/models';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ThemeService } from '../core/theme.service';
import { CommandPaletteService } from '../shared/command-palette.service';
import { LogoComponent } from '../shared/logo.component';
import { ConfirmDialogComponent } from '../shared/confirm-dialog.component';
import { OfflineQueueService } from '../core/offline-queue.service';

/** 24×24 stroke icons for the sidebar, keyed by nav item id. */
const NAV_ICONS: Record<string, string> = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z',
  workflows: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 12.2l2.4 2.4 4.6-4.9',
  projects: 'M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  workplan: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  strategic: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 11.9v.2',
  bsc: 'M4 4v16h16M8 16v-4M12 16V8M16 16v-6',
  okrs: 'M5 21V4h11l-2 4 2 4H5',
  'field-collect': 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 8a2.2 2.2 0 1 0 0 4.4A2.2 2.2 0 0 0 12 8z',
  'data-collection': 'M8 4h8v3H8zM8 5.5H5v15h14v-15h-3M9 11h6M9 15h6',
  beneficiaries: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.5 2.4 3.5 5.2',
  feedback: 'M4 5h16v11H9l-5 4z',
  donors: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z',
  grants: 'M3 7h18v10H3zM12 9.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zM6.5 10v.1M17.5 14v.1',
  budget: 'M12 3v9h9a9 9 0 1 1-9-9zM15.5 3.6A9 9 0 0 1 20.4 8.5h-4.9z',
  'exchange-rates': 'M4 8h13l-3-3M20 16H7l3 3',
  insights: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  map: 'M9 4L3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20',
  roi: 'M6 3h12v18H6zM9 7h6M9 12v.1M12 12v.1M15 12v.1M9 16v.1M12 16v.1M15 16v.1',
  ai: 'M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8zM18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  reporting: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  'donor-reports': 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  'data-reporting': 'M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14',
  stories: 'M3 5.5c3-1 6-.6 9 1.5v13c-3-2-6-2.5-9-1.5zM21 5.5c-3-1-6-.6-9 1.5v13c3-2 6-2.5 9-1.5z',
  documents: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
  audit: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  team: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c0-3.6 3.3-6 7.5-6s7.5 2.4 7.5 6',
  billing: 'M3 6h18v12H3zM3 10h18M7 15h3',
  enterprise: 'M5 21V4h10v17M15 9h4v12M3 21h18M8.5 8h3M8.5 12h3M8.5 16h3',
};
const NAV_ICON_FALLBACK = 'M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, DatePipe,
    LogoComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  readonly roleLabel = roleLabel;
  readonly navIcon = (id: string) => NAV_ICONS[id] ?? NAV_ICON_FALLBACK;
  readonly sidebarOpen = signal(false);
  readonly notificationsOpen = signal(false);
  private pollTimer?: ReturnType<typeof setInterval>;

  readonly notifications = signal<AppNotification[]>([]);
  readonly unreadCount = signal(0);

  private readonly destroyRef = inject(DestroyRef);
  readonly palette = inject(CommandPaletteService);
  readonly offlineQueue = inject(OfflineQueueService);

  constructor(
    readonly auth: AuthService,
    readonly theme: ThemeService,
    private readonly api: ApiService,
    private readonly router: Router
  ) {
    // A signed-in user with no organisation (abandoned mid-registration)
    // can't use any org-scoped page — every call 403s. Send them back to
    // finish workspace setup instead of showing a wall of errors.
    effect(() => {
      const user = this.auth.user();
      if (user && !user.organizationId) {
        this.router.navigate(['/register'], { queryParams: { setup: 'true' } });
      }
    });
  }

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
    // Cleared on destroy — an uncleared interval keeps polling the API after
    // the shell is gone, and stacks another timer on every re-mount.
    this.pollTimer = setInterval(() => this.loadNotifications(), 60_000);
    this.destroyRef.onDestroy(() => {
      if (this.pollTimer !== undefined) clearInterval(this.pollTimer);
    });
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