import { Injectable, signal, inject } from '@angular/core';
import { ApiService } from './api.service';

/**
 * A single queued activity awaiting sync. Mirrors CreateActivityDto plus the
 * client-generated idempotency key the offline-sync endpoint requires.
 *
 * Kept as `Record<string, unknown>` rather than the full CreateActivityDto
 * type to avoid this offline layer depending on, and going stale against,
 * the API's DTO shape — the server validates on sync regardless.
 */
export interface QueuedActivity {
  clientId: string;
  payload: Record<string, unknown>;
  queuedAt: string;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'error';
  syncError?: string;
}

const DB_NAME = 'monival-offline';
const DB_VERSION = 1;
const STORE = 'queued-activities';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function generateClientId(): string {
  // crypto.randomUUID() is available in all browsers that support service
  // workers, so no uuid dependency is needed here.
  return crypto.randomUUID();
}

@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  private api = inject(ApiService);

  /** Reactive count of items still waiting to sync — drives the UI badge. */
  readonly pendingCount = signal(0);
  readonly isOnline = signal(navigator.onLine);
  readonly isSyncing = signal(false);
  readonly lastSyncResult = signal<{ synced: number; skipped: number; failed: number } | null>(null);

  constructor() {
    window.addEventListener('online', () => { this.isOnline.set(true); this.syncAll(); });
    window.addEventListener('offline', () => this.isOnline.set(false));
    this.refreshPendingCount();
  }

  /**
   * Queue an activity for later sync. Returns the clientId immediately so
   * the UI can show "saved locally" without waiting on any network call.
   */
  async enqueue(payload: Record<string, unknown>): Promise<string> {
    const clientId = generateClientId();
    const item: QueuedActivity = {
      clientId,
      payload,
      queuedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await this.refreshPendingCount();

    // Try an immediate sync if we're online — no need to wait for the next
    // 'online' event when connectivity was never actually lost.
    if (this.isOnline()) {
      this.syncAll();
    }
    return clientId;
  }

  async getAll(): Promise<QueuedActivity[]> {
    const db = await openDb();
    const items = await new Promise<QueuedActivity[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as QueuedActivity[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  }

  async remove(clientId: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(clientId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await this.refreshPendingCount();
  }

  private async updateStatus(clientId: string, syncStatus: QueuedActivity['syncStatus'], syncError?: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const getReq = store.get(clientId);
      getReq.onsuccess = () => {
        const item = getReq.result as QueuedActivity | undefined;
        if (item) {
          item.syncStatus = syncStatus;
          item.syncError = syncError;
          store.put(item);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async refreshPendingCount(): Promise<void> {
    const items = await this.getAll();
    this.pendingCount.set(items.filter(i => i.syncStatus !== 'synced').length);
  }

  /**
   * Push everything queued to the offline-sync endpoint. Safe to call
   * repeatedly — already-synced items are removed locally, and the server
   * itself is idempotent on clientId for anything that slipped through.
   */
  async syncAll(): Promise<void> {
    if (this.isSyncing()) return; // avoid overlapping sync runs
    const pending = (await this.getAll()).filter(i => i.syncStatus === 'pending' || i.syncStatus === 'error');
    if (pending.length === 0) return;

    this.isSyncing.set(true);
    for (const item of pending) await this.updateStatus(item.clientId, 'syncing');

    const batch = pending.map(i => ({ ...i.payload, clientId: i.clientId }));

    try {
      const res: any = await new Promise((resolve, reject) => {
        this.api.offlineSyncActivities(batch).subscribe({ next: resolve, error: reject });
      });

      let synced = 0, skipped = 0, failed = 0;
      for (const r of res.results as Array<{ clientId: string; status: string; message?: string }>) {
        if (r.status === 'synced' || r.status === 'skipped') {
          await this.remove(r.clientId);
          synced += r.status === 'synced' ? 1 : 0;
          skipped += r.status === 'skipped' ? 1 : 0;
        } else {
          await this.updateStatus(r.clientId, 'error', r.message);
          failed++;
        }
      }
      this.lastSyncResult.set({ synced, skipped, failed });
    } catch (err: any) {
      // Network-level failure (not a per-item error) — leave everything
      // queued as 'pending' so the next online event or manual retry
      // picks it back up.
      for (const item of pending) await this.updateStatus(item.clientId, 'pending');
      this.lastSyncResult.set({ synced: 0, skipped: 0, failed: pending.length });
    } finally {
      this.isSyncing.set(false);
      await this.refreshPendingCount();
    }
  }
}
