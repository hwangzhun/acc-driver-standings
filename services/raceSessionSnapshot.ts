const DB_NAME = 'acc-race-session-snapshots';
const STORE = 'byRaceId';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error ?? new Error('indexedDB.open failed'));
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'raceId' });
            }
        };
        req.onsuccess = () => resolve(req.result);
    });
}

/** 保存管理员导入的完整 JSON 文本，供 #/race/:id 复用单场 UI */
export async function putRaceSessionSnapshot(raceId: number, jsonText: string): Promise<void> {
    const db = await openDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('IDB transaction failed'));
            tx.objectStore(STORE).put({ raceId, jsonText, updatedAt: Date.now() });
        });
    } finally {
        db.close();
    }
}

export async function getRaceSessionSnapshot(raceId: number): Promise<string | null> {
    const db = await openDb();
    try {
        return await new Promise<string | null>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            tx.onerror = () => reject(tx.error ?? new Error('IDB read failed'));
            const r = tx.objectStore(STORE).get(raceId);
            r.onsuccess = () => {
                const row = r.result as { raceId: number; jsonText: string } | undefined;
                resolve(row?.jsonText ?? null);
            };
            r.onerror = () => reject(r.error ?? new Error('IDB get failed'));
        });
    } finally {
        db.close();
    }
}
