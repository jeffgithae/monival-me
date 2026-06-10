import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import {
  OrgDocument,
  DocumentVersion,
  Project,
  CloudStorageConnection,
  CloudFile,
  CloudProvider,
} from '../../core/models';

const CATEGORIES = ['Report', 'Evidence', 'Policy', 'Agreement', 'Financial', 'Training', 'Other'];
const CATEGORY_ICONS: Record<string, string> = {
  Report: '📄', Evidence: '🔍', Policy: '📋', Agreement: '📝',
  Financial: '💰', Training: '📚', Other: '📁',
};

const PROVIDER_META: Record<CloudProvider, { label: string; icon: string; color: string }> = {
  google_drive: { label: 'Google Drive', icon: '🔵', color: '#4285F4' },
  dropbox:      { label: 'Dropbox',      icon: '🟦', color: '#0061FF' },
  sharepoint:   { label: 'SharePoint',   icon: '🟩', color: '#038387' },
};

type Panel = 'none' | 'create' | 'edit' | 'versions' | 'cloud-manager' | 'cloud-browser';

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, DatePipe],
  templateUrl: './documents.component.html',
  styleUrl: './documents.component.scss',
})
export class DocumentsComponent implements OnInit {
  private api = inject(ApiService);
  auth        = inject(AuthService);
  private fb  = inject(FormBuilder);

  // ── Core data ──────────────────────────────────────────────────────────────
  documents  = signal<OrgDocument[]>([]);
  projects   = signal<Project[]>([]);
  versions   = signal<DocumentVersion[]>([]);
  loading    = signal(true);
  error      = signal('');

  // ── Filters ────────────────────────────────────────────────────────────────
  searchQuery    = signal('');
  filterCategory = signal('');
  filterProject  = signal('');

  // ── Panels ─────────────────────────────────────────────────────────────────
  activePanel     = signal<Panel>('none');
  selectedDoc     = signal<OrgDocument | null>(null);
  saving          = signal(false);
  deleting        = signal('');
  loadingVersions = signal(false);

  // ── Cloud storage ──────────────────────────────────────────────────────────
  cloudConnections   = signal<CloudStorageConnection[]>([]);
  loadingConnections = signal(false);
  connectingProvider = signal<CloudProvider | null>(null);

  // Cloud browser
  activeBrowserConn  = signal<CloudStorageConnection | null>(null);
  cloudFiles         = signal<CloudFile[]>([]);
  loadingCloudFiles  = signal(false);
  cloudFolderStack   = signal<Array<{ id: string; name: string }>>([]);
  cloudSearch        = signal('');
  importingFileId    = signal('');
  importProjectId    = signal('');
  importCategory     = signal('Other');
  cloudError         = signal('');

  readonly categories    = CATEGORIES;
  readonly categoryIcons = CATEGORY_ICONS;
  readonly providerMeta  = PROVIDER_META;
  readonly providers: CloudProvider[] = ['google_drive', 'dropbox', 'sharepoint'];

  canManage = computed(() =>
    this.auth.isOwner() || this.auth.isAdmin() || this.auth.isMEOfficer()
  );

  // ── Forms ──────────────────────────────────────────────────────────────────
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

