import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import {
  CopilotChatMessage, CopilotResponse, DraftReportResponse,
  ToCResponse, IndicatorDefinitionResponse, SuggestActionsResponse,
  Project, ReportingPeriod, Indicator,
} from '../../core/models';

type Tab = 'chat' | 'report' | 'toc' | 'indicator' | 'actions';
type ReportStyle = 'narrative' | 'bullet' | 'executive';

@Component({
  selector: 'app-ai-copilot',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './ai-copilot.component.html',
  styleUrl: './ai-copilot.component.scss',
})
export class AiCopilotComponent implements OnInit {
  private readonly api = inject(ApiService);

  // ── Shared state ───────────────────────────────────────────────────────────
  activeTab    = signal<Tab>('chat');
  projects     = signal<Project[]>([]);
  indicators   = signal<Indicator[]>([]);
  periods      = signal<ReportingPeriod[]>([]);
  selectedProjectId = signal('');
  loading      = signal(false);
  error        = signal('');

  // ── Chat ───────────────────────────────────────────────────────────────────
  chatHistory  = signal<CopilotChatMessage[]>([]);
  chatInput    = signal('');
  lastResponse = signal<CopilotResponse | null>(null);

  readonly suggestedPrompts = [
    'What should I prioritise for reporting this week?',
    'Which indicators are behind target?',
    'How is our grant burn rate tracking against impact?',
    'Are there activities waiting for approval?',
    'What data gaps exist in our current reporting period?',
  ];

  // ── Report drafter ─────────────────────────────────────────────────────────
  reportPeriodId   = signal('');
  reportStyle      = signal<ReportStyle>('narrative');
  reportFinancials = signal(true);
  reportFeedback   = signal(true);
  draftReport      = signal<DraftReportResponse | null>(null);

  // ── Theory of Change ───────────────────────────────────────────────────────
  tocProjectId = signal('');
  tocResult    = signal<ToCResponse | null>(null);

  // ── Indicator Definition ───────────────────────────────────────────────────
  indTitle   = signal('');
  indLevel   = signal('output');
  indSector  = signal('');
  indUnit    = signal('');
  indResult  = signal<IndicatorDefinitionResponse | null>(null);

  // ── Suggest Actions ────────────────────────────────────────────────────────
  actionsProjectId = signal('');
  actionsResult    = signal<SuggestActionsResponse | null>(null);

  readonly priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

  readonly sortedActions = computed(() => {
    const r = this.actionsResult();
    if (!r) return [];
    return [...r.actions].sort(
      (a, b) => (this.priorityOrder[a.priority] ?? 9) - (this.priorityOrder[b.priority] ?? 9),
    );
  });

  ngOnInit() {
    this.api.projects().subscribe({ next: ps => this.projects.set(ps), error: () => {} });
    this.api.indicators().subscribe({ next: is => this.indicators.set(is), error: () => {} });
  }

  setTab(t: Tab) {
    this.activeTab.set(t);
    this.error.set('');
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  sendMessage(prompt?: string) {
    const msg = (prompt ?? this.chatInput()).trim();
    if (!msg || this.loading()) return;

    const userMsg: CopilotChatMessage = { role: 'user', content: msg };
    this.chatHistory.update(h => [...h, userMsg]);
    this.chatInput.set('');
    this.loading.set(true);
    this.error.set('');

    // Send only assistant/user turns (not the latest user msg — backend appends it with context)
    const history = this.chatHistory().slice(0, -1);

    this.api.copilotMessage(msg, this.selectedProjectId() || undefined, history).subscribe({
      next: res => {
        const assistantMsg: CopilotChatMessage = { role: 'assistant', content: res.answer };
        this.chatHistory.update(h => [...h, assistantMsg]);
        this.lastResponse.set(res);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.error?.message || 'Copilot could not respond right now.');
        // Remove the user message we optimistically added
        this.chatHistory.update(h => h.slice(0, -1));
        this.loading.set(false);
      },
    });
  }

  clearChat() {
    this.chatHistory.set([]);
    this.lastResponse.set(null);
    this.error.set('');
  }

  // ── Report Drafter ────────────────────────────────────────────────────────
  generateReport() {
    if (!this.reportPeriodId() || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.draftReport.set(null);

    this.api.copilotDraftReport(this.reportPeriodId(), {
      style: this.reportStyle(),
      includeFinancials: this.reportFinancials(),
      includeFeedback: this.reportFeedback(),
    }).subscribe({
      next: r => { this.draftReport.set(r); this.loading.set(false); },
      error: err => { this.error.set(err.error?.message || 'Report generation failed.'); this.loading.set(false); },
    });
  }

  loadPeriodsForProject(projectId: string) {
    this.reportPeriodId.set('');
    if (!projectId) { this.periods.set([]); return; }
    this.api.reportingPeriods({ projectId }).subscribe({
      next: (res: any) => this.periods.set(Array.isArray(res) ? res : (res.data ?? [])),
      error: () => {},
    });
  }

  copySection(text: string | null | undefined) {
    if (text) navigator.clipboard.writeText(text);
  }

  // ── Theory of Change ─────────────────────────────────────────────────────
  generateToC() {
    if (!this.tocProjectId() || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.tocResult.set(null);
    this.api.copilotToC(this.tocProjectId()).subscribe({
      next: r => { this.tocResult.set(r); this.loading.set(false); },
      error: err => { this.error.set(err.error?.message || 'Theory of Change generation failed.'); this.loading.set(false); },
    });
  }

  // ── Indicator Definition ─────────────────────────────────────────────────
  generateIndicatorDef() {
    if (!this.indTitle().trim() || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.indResult.set(null);
    this.api.copilotIndicatorDefinition({
      title: this.indTitle(),
      level: this.indLevel(),
      sector: this.indSector() || undefined,
      unit: this.indUnit() || undefined,
    }).subscribe({
      next: r => { this.indResult.set(r); this.loading.set(false); },
      error: err => { this.error.set(err.error?.message || 'Indicator definition generation failed.'); this.loading.set(false); },
    });
  }

  // ── Suggest Actions ───────────────────────────────────────────────────────
  loadActions() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.actionsResult.set(null);
    this.api.copilotSuggestActions(this.actionsProjectId() || undefined).subscribe({
      next: r => { this.actionsResult.set(r); this.loading.set(false); },
      error: err => { this.error.set(err.error?.message || 'Action suggestions failed.'); this.loading.set(false); },
    });
  }

  priorityIcon(p: string) {
    return { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' }[p] ?? '⚪';
  }
}