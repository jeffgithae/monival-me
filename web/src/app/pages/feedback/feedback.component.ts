import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { canManageStakeholderFeedback } from '../../core/roles';
import {
  StakeholderFeedback, FeedbackAnalytics, FeedbackChannel, FeedbackSentiment,
  FeedbackStatus, Project, Indicator,
} from '../../core/models';

@Component({
  selector: 'app-feedback',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DatePipe, DecimalPipe],
  templateUrl: './feedback.component.html',
  styleUrl: './feedback.component.scss',
})
export class FeedbackComponent implements OnInit {
  private api  = inject(ApiService);
  private auth = inject(AuthService);
  private fb   = inject(FormBuilder);

  canManage = computed(() => canManageStakeholderFeedback(this.auth.user()?.role ?? 'viewer'));

  feedback    = signal<StakeholderFeedback[]>([]);
  analytics   = signal<FeedbackAnalytics | null>(null);
  projects    = signal<Project[]>([]);
  indicators  = signal<Indicator[]>([]);
  loading     = signal(true);
  saving      = signal(false);
  error       = signal('');
  showForm    = signal(false);
  selected    = signal<StakeholderFeedback | null>(null);

  // Filters
  filterStatus    = signal<FeedbackStatus | ''>('');
  filterChannel   = signal<FeedbackChannel | ''>('');
  filterSentiment = signal<FeedbackSentiment | ''>('');
  filterProject   = signal('');
  searchQuery     = signal('');
  page            = signal(1);
  total           = signal(0);
  limit           = 12;

  readonly channels: Array<{ id: FeedbackChannel; label: string }> = [
    { id: 'survey',                  label: 'Survey' },
    { id: 'interview',               label: 'Interview' },
    { id: 'focus_group_discussion',  label: 'Focus group' },
    { id: 'complaint',               label: 'Complaint' },
    { id: 'suggestion',              label: 'Suggestion' },
    { id: 'sms',                     label: 'SMS' },
    { id: 'social_media',            label: 'Social media' },
    { id: 'other',                   label: 'Other' },
  ];

  readonly sentiments: Array<{ id: FeedbackSentiment; label: string; icon: string }> = [
    { id: 'very_positive', label: 'Very positive', icon: '😄' },
    { id: 'positive',      label: 'Positive',      icon: '🙂' },
    { id: 'neutral',       label: 'Neutral',       icon: '😐' },
    { id: 'negative',      label: 'Negative',      icon: '🙁' },
    { id: 'very_negative', label: 'Very negative', icon: '😞' },
  ];

  readonly statuses: FeedbackStatus[] = ['received', 'reviewed', 'actioned', 'closed'];

  form = this.fb.group({
    title:              ['', Validators.required],
    content:            ['', Validators.required],
    channel:            ['survey' as FeedbackChannel],
    sentiment:          [''],
    projectId:          [''],
    indicatorId:        [''],
    thematicTags:       [''], // comma-separated, split on submit
    respondentName:     [''],
    respondentLocation: [''],
    isAnonymous:        [false],
    consentToPublish:   [false],
    mediaUrl:           [''],
    mediaType:          ['document' as 'image' | 'video' | 'audio' | 'document'],
  });

  actionForm = this.fb.group({
    status: ['reviewed' as FeedbackStatus, Validators.required],
    action: ['', Validators.required],
    notes:  [''],
  });

