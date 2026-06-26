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

  exportReportPdf() {
    const dr = this.draftReport();
    if (!dr) return;

    const r      = dr.report;
    const org    = 'Evidara M&E';
    const date   = new Date(dr.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const style  = dr.style.charAt(0).toUpperCase() + dr.style.slice(1);

    const section = (title: string, body: string | null | undefined) => {
      if (!body) return '';
      const escaped = (body ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const paragraphs = escaped.split('\n').filter(l => l.trim()).map(l => `<p>${l}</p>`).join('');
      return `
        <div class="section">
          <h2>${title}</h2>
          ${paragraphs}
        </div>`;
    };

    const flags = r.qualityFlags?.length
      ? `<div class="flags"><strong>⚠ Data quality notes</strong><ul>${r.qualityFlags.map(f => `<li>${f}</li>`).join('')}</ul></div>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${r.title ?? 'Progress Report'}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 11pt;
    line-height: 1.7;
    color: #1a1a2e;
    background: #fff;
  }
  .page { max-width: 750px; margin: 0 auto; padding: 40px 50px; }

  /* Cover strip */
  .cover {
    background: #1e3a5f;
    color: #fff;
    padding: 40px 50px 30px;
    margin: -40px -50px 40px;
  }
  .cover .eyebrow {
    font-family: Arial, sans-serif;
    font-size: 9pt;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.7;
    margin-bottom: 10px;
  }
  .cover h1 {
    font-size: 22pt;
    font-weight: normal;
    letter-spacing: 0.01em;
    margin-bottom: 8px;
    line-height: 1.3;
  }
  .cover .meta {
    font-family: Arial, sans-serif;
    font-size: 9.5pt;
    opacity: 0.75;
    margin-top: 14px;
    display: flex;
    gap: 24px;
  }
  .cover .meta span::before { opacity: 0.5; margin-right: 6px; }

  /* Sections */
  .section {
    margin-bottom: 30px;
    padding-bottom: 24px;
    border-bottom: 1px solid #e8ecf1;
  }
  .section:last-child { border-bottom: none; }
  h2 {
    font-family: Arial, sans-serif;
    font-size: 11.5pt;
    font-weight: 700;
    color: #1e3a5f;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 2px solid #1e3a5f;
  }
  p { margin-bottom: 8px; }
  p:last-child { margin-bottom: 0; }

  /* Quality flags */
  .flags {
    background: #fffbeb;
    border-left: 4px solid #d97706;
    padding: 12px 16px;
    margin-bottom: 28px;
    border-radius: 0 4px 4px 0;
    font-family: Arial, sans-serif;
    font-size: 9.5pt;
  }
  .flags strong { display: block; margin-bottom: 6px; color: #92400e; }
  .flags ul { padding-left: 18px; }
  .flags li { margin-bottom: 4px; color: #78350f; }

  /* Footer */
  .footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 2px solid #1e3a5f;
    font-family: Arial, sans-serif;
    font-size: 8.5pt;
    color: #6b7280;
    display: flex;
    justify-content: space-between;
  }

  @media print {
    body { font-size: 10.5pt; }
    .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .flags { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .section { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="cover">
    <div class="eyebrow">Progress Report · Generated by Evidara M&amp;E Copilot</div>
    <h1>${r.title ?? 'Progress Report'}</h1>
    <div class="meta">
      <span>📅 ${date}</span>
      <span>📝 Style: ${style}</span>
    </div>
  </div>

  ${flags}

  ${section('Executive Summary', r.executiveSummary)}
  ${section('Indicator Performance', r.indicatorPerformance)}
  ${section('Activities Narrative', r.activitiesNarrative)}
  ${section('Challenges &amp; Lessons Learned', r.challengesAndLessons)}
  ${r.financialSummary ? section('Financial Summary', r.financialSummary) : ''}
  ${r.stakeholderVoice ? section('Stakeholder Voice', r.stakeholderVoice) : ''}
  ${section('Next Period Plans', r.nextPeriodPlans)}

  <div class="footer">
    <span>Generated by Evidara M&amp;E Copilot · ${org}</span>
    <span>${date}</span>
  </div>
</div>
<script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  onEnterKey(event: Event) {
    const ke = event as KeyboardEvent;
    if (!ke.shiftKey) {
      ke.preventDefault();
      this.sendMessage();
    }
  }

  exportTocPdf() {
    const toc = this.tocResult();
    if (!toc) return;
    const project = this.projects().find(p => p._id === this.tocProjectId());
    const projectName = project?.name ?? 'Project';
    const date = new Date(toc.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const escaped = toc.theoryOfChange
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const formatted = escaped.split('\n').filter(l => l.trim()).map(l => {
      const trimmed = l.trim();
      if (/^\d+\./.test(trimmed) || /^#{1,3}/.test(trimmed) || trimmed.endsWith(':')) {
        return `<h2>${trimmed.replace(/^#+\s*/, '').replace(/:$/, '')}</h2>`;
      }
      return `<p>${trimmed}</p>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Theory of Change — ${projectName}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Georgia','Times New Roman',serif; font-size:11pt; line-height:1.7; color:#1a1a2e; }
  .page { max-width:750px; margin:0 auto; padding:40px 50px; }
  .cover { background:#14532d; color:#fff; padding:40px 50px 30px; margin:-40px -50px 40px; }
  .cover .eyebrow { font-family:Arial,sans-serif; font-size:9pt; letter-spacing:0.12em; text-transform:uppercase; opacity:0.7; margin-bottom:10px; }
  .cover h1 { font-size:22pt; font-weight:normal; line-height:1.3; margin-bottom:8px; }
  .cover .meta { font-family:Arial,sans-serif; font-size:9.5pt; opacity:0.75; margin-top:14px; }
  h2 { font-family:Arial,sans-serif; font-size:11.5pt; font-weight:700; color:#14532d; text-transform:uppercase; letter-spacing:0.08em; margin:24px 0 10px; padding-bottom:6px; border-bottom:2px solid #14532d; }
  p { margin-bottom:8px; }
  .footer { margin-top:48px; padding-top:16px; border-top:2px solid #14532d; font-family:Arial,sans-serif; font-size:8.5pt; color:#6b7280; display:flex; justify-content:space-between; }
  @media print { .cover { -webkit-print-color-adjust:exact; print-color-adjust:exact; } h2 { page-break-after:avoid; } }
</style></head>
<body><div class="page">
  <div class="cover">
    <div class="eyebrow">Theory of Change · Generated by Evidara M&amp;E Copilot</div>
    <h1>${projectName}</h1>
    <div class="meta">📅 ${date}</div>
  </div>
  ${formatted}
  <div class="footer"><span>Generated by Evidara M&amp;E Copilot</span><span>${date}</span></div>
</div>
<script>window.onload = () => { window.print(); }</script>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  getField(obj: Record<string, string>, key: string): string {
    return obj[key] ?? '—';
  }

  copyDefinitionJson(d: Record<string, string>) {
    navigator.clipboard.writeText(JSON.stringify(d, null, 2));
  }

  priorityIcon(p: string) {
    return { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' }[p] ?? '⚪';
  }
}