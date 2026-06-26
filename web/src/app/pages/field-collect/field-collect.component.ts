import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { OfflineQueueService, QueuedItem } from '../../core/offline-queue.service';
import { Project, Indicator } from '../../core/models';

@Component({
  selector: 'app-field-collect',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './field-collect.component.html',
  styleUrl: './field-collect.component.scss',
})
export class FieldCollectComponent implements OnInit {
  private api = inject(ApiService);
  private fb  = inject(FormBuilder);
  queue = inject(OfflineQueueService);

  projects   = signal<Project[]>([]);
  indicators = signal<Indicator[]>([]);
  queued     = signal<QueuedItem[]>([]);
  saving     = signal(false);
  savedFlash = signal(false);
  locating   = signal(false);
  locationError = signal('');
  referenceDataStale = signal(false);

  readonly pendingQueued = computed(() => this.queued().filter(q => q.syncStatus !== 'synced'));

  form = this.fb.group({
    projectId:    ['', Validators.required],
    indicatorId:  [''],
    title:        ['', Validators.required],
    activityDate: [new Date().toISOString().slice(0, 10), Validators.required],
    location:     [''],
    district:     [''],
    village:      [''],
    latitude:     [null as number | null],
    longitude:    [null as number | null],
    participants: [null as number | null],
    quantity:     [null as number | null],
    evidenceUrl:  [''],
    notes:        [''],
  });

  ngOnInit() {
    // These reads hit the service-worker's cached copy automatically when
    // offline (see ngsw-config.json `reference-data` group) — no special
    // handling needed here beyond catching the error if even the cache
    // is empty (e.g. very first use, never been online on this device).
    this.api.projects().subscribe({
      next: ps => this.projects.set(ps),
      error: () => this.referenceDataStale.set(true),
    });
    this.api.indicators().subscribe({
      next: is => this.indicators.set(is),
      error: () => this.referenceDataStale.set(true),
    });
    this.refreshQueue();
  }

  async refreshQueue() {
    // Scoped to this page's entity type — a beneficiary or survey-response
    // queued elsewhere shouldn't show up in the activity queue here.
    this.queued.set(await this.queue.getAllOfType('activity'));
  }

  useMyLocation() {
    if (!('geolocation' in navigator)) {
      this.locationError.set('GPS is not available on this device.');
      return;
    }
    this.locating.set(true);
    this.locationError.set('');
    navigator.geolocation.getCurrentPosition(
      pos => {
        this.form.patchValue({
          latitude: Math.round(pos.coords.latitude * 1e6) / 1e6,
          longitude: Math.round(pos.coords.longitude * 1e6) / 1e6,
        });
        this.locating.set(false);
      },
      err => {
        this.locationError.set(err.message || 'Could not get your location.');
        this.locating.set(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async submit() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.value;

    const payload: Record<string, unknown> = {
      projectId: v.projectId,
      indicatorId: v.indicatorId || undefined,
      title: v.title,
      activityDate: v.activityDate,
      location: v.location || undefined,
      district: v.district || undefined,
      village: v.village || undefined,
      latitude: v.latitude ?? undefined,
      longitude: v.longitude ?? undefined,
      participants: v.participants ?? undefined,
      quantity: v.quantity ?? undefined,
      evidenceUrl: v.evidenceUrl || undefined,
      notes: v.notes || undefined,
      status: 'submitted',
    };

    // Always queue locally first — this is the whole point of an
    // offline-first form. If we're online, OfflineQueueService.enqueue()
    // triggers an immediate sync attempt right after saving locally, so
    // the perceived behaviour when connected is "submit and it's gone";
    // when offline it just sits in the queue until connectivity returns.
    await this.queue.enqueue('activity', payload, (v.title as string) || 'Activity');

    this.form.reset({
      projectId: v.projectId, // keep project selected for the next entry — field workers usually log several activities for the same project in one sitting
      activityDate: v.activityDate,
    });
    this.saving.set(false);
    this.savedFlash.set(true);
    setTimeout(() => this.savedFlash.set(false), 2500);
    await this.refreshQueue();
  }

  retrySync() {
    this.queue.syncAll().then(() => this.refreshQueue());
  }

  async discardQueued(clientId: string) {
    if (!confirm('Discard this unsynced activity? It has not been saved to the server.')) return;
    await this.queue.remove(clientId);
    await this.refreshQueue();
  }

  statusLabel(status: QueuedItem['syncStatus']): string {
    const m: Record<QueuedItem['syncStatus'], string> = {
      pending: 'Waiting to sync', syncing: 'Syncing…', synced: 'Synced', error: 'Sync failed',
    };
    return m[status];
  }
}
