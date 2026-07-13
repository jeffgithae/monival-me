import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';

interface ImpactStory {
  _id: string;
  projectId?: string;
  title: string;
  narrative: string;
  pullQuote?: string;
  subjectName?: string;
  subjectLocation?: string;
  coverImageUrl?: string;
  consentObtained: boolean;
  isAnonymised: boolean;
  tags: string[];
  thematicArea?: string;
  sdgGoals: number[];
  status: 'draft' | 'review' | 'published' | 'archived';
  createdAt: string;
}

@Component({
  selector: 'app-impact-stories',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './impact-stories.component.html',
  styleUrl: './impact-stories.component.scss',
})
export class ImpactStoriesComponent implements OnInit {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);

  stories = signal<ImpactStory[]>([]);
  stats = signal<any>(null);
  projects = signal<Array<{ _id: string; name: string }>>([]);
  loading = signal(true);
  error = signal('');
  saving = signal(false);

  filterStatus = '';
  filterProject = '';
  search = '';

  showForm = signal(false);
  editing = signal<ImpactStory | null>(null);
  expanded = signal<string | null>(null);

  form = this.blankForm();

  readonly canEdit = computed(() => {
    const r = this.auth.user()?.role;
    return r === 'owner' || r === 'admin' || r === 'me_officer' || r === 'field_officer';
  });

  readonly statuses = ['draft', 'review', 'published', 'archived'] as const;

  ngOnInit() {
    this.load();
    this.api.projects().subscribe({
      next: (res: any) => this.projects.set(Array.isArray(res) ? res : (res.data ?? [])),
      error: () => {},
    });
  }

  private blankForm() {
    return {
      projectId: '', title: '', narrative: '', pullQuote: '',
      subjectName: '', subjectLocation: '', thematicArea: '',
      tags: '', consentObtained: false, isAnonymised: false,
    };
  }

  load() {
    this.loading.set(true);
    const params: Record<string, string> = {};
    if (this.filterStatus) params['status'] = this.filterStatus;
    if (this.filterProject) params['projectId'] = this.filterProject;
    if (this.search.trim()) params['search'] = this.search.trim();

    this.api.impactStories(params).subscribe({
      next: (res: any) => {
        this.stories.set(Array.isArray(res) ? res : (res.data ?? []));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load stories');
        this.loading.set(false);
      },
    });
    this.api.impactStoryStats().subscribe({ next: (s) => this.stats.set(s), error: () => {} });
  }

  projectName(id?: string): string {
    return this.projects().find((p) => p._id === id)?.name ?? '';
  }

  openCreate() {
    this.form = this.blankForm();
    this.editing.set(null);
    this.showForm.set(true);
  }

  openEdit(story: ImpactStory) {
    this.editing.set(story);
    this.form = {
      projectId: story.projectId ?? '',
      title: story.title,
      narrative: story.narrative,
      pullQuote: story.pullQuote ?? '',
      subjectName: story.subjectName ?? '',
      subjectLocation: story.subjectLocation ?? '',
      thematicArea: story.thematicArea ?? '',
      tags: (story.tags ?? []).join(', '),
      consentObtained: story.consentObtained,
      isAnonymised: story.isAnonymised,
    };
    this.showForm.set(true);
  }

  save() {
    this.error.set('');
    if (!this.form.title.trim() || !this.form.narrative.trim()) {
      this.error.set('A story needs at least a title and a narrative.');
      return;
    }
    this.saving.set(true);
    const body: any = {
      ...this.form,
      projectId: this.form.projectId || undefined,
      tags: this.form.tags ? this.form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    };
    const obs = this.editing()
      ? this.api.updateImpactStory(this.editing()!._id, body)
      : this.api.createImpactStory(body);
    obs.subscribe({
      next: () => { this.saving.set(false); this.showForm.set(false); this.load(); },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.message || 'Failed to save story');
      },
    });
  }

  setStatus(story: ImpactStory, status: string) {
    this.api.updateImpactStoryStatus(story._id, status).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(err?.error?.message || 'Failed to update status'),
    });
  }

  remove(story: ImpactStory) {
    if (!confirm(`Delete "${story.title}"? This cannot be undone.`)) return;
    this.api.deleteImpactStory(story._id).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(err?.error?.message || 'Failed to delete'),
    });
  }

  toggleExpand(id: string) {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  /** Next step in the draft → review → published lifecycle, if any. */
  nextStatus(s: ImpactStory): { value: string; label: string } | null {
    if (s.status === 'draft') return { value: 'review', label: 'Submit for review' };
    if (s.status === 'review') return { value: 'published', label: 'Publish' };
    if (s.status === 'published') return { value: 'archived', label: 'Archive' };
    return null;
  }
}
