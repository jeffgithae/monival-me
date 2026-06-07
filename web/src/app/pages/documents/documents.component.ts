import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { OrgDocument, DocumentVersion, Project } from '../../core/models';

const CATEGORIES = ['Report', 'Evidence', 'Policy', 'Agreement', 'Financial', 'Training', 'Other'];
const CATEGORY_ICONS: Record<string, string> = {
  Report: '📄', Evidence: '🔍', Policy: '📋', Agreement: '📝',
  Financial: '💰', Training: '📚', Other: '📁',
};

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, DatePipe],
  templateUrl: './documents.component.html',
  styleUrl:    './documents.component.scss',
})
export class DocumentsComponent implements OnInit {
  private api = inject(ApiService);
  auth        = inject(AuthService);
  private fb  = inject(FormBuilder);

  // Data
  documents = signal<OrgDocument[]>([]);
  projects  = signal<Project[]>([]);
  versions  = signal<DocumentVersion[]>([]);
  loading   = signal(true);
  error     = signal('');

  // Filters
  searchQuery     = signal('');
  filterCategory  = signal('');
  filterProject   = signal('');

  // Panels
  showCreatePanel  = signal(false);
  selectedDoc      = signal<OrgDocument | null>(null);
  showVersionPanel = signal(false);
  showEditPanel    = signal(false);
  saving           = signal(false);
  deleting         = signal('');
  loadingVersions  = signal(false);

  readonly categories = CATEGORIES;
  readonly categoryIcons = CATEGORY_ICONS;

  canManage = computed(() =>
    this.auth.isOwner() || this.auth.isAdmin() || this.auth.isMEOfficer()
  );

  createForm = this.fb.group({
    title:       ['', Validators.required],
    description: [''],
    projectId:   [''],
    category:    ['Other'],
    tags:        [''],
    fileUrl:     [''],
  });

  editForm = this.fb.group({
    title:       ['', Validators.required],
    description: [''],
    category:    [''],
    tags:        [''],
    fileUrl:     [''],
  });

  versionForm = this.fb.group({
    releaseNotes: [''],
    fileUrl:      ['', Validators.required],
  });

  filteredDocs = computed(() => {
    let docs = this.documents();
    const q = this.searchQuery().toLowerCase();
    const cat = this.filterCategory();
    const proj = this.filterProject();
    if (q) docs = docs.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q) ||
      d.tags?.some(t => t.toLowerCase().includes(q))
    );
    if (cat)  docs = docs.filter(d => d.category === cat);
    if (proj) docs = docs.filter(d => d.projectId === proj);
    return docs;
  });

  categoryCounts = computed(() => {
    const docs = this.documents();
    const counts: Record<string, number> = { All: docs.length };
    for (const cat of CATEGORIES) counts[cat] = docs.filter(d => d.category === cat).length;
    return counts;
  });

  ngOnInit() {
    this.load();
    this.api.projects().subscribe({
      next: (res: any) => this.projects.set(Array.isArray(res) ? res : (res.data ?? [])),
      error: () => {},
    });
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.documents().subscribe({
      next: docs => { this.documents.set(docs); this.loading.set(false); },
      error: err => { this.error.set(err.error?.message || 'Failed to load documents'); this.loading.set(false); },
    });
  }

  create() {
    if (this.createForm.invalid) return;
    this.saving.set(true);
    const v = this.createForm.value;
    const dto = {
      title: v.title!,
      description: v.description || undefined,
      projectId: v.projectId || undefined,
      category: v.category || 'Other',
      tags: v.tags ? v.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      fileUrl: v.fileUrl || undefined,
    };
    this.api.createDocument(dto).subscribe({
      next: () => {
        this.createForm.reset({ category: 'Other' });
        this.showCreatePanel.set(false);
        this.saving.set(false);
        this.load();
      },
      error: err => { this.error.set(err.error?.message || 'Create failed'); this.saving.set(false); },
    });
  }

  openEdit(doc: OrgDocument) {
    this.selectedDoc.set(doc);
    this.showEditPanel.set(true);
    this.editForm.patchValue({
      title: doc.title,
      description: doc.description ?? '',
      category: doc.category ?? 'Other',
      tags: (doc.tags ?? []).join(', '),
      fileUrl: doc.fileUrl ?? '',
    });
  }

  saveEdit() {
    const doc = this.selectedDoc();
    if (!doc || this.editForm.invalid) return;
    this.saving.set(true);
    const v = this.editForm.value;
    this.api.updateDocument(doc._id, {
      title: v.title!,
      description: v.description || undefined,
      category: v.category || undefined,
      tags: v.tags ? v.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      fileUrl: v.fileUrl || undefined,
    }).subscribe({
      next: () => { this.showEditPanel.set(false); this.saving.set(false); this.load(); },
      error: err => { this.error.set(err.error?.message || 'Update failed'); this.saving.set(false); },
    });
  }

  deleteDoc(doc: OrgDocument) {
    if (!confirm(`Delete "${doc.title}"? This will also delete all versions. This cannot be undone.`)) return;
    this.deleting.set(doc._id);
    this.api.deleteDocument(doc._id).subscribe({
      next: () => { this.deleting.set(''); this.load(); },
      error: err => { this.error.set(err.error?.message || 'Delete failed'); this.deleting.set(''); },
    });
  }

  openVersions(doc: OrgDocument) {
    this.selectedDoc.set(doc);
    this.showVersionPanel.set(true);
    this.loadingVersions.set(true);
    this.versions.set([]);
    this.versionForm.reset();
    this.api.documentVersions(doc._id).subscribe({
      next: vs => { this.versions.set(vs); this.loadingVersions.set(false); },
      error: () => this.loadingVersions.set(false),
    });
  }

  addVersion() {
    const doc = this.selectedDoc();
    if (!doc || this.versionForm.invalid) return;
    this.saving.set(true);
    const v = this.versionForm.value;
    this.api.createDocumentVersion(doc._id, {
      releaseNotes: v.releaseNotes || undefined,
      fileUrl: v.fileUrl!,
    }).subscribe({
      next: newVer => {
        this.versions.update(vs => [newVer, ...vs]);
        this.versionForm.reset();
        this.saving.set(false);
        // Update the doc's fileUrl to point to latest version
        this.documents.update(docs => docs.map(d =>
          d._id === doc._id ? { ...d, fileUrl: newVer.fileUrl ?? d.fileUrl } : d
        ));
      },
      error: err => { this.error.set(err.error?.message || 'Version upload failed'); this.saving.set(false); },
    });
  }

  categoryIcon(cat?: string): string { return CATEGORY_ICONS[cat ?? ''] ?? '📁'; }

  projectName(id?: string): string {
    return this.projects().find(p => p._id === id)?.name ?? '';
  }

  closeAll() {
    this.showCreatePanel.set(false);
    this.showEditPanel.set(false);
    this.showVersionPanel.set(false);
    this.selectedDoc.set(null);
  }
}