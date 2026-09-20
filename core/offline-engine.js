// core/offline-engine.js
import { supabase } from './supabase-client.js';
import { showToast } from './ui-core.js';

const DB_NAME = 'MM_GodCache';
const DB_VERSION = 5; // Bumped to initialize the Action-Aware Queue

const STORE_CACHE = 'MM_DataCache_v2';
const STORE_QUEUE = 'MM_SyncQueue_v2';

const isNative = window.Capacitor && window.Capacitor.isNativePlatform();
const syncChannel = new BroadcastChannel('mm_sync_bus');

class IroncladOfflineEngine {
    constructor() {
        this.dbPromise = this.initDB();
        this.isSyncing = false;
        this.syncInterval = 10000; 
        this.syncMutex = Promise.resolve();
        
        setInterval(() => this.processQueue(), this.syncInterval);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === 'hidden') this.processQueue();
        });
        window.addEventListener('online', () => this.processQueue());
    }

    initDB() {
        if (isNative) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_CACHE)) db.createObjectStore(STORE_CACHE);
                if (!db.objectStoreNames.contains(STORE_QUEUE)) db.createObjectStore(STORE_QUEUE, { keyPath: 'queue_key' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(null);
        });
    }

    async setCache(key, data) {
        if (isNative) return false;
        try {
            const db = await this.dbPromise;
            if (!db) return false;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_CACHE, 'readwrite');
                if (data === null) tx.objectStore(STORE_CACHE).delete(key);
                else tx.objectStore(STORE_CACHE).put(data, key);
                tx.oncomplete = () => {
                    syncChannel.postMessage({ action: 'CACHE_UPDATED', key });
                    resolve(true);
                };
                tx.onerror = () => reject(false);
            });
        } catch(e) { return false; }
    }

    async getCache(key) {
        if (isNative) return null;
        try {
            const db = await this.dbPromise;
            if (!db) return null;
            return new Promise((resolve) => {
                const tx = db.transaction(STORE_CACHE, 'readonly');
                const req = tx.objectStore(STORE_CACHE).get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch(e) { return null; }
    }

    async getAllCacheKeys() {
        if (isNative) return [];
        try {
            const db = await this.dbPromise;
            if (!db) return [];
            return new Promise((resolve) => {
                const tx = db.transaction(STORE_CACHE, 'readonly');
                const req = tx.objectStore(STORE_CACHE).getAllKeys();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });
        } catch(e) { return []; }
    }

    // 🧠 UPGRADE: Added 'action' parameter to support Offline Deletions
    async queueMutation(table, recordId, payload, action = 'UPSERT') {
        if (isNative) return; 
        
        this.syncMutex = this.syncMutex.then(async () => {
            const queueKey = `${table}_${recordId}`;
            const task = { queue_key: queueKey, table, payload, action, timestamp: Date.now() };

            try {
                const db = await this.dbPromise;
                if (!db) return false;
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_QUEUE, 'readwrite');
                    tx.objectStore(STORE_QUEUE).put(task); 
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => reject(false);
                });
            } catch(e) { return false; }
        }).catch(() => false);
        
        return this.syncMutex;
    }

    async forceSync() {
        await this.processQueue();
    }

    async processQueue() {
        if (this.isSyncing || !navigator.onLine) return;
        
        try {
            const db = await this.dbPromise;
            if (!db) return;

            const tasks = await new Promise(resolve => {
                const tx = db.transaction(STORE_QUEUE, 'readonly');
                const req = tx.objectStore(STORE_QUEUE).getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve([]);
            });

            if (tasks.length === 0) return;
            this.isSyncing = true;

            const upserts = { meal_logs: [], transactions: [], duty_logs: [], profiles: [], announcements: [] };
            const deletes = []; // Store tasks marked for deletion

            tasks.forEach(t => { 
                if (t.action === 'DELETE') deletes.push(t);
                else if (upserts[t.table]) upserts[t.table].push(t.payload); 
            });

            const promises = [];
            
            // 1. Process Upserts
            Object.keys(upserts).forEach(table => {
                if (upserts[table].length > 0) promises.push(supabase.from(table).upsert(upserts[table]));
            });

            // 2. Process Deletes dynamically
            deletes.forEach(delTask => {
                promises.push(supabase.from(delTask.table).delete().eq('id', delTask.payload.id));
            });

            const results = await Promise.all(promises);

            for (let res of results) {
                if (res.error && (res.error.code === '42501' || res.error.code === '401')) {
                    this.executeNuclearPurge("Admin has suspended access. Securely wiping device.");
                    return;
                }
                if (res.error) throw res.error;
            }

            await new Promise((resolve) => {
                const tx = db.transaction(STORE_QUEUE, 'readwrite');
                const store = tx.objectStore(STORE_QUEUE);
                tasks.forEach(syncedTask => {
                    const req = store.get(syncedTask.queue_key);
                    req.onsuccess = () => {
                        const currentTask = req.result;
                        if (currentTask && currentTask.timestamp === syncedTask.timestamp) {
                            store.delete(syncedTask.queue_key);
                        }
                    };
                });
                tx.oncomplete = () => resolve(true);
            });

        } catch (error) {
            console.warn("[Offline Engine] Sync delayed due to network turbulence.", error);
        } finally {
            this.isSyncing = false;
        }
    }

    executeNuclearPurge(reason) {
        if (window.indexedDB) window.indexedDB.deleteDatabase(DB_NAME);
        localStorage.clear();
        sessionStorage.clear();
        document.body.innerHTML = `
            <div class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-rose-600 text-white p-8 text-center">
                <svg class="w-16 h-16 mb-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                <h1 class="text-3xl font-black tracking-tight mb-3">Security Lockout</h1>
                <p class="text-[15px] font-bold opacity-90 leading-relaxed">${reason}</p>
            </div>
        `;
        setTimeout(() => window.location.replace('./index.html'), 3000);
    }
}

export const OfflineEngine = new IroncladOfflineEngine();
