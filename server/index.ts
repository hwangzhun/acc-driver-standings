import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express, { type Request, type Response, type RequestHandler } from 'express';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { STANDINGS_SCHEMA_SQL } from '../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SQLITE = path.join(ROOT, 'data', 'standings.sqlite');

const PORT = Number(process.env.PORT) || 5174;
const SQLITE_PATH = process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : DEFAULT_SQLITE;

const SORT_FIELDS = new Set(['points', 'license_points', 'total_races']);

type SortField = 'points' | 'license_points' | 'total_races';
type SortOrder = 'asc' | 'desc';

const DEFAULT_POSITION_POINTS: Record<number, number> = {
    1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
    6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
};

function readPositionPointsMap(): Record<number, number> {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'position_points_map'").get() as
        | { value: string }
        | undefined;
    if (!row) return { ...DEFAULT_POSITION_POINTS };
    try {
        const parsed = JSON.parse(row.value) as unknown;
        if (typeof parsed === 'object' && parsed !== null) {
            const result: Record<number, number> = {};
            for (const [k, v] of Object.entries(parsed)) {
                const pos = Number(k);
                const pts = Number(v);
                if (Number.isFinite(pos) && pos >= 1 && Number.isFinite(pts)) {
                    result[pos] = pts;
                }
            }
            return result;
        }
    } catch { /* fall through */ }
    return { ...DEFAULT_POSITION_POINTS };
}

// ── Admin auth ──────────────────────────────────────────────────────────────────

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? (() => {
    const generated = crypto.randomBytes(3).toString('hex');
    // eslint-disable-next-line no-console
    console.warn('\n[ADMIN] ADMIN_PASSWORD not set — using temporary password:', generated, '\n[ADMIN] Set ADMIN_PASSWORD env var and restart to use a permanent password.\n');
    return generated;
})();

/** token → expiresAt (ms timestamp) */
const tokenStore = new Map<string, number>();
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

function requireAdmin(req: Request, res: Response, next: (err?: unknown) => void) {
    const header = req.headers['authorization'] ?? '';
    const token = typeof header === 'string' ? header.replace(/^Bearer /i, '').trim() : '';
    if (!token || !tokenStore.has(token) || (tokenStore.get(token) ?? 0) < Date.now()) {
        if (token && tokenStore.has(token)) tokenStore.delete(token); // expired cleanup
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    next();
}

function ensureDataDir(filePath: string) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function openDatabase(): Database {
    ensureDataDir(SQLITE_PATH);
    const database = new Database(SQLITE_PATH);
    database.pragma('journal_mode = WAL');
    database.exec(STANDINGS_SCHEMA_SQL);

    const tierCol = database.prepare('PRAGMA table_info(drivers)').all() as Array<{ name: string }>;
    if (!tierCol.some((c) => c.name === 'tier')) {
        database.exec("ALTER TABLE drivers ADD COLUMN tier TEXT NOT NULL DEFAULT 'Rookie'");
    }

    database.exec(STANDINGS_SCHEMA_SQL);
    database.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('use_points', '1')").run();
    database.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('position_points_map', ?)").run(
        JSON.stringify(DEFAULT_POSITION_POINTS)
    );

    return database;
}

const db = openDatabase();

function getDriverBySteamId(steamId: string): { id: number } | undefined {
    return db.prepare('SELECT id FROM drivers WHERE steam_id = ?').get(steamId) as { id: number } | undefined;
}

function upsertDriver(name: string, steamId: string): { id: number; isNew: boolean } {
    const existing = getDriverBySteamId(steamId);
    if (existing) {
        db.prepare('UPDATE drivers SET name = ?, updated_at = datetime(\'now\') WHERE steam_id = ?').run(name, steamId);
        return { id: existing.id, isNew: false };
    }
    db.prepare('INSERT INTO drivers (name, steam_id) VALUES (?, ?)').run(name, steamId);
    const row = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
    return { id: Number(row.id), isNew: true };
}

function updateDriverStats(driverId: number) {
    db.prepare(`
        UPDATE drivers SET
            points = COALESCE((SELECT SUM(rr.points) FROM race_results rr WHERE rr.driver_id = ?), 0),
            total_races = COALESCE((SELECT COUNT(*) FROM race_results rr WHERE rr.driver_id = ?), 0),
            podium_count = COALESCE((SELECT COUNT(*) FROM race_results rr WHERE rr.driver_id = ? AND rr.is_podium = 1), 0),
            top10_count = COALESCE((SELECT COUNT(*) FROM race_results rr WHERE rr.driver_id = ? AND rr.is_top10 = 1), 0),
            ptw_count = COALESCE((SELECT COUNT(*) FROM race_results rr WHERE rr.driver_id = ? AND rr.is_ptw = 1), 0),
            updated_at = datetime('now')
        WHERE id = ?
    `).run(driverId, driverId, driverId, driverId, driverId, driverId);
}

