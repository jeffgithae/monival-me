import { Injectable, signal, inject } from '@angular/core';
import { ApiService } from './api.service';

/**
 * The kinds of records this app can collect offline. Each maps to its own
 * sync endpoint on the server (see ApiService.offlineSync* methods) — adding
 * a new offline-capable form means adding one entry here, one API method,
 * and one case in the `syncBatch` switch below.
 */
export type OfflineEntityType = 'activity' | 'beneficiary' | 'formResponse';

/**
 * A single queued record awaiting sync. `payload` is kept as
 * `Record<string, unknown>` rather than a specific DTO type so this layer
 * doesn't depend on, and go stale against, any one entity's DTO shape — the
 * server validates on sync regardless.
 */
export interface QueuedItem {
  clientId: string;
  entityType: OfflineEntityType;
  /** Short human label for the queue UI, e.g. an activity title or beneficiary name. */
  label: string;
  payload: Record<string, unknown>;
  queuedAt: string;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'error';
  syncError?: string;
}

const DB_NAME = 'monival-offline';
const DB_VERSION = 2; // v2: generalized store, was activities-only in v1
const STORE = 'queued-items';
const LEGACY_STORE = 'queued-activities'; // v1 store name, migrated on upgrade

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;

      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientId' });
      }

      // Migrate any items left in the v1 activities-only store so a device
      // that went offline before this update doesn't silently lose queued
      // work when the app updates underneath it.
      if (oldVersion < 2 && db.objectStoreNames.contains(LEGACY_STORE)) {
        const tx = (req.transaction)!;
        const legacy = tx.objectStore(LEGACY_STORE);
        const newStore = tx.objectStore(STORE);
        legacy.openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const old = cursor.value;
            newStore.put({
              clientId: old.clientId,
              entityType: 'activity',
              label: old.payload?.title ?? 'Activity',
              payload: old.payload,
              queuedAt: old.queuedAt,
              syncStatus: old.syncStatus,
              syncError: old.syncError,
            });
            cursor.continue();
          }
        };
        db.deleteObjectStore(LEGACY_STORE);
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
   * Queue a record for later sync. Returns the clientId immediately so the
   * UI can show "saved locally" without waiting on any network call.
   */
  async enqueue(entityType: OfflineEntityType, payload: Record<string, unknown>, label: string): Promise<string> {
    const clientId = generateClientId();
    const item: QueuedItem = {
      clientId,
      entityType,
      label,
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

  async getAll(): Promise<QueuedItem[]> {
    const db = await openDb();
    const items = await new Promise<QueuedItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as QueuedItem[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  }

  /** Convenience filter — used by pages that only care about their own entity type's queue. */
  async getAllOfType(entityType: OfflineEntityType): Promise<QueuedItem[]> {
    return (await this.getAll()).filter(i => i.entityType === entityType);
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

  private async updateStatus(clientId: string, syncStatus: QueuedItem['syncStatus'], syncError?: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const getReq = store.get(clientId);
      getReq.onsuccess = () => {
        const item = getReq.result as QueuedItem | undefined;
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
   * Push everything queued to its corresponding offline-sync endpoint,
   * grouped by entity type since each type syncs to a different route. Safe
   * to call repeatedly — already-synced items are removed locally, and the
   * server itself is idempotent on clientId for anything that slipped
   * through.
   */
  async syncAll(): Promise<void> {
    if (this.isSyncing()) return; // avoid overlapping sync runs
    const pending = (await this.getAll()).filter(i => i.syncStatus === 'pending' || i.syncStatus === 'error');
    if (pending.length === 0) return;

    this.isSyncing.set(true);
    for (const item of pending) await this.updateStatus(item.clientId, 'syncing');

    let totalSynced = 0, totalSkipped = 0, totalFailed = 0;

    // Group by entity type — each type has its own sync endpoint and its
    // own batch, so a failure syncing activities shouldn't block
    // beneficiaries (or vice versa) from syncing in the same pass.
    const byType = new Map<OfflineEntityType, QueuedItem[]>();
    for (const item of pending) {
      if (!byType.has(item.entityType)) byType.set(item.entityType, []);
      byType.get(item.entityType)!.push(item);
    }

    for (const [entityType, items] of byType) {
      const batch = items.map(i => ({ ...i.payload, clientId: i.clientId }));

      try {
        const res = await this.syncBatch(entityType, batch);
        for (const r of res.results) {
          if (r.status === 'synced' || r.status === 'skipped') {
            await this.remove(r.clientId);
            totalSynced  += r.status === 'synced'  ? 1 : 0;
            totalSkipped += r.status === 'skipped' ? 1 : 0;
          } else {
            await this.updateStatus(r.clientId, 'error', r.message);
            totalFailed++;
          }
        }
      } catch {
        // Network-level failure (not a per-item error) — leave this type's
        // batch queued as 'pending' so the next online event or manual
        // retry picks it back up.
        for (const item of items) await this.updateStatus(item.clientId, 'pending');
        totalFailed += items.length;
      }
    }

    this.lastSyncResult.set({ synced: totalSynced, skipped: totalSkipped, failed: totalFailed });
    this.isSyncing.set(false);
    await this.refreshPendingCount();
  }

  private syncBatch(
    entityType: OfflineEntityType,
    batch: Record<string, unknown>[],
  ): Promise<{ results: Array<{ clientId: string; status: string; message?: string }> }> {
    const call = entityType === 'activity'      ? this.api.offlineSyncActivities(batch)
                : entityType === 'beneficiary'   ? this.api.offlineSyncBeneficiaries(batch)
                : /* formResponse */               this.api.offlineSyncFormResponses(batch);

    return new Promise((resolve, reject) => {
      call.subscribe({ next: (res: any) => resolve(res), error: reject });
    });
  }
}
