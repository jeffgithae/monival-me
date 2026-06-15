import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

export interface PaletteCommand {
  id: string;
  label: string;
  description?: string;
  icon: string;
  category: 'navigate' | 'action' | 'recent';
  action: () => void;
  keywords?: string[];
}

@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  readonly isOpen = signal(false);
  readonly query  = signal('');

  private _commands: PaletteCommand[] = [];

  constructor(private readonly router: Router) {
    this._commands = this.buildStaticCommands();
  }

  open()  { this.isOpen.set(true);  this.query.set(''); }
  close() { this.isOpen.set(false); this.query.set(''); }
  toggle() { this.isOpen() ? this.close() : this.open(); }

  get filteredCommands(): PaletteCommand[] {
    const q = this.query().toLowerCase().trim();
    if (!q) return this._commands.slice(0, 8);
    return this._commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.keywords?.some(k => k.toLowerCase().includes(q))
    ).slice(0, 10);
  }

  /** Register dynamic commands (e.g. recent projects) at runtime */
  register(commands: PaletteCommand[]) {
    // Remove stale dynamic entries of same ids, add new ones
    const staticIds = new Set(this.buildStaticCommands().map(c => c.id));
    this._commands = [
      ...this.buildStaticCommands(),
      ...commands.filter(c => !staticIds.has(c.id)),
    ];
  }

  private buildStaticCommands(): PaletteCommand[] {
    return [
      { id: 'nav-dashboard',    label: 'Dashboard',           icon: '🏠', category: 'navigate', action: () => this.go('/dashboard'),       keywords: ['home', 'overview'] },
      { id: 'nav-projects',     label: 'Projects',            icon: '📁', category: 'navigate', action: () => this.go('/projects'),        keywords: ['program'] },
      { id: 'nav-indicators',   label: 'Indicators',          icon: '📊', category: 'navigate', action: () => this.go('/projects'),        keywords: ['logframe', 'targets', 'results'] },
      { id: 'nav-activities',   label: 'Activities',          icon: '📝', category: 'navigate', action: () => this.go('/projects'),        keywords: ['events', 'sessions'] },
      { id: 'nav-reporting',    label: 'Reporting',           icon: '📋', category: 'navigate', action: () => this.go('/reporting'),       keywords: ['periods', 'reports'] },
      { id: 'nav-donors',       label: 'Donors',              icon: '🤝', category: 'navigate', action: () => this.go('/donors'),          keywords: ['funders', 'partners'] },
      { id: 'nav-grants',       label: 'Grants',              icon: '💰', category: 'navigate', action: () => this.go('/grants'),          keywords: ['funding', 'awards'] },
      { id: 'nav-budget',       label: 'Budget',              icon: '💳', category: 'navigate', action: () => this.go('/budget'),          keywords: ['finance', 'expenditure'] },
      { id: 'nav-beneficiaries',label: 'Beneficiaries',       icon: '👥', category: 'navigate', action: () => this.go('/beneficiaries'),   keywords: ['people', 'participants'] },
      { id: 'nav-documents',    label: 'Documents',           icon: '📄', category: 'navigate', action: () => this.go('/documents'),       keywords: ['files', 'evidence'] },
      { id: 'nav-data',         label: 'Data Collection',     icon: '🗂', category: 'navigate', action: () => this.go('/data-collection'), keywords: ['forms', 'surveys'] },
      { id: 'nav-workflows',    label: 'Workflows',           icon: '🔄', category: 'navigate', action: () => this.go('/workflows'),       keywords: ['approvals', 'review'] },
      { id: 'nav-workplan',     label: 'Workplan',            icon: '📅', category: 'navigate', action: () => this.go('/workplan'),        keywords: ['tasks', 'schedule'] },
      { id: 'nav-bsc',          label: 'Balanced Scorecard',  icon: '🎯', category: 'navigate', action: () => this.go('/bsc'),            keywords: ['strategic', 'kpi'] },
      { id: 'nav-okrs',         label: 'OKRs',                icon: '🎪', category: 'navigate', action: () => this.go('/okrs'),           keywords: ['objectives', 'results'] },
      { id: 'nav-ai',           label: 'AI Copilot',          icon: '🤖', category: 'navigate', action: () => this.go('/ai'),             keywords: ['generate', 'write', 'report'] },
      { id: 'nav-audit',        label: 'Audit Log',           icon: '🔍', category: 'navigate', action: () => this.go('/audit'),          keywords: ['history', 'changes'] },
      { id: 'nav-team',         label: 'Team Settings',       icon: '👤', category: 'navigate', action: () => this.go('/settings/team'),  keywords: ['members', 'users'] },
      { id: 'nav-billing',      label: 'Billing & Plan',      icon: '💳', category: 'navigate', action: () => this.go('/settings/billing'), keywords: ['subscription', 'upgrade'] },
      { id: 'nav-enterprise',   label: 'Enterprise Settings', icon: '🏢', category: 'navigate', action: () => this.go('/enterprise'),     keywords: ['sso', 'api keys', 'webhooks'] },
      { id: 'nav-profile',      label: 'My Profile',          icon: '👤', category: 'navigate', action: () => this.go('/profile'),        keywords: ['account', 'password', 'mfa'] },
    ];
  }

  private go(route: string) {
    this.close();
    void this.router.navigate([route]);
  }
}