function recalculateAllDriverStats() {
    const rows = db.prepare('SELECT id FROM drivers').all() as { id: number }[];
    for (const { id } of rows) {
        updateDriverStats(id);
    }
}

function importRaceResult(
    raceId: number,
    driverId: number,
    position: number,
    points: number,
    laps: number,
    totalTime: number,
    bestLap: number,
    rawData: string
) {
    const isPodium = position >= 1 && position <= 3 ? 1 : 0;
    const isTop10 = position >= 1 && position <= 10 ? 1 : 0;
    const isPtw = position === 1 ? 1 : 0;
    db.prepare(
        `INSERT INTO race_results (race_id, driver_id, position, points, laps, total_time, best_lap, is_podium, is_top10, is_ptw, raw_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(raceId, driverId, position, points, laps, totalTime, bestLap, isPodium, isTop10, isPtw, rawData);
}

const app = express();
app.use(express.json({ limit: '50mb' }));

// ── Admin auth routes ─────────────────────────────────────────────────────────

app.post('/api/admin/login', (req: Request, res: Response) => {
    const { password } = req.body as { password?: unknown };
    if (typeof password !== 'string' || !password) {
        res.status(400).json({ error: '密码不能为空' });
        return;
    }
    const inputBuf = Buffer.from(password, 'utf8');
    const storedBuf = Buffer.from(ADMIN_PASSWORD, 'utf8');
    if (inputBuf.length !== storedBuf.length || !crypto.timingSafeEqual(inputBuf, storedBuf)) {
        res.status(401).json({ error: '密码错误' });
        return;
    }
    const token = generateToken();
    tokenStore.set(token, Date.now() + TOKEN_TTL_MS);
    res.json({ token, expiresAt: Date.now() + TOKEN_TTL_MS });
});

app.get('/api/admin/me', requireAdmin, (_req: Request, res: Response) => {
    res.json({ ok: true });
});

app.post('/api/admin/logout', requireAdmin, (req: Request, res: Response) => {
    const header = req.headers['authorization'] ?? '';
    const token = typeof header === 'string' ? header.replace(/^Bearer /i, '').trim() : '';
    if (token) tokenStore.delete(token);
    res.json({ ok: true });
});

app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, sqlite: SQLITE_PATH });
});

app.get('/api/settings', (_req: Request, res: Response) => {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'use_points'").get() as
        | { value: string }
        | undefined;
    res.json({ usePoints: row?.value === '1', positionPointsMap: readPositionPointsMap() });
});

app.patch('/api/admin/settings', requireAdmin, (req: Request, res: Response) => {
    const { usePoints } = req.body as { usePoints?: unknown };
    if (typeof usePoints !== 'boolean') {
        res.status(400).json({ error: 'usePoints must be a boolean' });
        return;
    }
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('use_points', ?)").run(
        usePoints ? '1' : '0'
    );
    res.json({ usePoints });
});

app.patch('/api/admin/position-points', requireAdmin, (req: Request, res: Response) => {
    const { map } = req.body as { map?: unknown };
    if (typeof map !== 'object' || map === null || Array.isArray(map)) {
        res.status(400).json({ error: 'map must be an object' });
        return;
    }
    const rawEntries = Object.entries(map as Record<string, unknown>);
    const parsed: Record<number, number> = {};
    for (const [k, v] of rawEntries) {
        const pos = Number(k);
        const pts = Number(v);
        if (!Number.isFinite(pos) || pos < 1 || !Number.isInteger(pos)) {
            res.status(400).json({ error: `Invalid position key: ${k}` });
            return;
        }
        if (!Number.isFinite(pts)) {
            res.status(400).json({ error: `Invalid points value for position ${pos}` });
            return;
        }
        parsed[pos] = pts;
    }

    const jsonStr = JSON.stringify(parsed);
    const tx = db.transaction(() => {
        db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('position_points_map', ?)").run(jsonStr);
        db.prepare('UPDATE race_results SET points = 0').run();
        const countStmt = db.prepare('SELECT COUNT(*) as total FROM race_results').get() as { total: number };
        for (const [pos, pts] of Object.entries(parsed)) {
            db.prepare('UPDATE race_results SET points = ? WHERE position = ?').run(pts, Number(pos));
        }
        recalculateAllDriverStats();
        return countStmt.total;
    });

    try {
        const recalculatedRaceResults = tx();
        res.json({ ok: true, positionPointsMap: parsed, recalculatedRaceResults });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: msg });
    }
});

app.get('/api/drivers', (req: Request, res: Response) => {
    const sortField = (req.query.sort as string) || 'points';
    const sortOrder = (req.query.order as string) || 'desc';
    const search = typeof req.query.search === 'string' ? req.query.search : '';

    if (!SORT_FIELDS.has(sortField)) {
        res.status(400).json({ error: 'Invalid sort field' });
        return;
    }
    const dir = sortOrder === 'asc' ? 'ASC' : 'DESC';
    const col = sortField as SortField;

    const like = `%${search.replace(/%/g, '').replace(/_/g, '')}%`;
    const hasSearch = search.trim().length > 0;

    const sql = hasSearch
        ? `SELECT d.id, d.name, d.steam_id, d.points, d.license_points,
               d.total_races, d.podium_count, d.ptw_count, d.top10_count, d.tier
        FROM drivers d
        WHERE d.name LIKE ? OR d.steam_id LIKE ?
        ORDER BY d.${col} ${dir}, d.name ASC`
        : `SELECT d.id, d.name, d.steam_id, d.points, d.license_points,
               d.total_races, d.podium_count, d.ptw_count, d.top10_count, d.tier
        FROM drivers d
        ORDER BY d.${col} ${dir}, d.name ASC`;

    const rows = hasSearch
        ? db.prepare(sql).all(like, like)
        : db.prepare(sql).all();
    res.json(rows);
});

app.get('/api/drivers/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }
    const row = db.prepare('SELECT * FROM drivers WHERE id = ?').get(id);
    if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.json(row);
});

app.get('/api/drivers/:id/history', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }
    const rows = db.prepare(`
        SELECT r.id as race_id, r.race_name, r.track_name, r.race_date,
               rr.position, rr.points, rr.laps, rr.total_time, rr.best_lap,
               rr.is_podium, rr.is_top10, rr.is_ptw
        FROM race_results rr
        JOIN races r ON r.id = rr.race_id
        WHERE rr.driver_id = ?
        ORDER BY r.race_date DESC
    `).all(id);
    res.json(rows);
});

app.get('/api/drivers/:id/license-logs', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }
    const rows = db.prepare(
        'SELECT * FROM license_point_logs WHERE driver_id = ? ORDER BY created_at DESC'
    ).all(id);
    res.json(rows);
});

app.patch('/api/drivers/:id/tier', requireAdmin, (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }
    const { tier } = req.body as { tier?: unknown };
    const VALID_TIERS = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Platinum'];
    if (typeof tier !== 'string' || !VALID_TIERS.includes(tier)) {
        res.status(400).json({ error: 'Invalid tier value' });
        return;
    }
    const existing = db.prepare('SELECT id FROM drivers WHERE id = ?').get(id);
    if (!existing) {
        res.status(404).json({ error: 'Driver not found' });
        return;
    }
    db.prepare("UPDATE drivers SET tier = ?, updated_at = datetime('now') WHERE id = ?").run(tier, id);
    res.json({ ok: true });
});

app.post('/api/drivers/:id/license', requireAdmin, (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }
    const { changeValue, reason, operator } = req.body as {
        changeValue?: unknown;
        reason?: unknown;
        operator?: unknown;
    };
    if (typeof reason !== 'string' || !reason.trim()) {
        res.status(400).json({ error: '备注不能为空' });
        return;
    }
    const cv = Number(changeValue);
    if (!Number.isFinite(cv) || cv === 0) {
        res.status(400).json({ error: '变动分值不能为 0' });
        return;
    }

    const driver = db.prepare('SELECT id, license_points FROM drivers WHERE id = ?').get(id) as
        | { id: number; license_points: number }
        | undefined;
    if (!driver) {
        res.status(404).json({ error: '车手不存在' });
        return;
    }

    const current = driver.license_points;
    const after = Math.max(0, current + cv);
    if (cv < 0 && current + cv < 0) {
        res.status(400).json({ error: '驾照分不能低于 0' });
        return;
    }

    const op = typeof operator === 'string' ? operator : 'admin';
    db.prepare('UPDATE drivers SET license_points = ?, updated_at = datetime(\'now\') WHERE id = ?').run(after, id);
    db.prepare(
        `INSERT INTO license_point_logs (driver_id, change_value, before_points, after_points, reason, operator)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, cv, current, after, reason.trim(), op);

    res.json({ ok: true, after_points: after });
});

