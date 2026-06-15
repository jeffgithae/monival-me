import { Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

export interface Breadcrumb {
  label: string;
  route?: string;
}

const ROUTE_MAP: Record<string, string> = {
  'dashboard':          'Dashboard',
  'projects':           'Projects',
  'strategic':          'Strategic Overview',
  'budget':             'Budget',
  'bsc':                'Balanced Scorecard',
  'okrs':               'OKRs',
  'reporting':          'Reporting',
  'donors':             'Donors',
  'grants':             'Grants',
  'beneficiaries':      'Beneficiaries',
  'documents':          'Documents',
  'data-collection':    'Data Collection',
  'workflows':          'Workflows',
  'workplan':           'Workplan',
  'ai':                 'AI Copilot',
  'audit':              'Audit Log',
  'enterprise':         'Enterprise',
  'profile':            'Profile',
  'settings':           'Settings',
  'team':               'Team',
  'billing':            'Billing',
  'impact-stories':     'Impact Stories',
};

@Injectable({ providedIn: 'root' })
export class BreadcrumbService {
  readonly crumbs = signal<Breadcrumb[]>([]);

  // Allow individual pages to override the last crumb label (e.g. project name)
  private overrides = new Map<string, string>();

  constructor(private readonly router: Router) {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.build((e as NavigationEnd).urlAfterRedirects);
      });
  }

  /** Call from a page component to set a human-readable label for a dynamic segment */
  setLabel(segment: string, label: string) {
    this.overrides.set(segment, label);
    // Rebuild with updated overrides
    this.build(this.router.url);
  }

  private build(url: string) {
    // Strip query string and leading slash
    const path = url.split('?')[0].replace(/^\//, '');
    const segments = path.split('/').filter(Boolean);

    const crumbs: Breadcrumb[] = [];
    let accumulated = '';

    for (const seg of segments) {
      accumulated += '/' + seg;
      const label =
        this.overrides.get(seg) ??
        ROUTE_MAP[seg] ??
        this.toTitleCase(seg);
      crumbs.push({ label, route: accumulated });
    }

    // Last crumb is current page — no link
    if (crumbs.length > 0) {
      crumbs[crumbs.length - 1] = { label: crumbs[crumbs.length - 1].label };
    }

    this.crumbs.set(crumbs);
  }

  private toTitleCase(s: string): string {
    return s
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
}