  // ── Computed ───────────────────────────────────────────────────────────────
  filteredDocs = computed(() => {
    let docs = this.documents();
    const q    = this.searchQuery().toLowerCase();
    const cat  = this.filterCategory();
    const proj = this.filterProject();
    if (q)    docs = docs.filter(d =>
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

  cloudFolderName = computed(() => {
    const stack = this.cloudFolderStack();
    return stack.length ? stack[stack.length - 1].name : 'Root';
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit() {
    this.load();
    this.api.projects().subscribe({
      next: (res: any) => this.projects.set(Array.isArray(res) ? res : (res.data ?? [])),
      error: () => {},
    });
  }

  // ── Document CRUD ──────────────────────────────────────────────────────────
  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.documents().subscribe({
      next: docs => { this.documents.set(docs); this.loading.set(false); },
      error: err  => { this.error.set(err.error?.message || 'Failed to load documents'); this.loading.set(false); },
    });
  }

  create() {
    if (this.createForm.invalid) return;
    this.saving.set(true);
    const v = this.createForm.value;
    const dto = {
      title:       v.title!,
      description: v.description || undefined,
      projectId:   v.projectId   || undefined,
      category:    v.category    || 'Other',
      tags:        v.tags ? v.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      fileUrl:     v.fileUrl     || undefined,
    };
    this.api.createDocument(dto).subscribe({
      next: () => {
        this.createForm.reset({ category: 'Other' });
        this.closeAll();
        this.saving.set(false);
        this.load();
      },
      error: err => { this.error.set(err.error?.message || 'Create failed'); this.saving.set(false); },
    });
  }

  openEdit(doc: OrgDocument) {
    this.selectedDoc.set(doc);
    this.activePanel.set('edit');
    this.editForm.patchValue({
      title:       doc.title,
      description: doc.description ?? '',
      category:    doc.category    ?? 'Other',
      tags:        (doc.tags ?? []).join(', '),
      fileUrl:     doc.fileUrl     ?? '',
    });
  }

  saveEdit() {
    const doc = this.selectedDoc();
    if (!doc || this.editForm.invalid) return;
    this.saving.set(true);
    const v = this.editForm.value;
    this.api.updateDocument(doc._id, {
      title:       v.title!,
      description: v.description || undefined,
      category:    v.category    || undefined,
      tags:        v.tags ? v.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      fileUrl:     v.fileUrl     || undefined,
    }).subscribe({
      next: () => { this.closeAll(); this.saving.set(false); this.load(); },
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
    this.activePanel.set('versions');
    this.loadingVersions.set(true);
    this.versions.set([]);
    this.versionForm.reset();
    this.api.documentVersions(doc._id).subscribe({
      next: vs => { this.versions.set(vs); this.loadingVersions.set(false); },
      error: ()  => this.loadingVersions.set(false),
    });
  }

  addVersion() {
    const doc = this.selectedDoc();
    if (!doc || this.versionForm.invalid) return;
    this.saving.set(true);
    const v = this.versionForm.value;
    this.api.createDocumentVersion(doc._id, {
      releaseNotes: v.releaseNotes || undefined,
      fileUrl:      v.fileUrl!,
    }).subscribe({
      next: newVer => {
        this.versions.update(vs => [newVer, ...vs]);
        this.versionForm.reset();
        this.saving.set(false);
        this.documents.update(docs => docs.map(d =>
          d._id === doc._id ? { ...d, fileUrl: newVer.fileUrl ?? d.fileUrl } : d
        ));
      },
      error: err => { this.error.set(err.error?.message || 'Version upload failed'); this.saving.set(false); },
    });
  }

  // ── Cloud Storage Management ───────────────────────────────────────────────
  openCloudManager() {
    this.activePanel.set('cloud-manager');
    this.loadConnections();
  }

  loadConnections() {
    this.loadingConnections.set(true);
    this.cloudError.set('');
    this.api.cloudConnections().subscribe({
      next: conns => { this.cloudConnections.set(conns); this.loadingConnections.set(false); },
      error: ()   => this.loadingConnections.set(false),
    });
  }

  connectProvider(provider: CloudProvider) {
    this.connectingProvider.set(provider);
    const redirectUri = `${window.location.origin}/documents?cloud_callback=1&provider=${provider}`;
    const state = `${provider}_${Date.now()}`;

    this.api.cloudAuthUrl(provider, redirectUri, state).subscribe({
      next: ({ authUrl }) => {
        // Store state for CSRF verification on return
        sessionStorage.setItem('cloud_oauth_state', state);
        sessionStorage.setItem('cloud_oauth_provider', provider);
        window.location.href = authUrl;
      },
      error: err => {
        this.cloudError.set(err.error?.message || 'Failed to get auth URL');
        this.connectingProvider.set(null);
      },
    });
  }

  /** Called on page load when ?cloud_callback=1 is in the URL (OAuth redirect return) */
  handleOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code     = params.get('code');
    const state    = params.get('state');
    const provider = params.get('provider') as CloudProvider | null;
    const error    = params.get('error');

    if (error) {
      this.error.set(`Cloud connection cancelled: ${error}`);
      return;
    }
    if (!code || !provider) return;

    const storedState = sessionStorage.getItem('cloud_oauth_state');
    if (storedState && storedState !== state) {
      this.error.set('OAuth state mismatch — possible CSRF. Please try again.');
      return;
    }
    sessionStorage.removeItem('cloud_oauth_state');
    sessionStorage.removeItem('cloud_oauth_provider');

    // Clean URL
    window.history.replaceState({}, '', '/documents');

    this.activePanel.set('cloud-manager');
    this.connectingProvider.set(provider);
    const redirectUri = `${window.location.origin}/documents?cloud_callback=1&provider=${provider}`;

    this.api.connectCloudStorage({ provider, code, redirectUri }).subscribe({
      next: () => {
        this.connectingProvider.set(null);
        this.loadConnections();
      },
      error: err => {
        this.cloudError.set(err.error?.message || 'Connection failed. Please try again.');
        this.connectingProvider.set(null);
      },
    });
  }

  disconnectProvider(conn: CloudStorageConnection) {
    if (!confirm(`Disconnect "${conn.label}"? Documents already imported will remain, but you won't be able to browse this account's files.`)) return;
    this.api.removeCloudConnection(conn._id).subscribe({
      next: () => this.loadConnections(),
      error: err => this.cloudError.set(err.error?.message || 'Disconnect failed'),
    });
  }

  // ── Cloud File Browser ─────────────────────────────────────────────────────
  openBrowser(conn: CloudStorageConnection) {
    this.activeBrowserConn.set(conn);
    this.cloudFiles.set([]);
    this.cloudFolderStack.set([]);
    this.cloudSearch.set('');
    this.cloudError.set('');
    this.activePanel.set('cloud-browser');
    this.fetchCloudFiles();
  }

  fetchCloudFiles() {
    const conn = this.activeBrowserConn();
    if (!conn) return;
    const stack    = this.cloudFolderStack();
    const folderId = stack.length ? stack[stack.length - 1].id : undefined;
    const search   = this.cloudSearch().trim() || undefined;

    this.loadingCloudFiles.set(true);
    this.cloudError.set('');
    this.api.listCloudFiles(conn._id, folderId, search).subscribe({
      next: files => { this.cloudFiles.set(files); this.loadingCloudFiles.set(false); },
      error: err  => {
        this.cloudError.set(err.error?.message || 'Failed to browse files');
        this.loadingCloudFiles.set(false);
      },
    });
  }

  enterFolder(file: CloudFile) {
    if (!file.isFolder) return;
    this.cloudFolderStack.update(s => [...s, { id: file.id, name: file.name }]);
    this.fetchCloudFiles();
  }

  navigateUp() {
    this.cloudFolderStack.update(s => s.slice(0, -1));
    this.fetchCloudFiles();
  }

  navigateToRoot() {
    this.cloudFolderStack.set([]);
    this.fetchCloudFiles();
  }

  searchCloud() {
    this.cloudFolderStack.set([]);
    this.fetchCloudFiles();
  }

  clearSearch() {
    this.cloudSearch.set('');
    this.fetchCloudFiles();
  }

  importFile(file: CloudFile) {
    const conn = this.activeBrowserConn();
    if (!conn || file.isFolder) return;
    this.importingFileId.set(file.id);
    this.cloudError.set('');

    this.api.importCloudFile({
      connectionId: conn._id,
      fileId:       file.id,
      fileName:     file.name,
      fileUrl:      file.webViewLink,
      mimeType:     file.mimeType,
      projectId:    this.importProjectId() || undefined,
      category:     this.importCategory()  || 'Other',
    }).subscribe({
      next: () => {
        this.importingFileId.set('');
        this.load(); // refresh document list
        // Brief success message
        this.error.set('');
      },
      error: err => {
        this.cloudError.set(err.error?.message || 'Import failed');
        this.importingFileId.set('');
      },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  categoryIcon(cat?: string): string { return CATEGORY_ICONS[cat ?? ''] ?? '📁'; }

  projectName(id?: string): string {
    return this.projects().find(p => p._id === id)?.name ?? '';
  }

  providerLabel(p: CloudProvider): string  { return PROVIDER_META[p]?.label ?? p; }
  providerIcon(p: CloudProvider): string   { return PROVIDER_META[p]?.icon ?? '☁️'; }
  providerColor(p: CloudProvider): string  { return PROVIDER_META[p]?.color ?? '#666'; }

  isConnected(provider: CloudProvider): boolean {
    return this.cloudConnections().some(c => c.provider === provider);
  }

  getConnection(provider: CloudProvider): CloudStorageConnection | undefined {
    return this.cloudConnections().find(c => c.provider === provider);
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  getFileIcon(mimeType?: string): string {
    if (!mimeType) return '📄';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📊';
    if (mimeType.includes('document') || mimeType.includes('word')) return '📝';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('video')) return '🎬';
    if (mimeType.includes('audio')) return '🎵';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return '🗜️';
    return '📄';
  }

  closeAll() {
    this.activePanel.set('none');
    this.selectedDoc.set(null);
    this.activeBrowserConn.set(null);
    this.cloudFiles.set([]);
    this.cloudSearch.set('');
    this.cloudFolderStack.set([]);
    this.cloudError.set('');
    this.importingFileId.set('');
  }
}