  ngOnInit() {
    this.api.projects().subscribe({ next: ps => this.projects.set(ps), error: () => {} });
    this.api.indicators().subscribe({ next: is => this.indicators.set(is), error: () => {} });
    this.loadAnalytics();
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.feedbackList({
      page: this.page(),
      limit: this.limit,
      status: this.filterStatus() || undefined,
      channel: this.filterChannel() || undefined,
      sentiment: this.filterSentiment() || undefined,
      projectId: this.filterProject() || undefined,
      search: this.searchQuery() || undefined,
    }).subscribe({
      next: res => {
        this.feedback.set(res.data);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.error?.message || 'Failed to load feedback');
        this.loading.set(false);
      },
    });
  }

  loadAnalytics() {
    this.api.feedbackAnalytics(this.filterProject() || undefined).subscribe({
      next: a => this.analytics.set(a),
      error: () => {},
    });
  }

  toggleForm() {
    this.showForm.update(v => !v);
    if (!this.showForm()) this.form.reset({ channel: 'survey', isAnonymous: false, consentToPublish: false, mediaType: 'document' });
  }

  submit() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.value;
    const media = v.mediaUrl
      ? [{ url: v.mediaUrl, type: v.mediaType ?? 'document' }]
      : [];

    this.api.createFeedback({
      title:    v.title!,
      content:  v.content!,
      channel:  v.channel || undefined,
      sentiment: (v.sentiment || undefined) as FeedbackSentiment | undefined,
      projectId: v.projectId || undefined,
      indicatorId: v.indicatorId || undefined,
      thematicTags: v.thematicTags ? v.thematicTags.split(',').map(t => t.trim()).filter(Boolean) : [],
      respondentName: v.respondentName || undefined,
      respondentLocation: v.respondentLocation || undefined,
      isAnonymous: v.isAnonymous ?? false,
      consentToPublish: v.consentToPublish ?? false,
      media,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toggleForm();
        this.page.set(1);
        this.load();
        this.loadAnalytics();
      },
      error: err => {
        this.error.set(err.error?.message || 'Failed to submit feedback');
        this.saving.set(false);
      },
    });
  }

  openDetail(f: StakeholderFeedback) {
    this.selected.set(f);
    this.actionForm.reset({ status: f.status === 'received' ? 'reviewed' : f.status, action: '', notes: '' });
  }

  closeDetail() { this.selected.set(null); }

  submitAction() {
    const f = this.selected();
    if (!f || this.actionForm.invalid) return;
    this.saving.set(true);
    const v = this.actionForm.value;
    this.api.actionFeedback(f._id, {
      status: v.status as FeedbackStatus,
      action: v.action!,
      notes:  v.notes || undefined,
    }).subscribe({
      next: updated => {
        this.selected.set(updated);
        this.saving.set(false);
        this.load();
        this.loadAnalytics();
      },
      error: err => {
        this.error.set(err.error?.message || 'Failed to log action');
        this.saving.set(false);
      },
    });
  }

  deleteFeedback(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    this.api.deleteFeedback(id).subscribe({
      next: () => {
        this.selected.set(null);
        this.load();
        this.loadAnalytics();
      },
      error: err => this.error.set(err.error?.message || 'Delete failed'),
    });
  }

  setStatusFilter(s: FeedbackStatus | '') { this.filterStatus.set(s); this.page.set(1); this.load(); }
  setChannelFilter(c: FeedbackChannel | '') { this.filterChannel.set(c); this.page.set(1); this.load(); }
  setSentimentFilter(s: FeedbackSentiment | '') { this.filterSentiment.set(s); this.page.set(1); this.load(); }
  setProjectFilter(p: string) { this.filterProject.set(p); this.page.set(1); this.load(); this.loadAnalytics(); }
  search() { this.page.set(1); this.load(); }
  clearSearch() { this.searchQuery.set(''); this.page.set(1); this.load(); }
  nextPage() { this.page.update(p => p + 1); this.load(); }
  prevPage() { this.page.update(p => Math.max(1, p - 1)); this.load(); }

  sentimentIcon(s?: FeedbackSentiment): string {
    return this.sentiments.find(x => x.id === s)?.icon ?? '—';
  }

  channelLabel(c: FeedbackChannel): string {
    return this.channels.find(x => x.id === c)?.label ?? c;
  }

  statusClass(s: FeedbackStatus): string { return s; }

  get totalPages() { return Math.ceil(this.total() / this.limit) || 1; }
  get hasNext()    { return this.page() < this.totalPages; }
  get hasPrev()    { return this.page() > 1; }
}