app.get('/api/races', (_req: Request, res: Response) => {
    const rows = db.prepare(
        'SELECT id, race_name, track_name, server_name, race_date, source_file_name, session_type, created_at FROM races ORDER BY race_date DESC, id DESC'
    ).all();
    res.json(rows);
});

app.get('/api/races/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }
    const row = db.prepare('SELECT * FROM races WHERE id = ?').get(id);
    if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.json(row);
});

app.get('/api/races/:id/results', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }
    const rows = db.prepare(`
        SELECT rr.*, d.name as driver_name, d.steam_id
        FROM race_results rr
        JOIN drivers d ON d.id = rr.driver_id
        WHERE rr.race_id = ?
        ORDER BY rr.position ASC
    `).all(id);
    res.json(rows);
});

interface ImportResultRow {
    driverName: string;
    steamId: string;
    position: number;
    points: number;
    laps: number;
    totalTime: number;
    bestLap: number;
    rawData: string;
}

app.post('/api/admin/import-race', requireAdmin, (req: Request, res: Response) => {
    const body = req.body as {
        sourceFileName?: unknown;
        raceName?: unknown;
        trackName?: unknown;
        serverName?: unknown;
        raceDate?: unknown;
        sessionType?: unknown;
        results?: unknown;
    };

    const sourceFileName = typeof body.sourceFileName === 'string' ? body.sourceFileName : '';
    if (!sourceFileName) {
        res.status(400).json({ error: '缺少 sourceFileName' });
        return;
    }
    const raceName = typeof body.raceName === 'string' ? body.raceName : '';
    const trackName = typeof body.trackName === 'string' ? body.trackName : '';
    const serverName = typeof body.serverName === 'string' ? body.serverName : '';
    const raceDate = typeof body.raceDate === 'string' ? body.raceDate : '';
    const sessionType = typeof body.sessionType === 'string' ? body.sessionType : 'R';
    const results = Array.isArray(body.results) ? body.results : [];

    const tx = db.transaction(() => {
        const existing = db.prepare('SELECT * FROM races WHERE source_file_name = ?').get(sourceFileName) as
            | { id: number }
            | undefined;

        let raceId: number;
        if (existing) {
            raceId = existing.id;
            db.prepare(
                `UPDATE races
                    SET race_name = ?, track_name = ?, server_name = ?,
                        race_date = ?, session_type = ?
                  WHERE id = ?`
            ).run(raceName, trackName, serverName, raceDate, sessionType, raceId);
            db.prepare('DELETE FROM race_results WHERE race_id = ?').run(raceId);
        } else {
            db.prepare(
                `INSERT INTO races (race_name, track_name, server_name, race_date, source_file_name, session_type)
                 VALUES (?, ?, ?, ?, ?, ?)`
            ).run(raceName, trackName, serverName, raceDate, sourceFileName, sessionType);
            const ins = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
            raceId = Number(ins.id);
        }

        let newDrivers = 0;
        let updatedDrivers = 0;
        let resultCount = 0;

        for (const r of results) {
            const row = r as Partial<ImportResultRow>;
            const steamId = typeof row.steamId === 'string' ? row.steamId : '';
            if (!steamId) continue;

            const driverName = typeof row.driverName === 'string' ? row.driverName : 'Unknown';
            const { id: driverId, isNew } = upsertDriver(driverName, steamId);
            if (isNew) newDrivers++;
            else updatedDrivers++;

            importRaceResult(
                raceId,
                driverId,
                Number(row.position) || 0,
                Number(row.points) || 0,
                Number(row.laps) || 0,
                Number(row.totalTime) || 0,
                Number(row.bestLap) || 0,
                typeof row.rawData === 'string' ? row.rawData : '{}'
            );
            resultCount++;
        }

        recalculateAllDriverStats();
        return { raceId, newDrivers, updatedDrivers, resultCount };
    });

    try {
        const out = tx();
        res.json(out);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: msg });
    }
});

const clientDist = path.join(ROOT, 'dist');
if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
}

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Standings API listening on http://127.0.0.1:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`SQLite file: ${SQLITE_PATH}`);
    if (fs.existsSync(clientDist)) {
        // eslint-disable-next-line no-console
        console.log(`Serving static from ${clientDist}`);
    }
});
