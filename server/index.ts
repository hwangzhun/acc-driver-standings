import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import express, { type Request, type Response, type RequestHandler } from 'express';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { STANDINGS_SCHEMA_SQL } from '../db/schema.js';
import { computeRaceRankScore, tierFromTotalRank } from '../utils/rankScore.js';
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

const ROOKIE_TO_BRONZE_RACE_THRESHOLD = 10;

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

function readAutoRookieBronzeEnabled(): boolean {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'auto_rookie_bronze'").get() as
        | { value: string }
        | undefined;
    return row?.value === '1';
}

function applyRookieToBronzePromotion(): number {
    if (!readAutoRookieBronzeEnabled()) return 0;
    const result = db.prepare(`
        UPDATE drivers SET tier = 'Bronze', updated_at = datetime('now')
        WHERE tier = 'Rookie' AND total_races >= ?
    `).run(ROOKIE_TO_BRONZE_RACE_THRESHOLD);
    return result.changes;
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
    if (!tierCol.some((c) => c.name === 'rank_score')) {
        database.exec("ALTER TABLE drivers ADD COLUMN rank_score REAL");
    }

    const rrCols = database.prepare('PRAGMA table_info(race_results)').all() as Array<{ name: string }>;
    if (!rrCols.some((c) => c.name === 'rank_score')) {
        database.exec("ALTER TABLE race_results ADD COLUMN rank_score REAL DEFAULT 0");
    }
    if (!rrCols.some((c) => c.name === 'valid_lap_rate')) {
        database.exec("ALTER TABLE race_results ADD COLUMN valid_lap_rate REAL DEFAULT 0");
    }

    const calCols = database.prepare('PRAGMA table_info(race_calendar)').all() as Array<{ name: string }>;
    const calNewCols = [
        { name: 'event_detail', sql: 'TEXT' },
        { name: 'event_session_time', sql: 'TEXT' },
        { name: 'race_duration', sql: 'TEXT' },
        { name: 'car_group', sql: 'TEXT' },
        { name: 'bop', sql: 'TEXT' },
        { name: 'entry_requirements', sql: 'TEXT' },
        { name: 'pit_rules', sql: 'TEXT' },
    ];
    for (const col of calNewCols) {
        if (!calCols.some((c) => c.name === col.name)) {
            database.exec(`ALTER TABLE race_calendar ADD COLUMN ${col.name} ${col.sql}`);
        }
    }
    // Remove deprecated columns if they exist (legacy migration)
    const dropCols = ['sort_order', 'race_start_time'];
    for (const col of dropCols) {
        if (calCols.some((c) => c.name === col)) {
            database.exec(`ALTER TABLE race_calendar DROP COLUMN ${col}`);
        }
    }

    database.exec(STANDINGS_SCHEMA_SQL);
    database.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('use_points', '1')").run();
    database.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('position_points_map', ?)").run(
        JSON.stringify(DEFAULT_POSITION_POINTS)
    );
    database.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('auto_rookie_bronze', '0')").run();

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
    // Recent 10 race sessions (only 'R') for rank score, ordered newest first
    const recentRaces = db.prepare(`
        SELECT rr.rank_score
        FROM race_results rr
        JOIN races r ON r.id = rr.race_id
        WHERE rr.driver_id = ? AND r.session_type = 'R' AND rr.rank_score IS NOT NULL
        ORDER BY r.race_date DESC, r.id DESC
        LIMIT 10
    `).all(driverId) as { rank_score: number }[];

    const raceCount = db.prepare(`
        SELECT COUNT(*) as cnt FROM race_results rr
        JOIN races r ON r.id = rr.race_id
        WHERE rr.driver_id = ? AND r.session_type = 'R'
    `).get(driverId) as { cnt: number };

    let rankScore: number | null = null;
    let tier: string = 'Rookie';

    if (recentRaces.length >= 10) {
        const sum = recentRaces.reduce((a, b) => a + b.rank_score, 0);
        rankScore = sum / 10;
        tier = tierFromTotalRank(rankScore);
    }

    db.prepare(`
        UPDATE drivers SET
            points = COALESCE((SELECT SUM(rr.points) FROM race_results rr WHERE rr.driver_id = ?), 0),
            total_races = COALESCE((SELECT COUNT(*) FROM race_results rr WHERE rr.driver_id = ?), 0),
            podium_count = COALESCE((SELECT COUNT(*) FROM race_results rr WHERE rr.driver_id = ? AND rr.is_podium = 1), 0),
            top10_count = COALESCE((SELECT COUNT(*) FROM race_results rr WHERE rr.driver_id = ? AND rr.is_top10 = 1), 0),
            ptw_count = COALESCE((SELECT COUNT(*) FROM race_results rr WHERE rr.driver_id = ? AND rr.is_ptw = 1), 0),
            rank_score = ?,
            tier = ?,
            updated_at = datetime('now')
        WHERE id = ?
    `).run(driverId, driverId, driverId, driverId, driverId, rankScore, tier, driverId);
}

function recalculateAllDriverStats() {
    const rows = db.prepare('SELECT id FROM drivers').all() as { id: number }[];
    for (const { id } of rows) {
        updateDriverStats(id);
    }
}

/** 按名次/圈数/有效圈率重算所有正赛单场 Rank，再汇总车手总 Rank */
function recalculateAllRaceRankScores(): number {
    const races = db.prepare("SELECT id FROM races WHERE session_type = 'R'").all() as { id: number }[];
    const updateStmt = db.prepare(
        'UPDATE race_results SET rank_score = ?, valid_lap_rate = ? WHERE id = ?'
    );
    let updated = 0;

    for (const { id: raceId } of races) {
        const results = db
            .prepare('SELECT id, position, laps, valid_lap_rate FROM race_results WHERE race_id = ?')
            .all(raceId) as { id: number; position: number; laps: number; valid_lap_rate: number }[];

        if (results.length === 0) continue;

        const gridSize = results.length;
        const winnerLaps = results.reduce((max, r) => Math.max(max, Number(r.laps) || 0), 0);

        for (const r of results) {
            // laps <= 0 are not eligible for rank → force to 0
            if (Number(r.laps) <= 0) {
                updateStmt.run(0, Number(r.valid_lap_rate), r.id);
                continue;
            }
            const validLapRate = Number(r.valid_lap_rate) > 0 ? Number(r.valid_lap_rate) : 1.0;
            const rankScore = computeRaceRankScore({
                gridSize,
                position: Number(r.position) || 99,
                driverLaps: Number(r.laps) || 0,
                winnerLaps,
                validLapRate,
            });
            updateStmt.run(rankScore, validLapRate, r.id);
            updated++;
        }
    }
    return updated;
}

function importRaceResult(
    raceId: number,
    driverId: number,
    position: number,
    points: number,
    laps: number,
    totalTime: number,
    bestLap: number,
    rawData: string,
    rankScore: number,
    validLapRate: number
) {
    const isPodium = position >= 1 && position <= 3 ? 1 : 0;
    const isTop10 = position >= 1 && position <= 10 ? 1 : 0;
    const isPtw = position === 1 ? 1 : 0;
    db.prepare(
        `INSERT INTO race_results (race_id, driver_id, position, points, laps, total_time, best_lap, is_podium, is_top10, is_ptw, rank_score, valid_lap_rate, raw_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(raceId, driverId, position, points, laps, totalTime, bestLap, isPodium, isTop10, isPtw, rankScore, validLapRate, rawData);
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
    res.json({ usePoints: row?.value === '1', positionPointsMap: readPositionPointsMap(), autoRookieBronze: readAutoRookieBronzeEnabled() });
});

app.patch('/api/admin/settings', requireAdmin, (req: Request, res: Response) => {
    const { usePoints, autoRookieBronze } = req.body as { usePoints?: unknown; autoRookieBronze?: unknown };
    if (typeof usePoints !== 'boolean' && typeof autoRookieBronze !== 'boolean') {
        res.status(400).json({ error: 'usePoints or autoRookieBronze must be a boolean' });
        return;
    }
    const tx = db.transaction(() => {
        if (typeof usePoints === 'boolean') {
            db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('use_points', ?)").run(
                usePoints ? '1' : '0'
            );
        }
        let promotedCount: number | undefined;
        if (typeof autoRookieBronze === 'boolean') {
            const wasEnabled = readAutoRookieBronzeEnabled();
            db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('auto_rookie_bronze', ?)").run(
                autoRookieBronze ? '1' : '0'
            );
            // autoRookieBronze setting is preserved but no longer drives tier
            // tier is now derived from Rank score via updateDriverStats
            if (autoRookieBronze && !wasEnabled) {
                recalculateAllDriverStats();
                promotedCount = 0;
            }
        }
        return { usePoints, autoRookieBronze, promotedCount };
    });

    const result = tx();
    res.json(result);
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
               d.total_races, d.podium_count, d.ptw_count, d.top10_count, d.tier, d.rank_score
        FROM drivers d
        WHERE d.name LIKE ? OR d.steam_id LIKE ?
        ORDER BY d.${col} ${dir}, d.name ASC`
        : `SELECT d.id, d.name, d.steam_id, d.points, d.license_points,
               d.total_races, d.podium_count, d.ptw_count, d.top10_count, d.tier, d.rank_score
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
               rr.is_podium, rr.is_top10, rr.is_ptw, rr.rank_score, rr.valid_lap_rate
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
    const row = db.prepare('SELECT * FROM races WHERE id = ?').get(id) as Record<string, unknown> | undefined;
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

app.delete('/api/admin/races/:id', requireAdmin, (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }

    const tx = db.transaction(() => {
        const existing = db.prepare('SELECT id, race_name FROM races WHERE id = ?').get(id) as
            | { id: number; race_name: string }
            | undefined;
        if (!existing) return null;

        const resultCountRow = db.prepare(
            'SELECT COUNT(*) as total FROM race_results WHERE race_id = ?'
        ).get(id) as { total: number };
        const driverRows = db.prepare(
            'SELECT DISTINCT driver_id FROM race_results WHERE race_id = ?'
        ).all(id) as { driver_id: number }[];

        db.prepare('DELETE FROM race_results WHERE race_id = ?').run(id);
        db.prepare(
            "UPDATE race_calendar SET linked_race_id = NULL, updated_at = datetime('now') WHERE linked_race_id = ?"
        ).run(id);
        db.prepare('DELETE FROM races WHERE id = ?').run(id);

        for (const { driver_id } of driverRows) {
            updateDriverStats(driver_id);
        }

        return {
            raceName: existing.race_name,
            resultCount: resultCountRow.total,
        };
    });

    try {
        const out = tx();
        if (!out) {
            res.status(404).json({ error: '比赛不存在' });
            return;
        }
        res.json({ ok: true, ...out });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: msg });
    }
});

// ── Race update ───────────────────────────────────────────────────────────────

app.patch('/api/admin/races/:id', requireAdmin, (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }

    const body = req.body as {
        raceName?: unknown;
        trackName?: unknown;
        serverName?: unknown;
        raceDate?: unknown;
        sessionType?: unknown;
        results?: unknown;
    };

    const raceName = typeof body.raceName === 'string' ? body.raceName : '';
    const trackName = typeof body.trackName === 'string' ? body.trackName : '';
    const serverName = typeof body.serverName === 'string' ? body.serverName : '';
    const raceDate = typeof body.raceDate === 'string' ? body.raceDate : '';
    const sessionType = typeof body.sessionType === 'string' ? body.sessionType : 'R';
    const results = Array.isArray(body.results) ? body.results : [];

    const tx = db.transaction(() => {
        const existing = db.prepare('SELECT id FROM races WHERE id = ?').get(id);
        if (!existing) return null;

        db.prepare(
            `UPDATE races
                SET race_name = ?, track_name = ?, server_name = ?,
                    race_date = ?, session_type = ?
              WHERE id = ?`
        ).run(raceName, trackName, serverName, raceDate, sessionType, id);

        db.prepare('DELETE FROM race_results WHERE race_id = ?').run(id);

        let resultCount = 0;
        for (const r of results) {
            const row = r as Partial<ImportResultRow>;
            const steamId = typeof row.steamId === 'string' ? row.steamId : '';
            if (!steamId) continue;

            const driverName = typeof row.driverName === 'string' ? row.driverName : 'Unknown';
            const { id: driverId } = upsertDriver(driverName, steamId);

            importRaceResult(
                id,
                driverId,
                Number(row.position) || 0,
                Number(row.points) || 0,
                Number(row.laps) || 0,
                Number(row.totalTime) || 0,
                Number(row.bestLap) || 0,
                typeof row.rawData === 'string' ? row.rawData : '{}',
                Number(row.rankScore) || 0,
                Number(row.validLapRate) || 0
            );
            resultCount++;
        }

        recalculateAllDriverStats();
        return { raceId: id, resultCount };
    });

    try {
        const out = tx();
        if (!out) {
            res.status(404).json({ error: '比赛不存在' });
            return;
        }
        res.json({ ok: true, ...out });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: msg });
    }
});

// ── Calendar ───────────────────────────────────────────────────────────────────

app.get('/api/calendar', (_req: Request, res: Response) => {
    const rows = db.prepare(
        'SELECT * FROM race_calendar ORDER BY event_date ASC, id ASC'
    ).all();
    res.json(rows);
});

app.post('/api/admin/calendar', requireAdmin, (req: Request, res: Response) => {
    const body = req.body as {
        event_date?: unknown;
        title?: unknown;
        track_name?: unknown;
        notes?: unknown;
        linked_race_id?: unknown;
        event_detail?: unknown;
        event_session_time?: unknown;
        race_duration?: unknown;
        car_group?: unknown;
        bop?: unknown;
        entry_requirements?: unknown;
        pit_rules?: unknown;
    };

    const eventDate = typeof body.event_date === 'string' ? body.event_date.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!eventDate || !title) {
        res.status(400).json({ error: '日期和标题不能为空' });
        return;
    }

    const linkedRaceId = body.linked_race_id != null ? Number(body.linked_race_id) : null;
    if (linkedRaceId !== null && (!Number.isFinite(linkedRaceId) || linkedRaceId < 1)) {
        res.status(400).json({ error: 'linked_race_id 无效' });
        return;
    }
    if (linkedRaceId !== null) {
        const exists = db.prepare('SELECT id FROM races WHERE id = ?').get(linkedRaceId);
        if (!exists) {
            res.status(400).json({ error: '关联的场次不存在' });
            return;
        }
    }

    const trackName = typeof body.track_name === 'string' ? body.track_name.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    const eventDetail = typeof body.event_detail === 'string' ? body.event_detail.trim() : '';
    const eventSessionTime = typeof body.event_session_time === 'string' ? body.event_session_time.trim() : '';
    const raceDuration = typeof body.race_duration === 'string' ? body.race_duration.trim() : '';
    const carGroup = typeof body.car_group === 'string' ? body.car_group.trim() : '';
    const bop = typeof body.bop === 'string' ? body.bop.trim() : '';
    const entryRequirements = typeof body.entry_requirements === 'string' ? body.entry_requirements.trim() : '';
    const pitRules = typeof body.pit_rules === 'string' ? body.pit_rules.trim() : '';

    db.prepare(
        `INSERT INTO race_calendar (event_date, title, track_name, notes, linked_race_id, event_detail, event_session_time, race_duration, car_group, bop, entry_requirements, pit_rules)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(eventDate, title, trackName, notes, linkedRaceId, eventDetail, eventSessionTime, raceDuration, carGroup, bop, entryRequirements, pitRules);
    const row = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
    res.json({ id: Number(row.id) });
});

app.patch('/api/admin/calendar/:id', requireAdmin, (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }

    const existing = db.prepare('SELECT id FROM race_calendar WHERE id = ?').get(id);
    if (!existing) {
        res.status(404).json({ error: '赛历条目不存在' });
        return;
    }

    const body = req.body as {
        event_date?: unknown;
        title?: unknown;
        track_name?: unknown;
        notes?: unknown;
        linked_race_id?: unknown;
        event_detail?: unknown;
        event_session_time?: unknown;
        race_duration?: unknown;
        car_group?: unknown;
        bop?: unknown;
        entry_requirements?: unknown;
        pit_rules?: unknown;
    };

    const eventDate = typeof body.event_date === 'string' ? body.event_date.trim() : undefined;
    const title = typeof body.title === 'string' ? body.title.trim() : undefined;
    if (eventDate === '' || title === '') {
        res.status(400).json({ error: '日期和标题不能为空' });
        return;
    }

    const linkedRaceId = body.linked_race_id != null ? Number(body.linked_race_id) : undefined;
    if (linkedRaceId !== undefined && linkedRaceId !== null && (!Number.isFinite(linkedRaceId) || linkedRaceId < 1)) {
        res.status(400).json({ error: 'linked_race_id 无效' });
        return;
    }
    if (linkedRaceId !== undefined && linkedRaceId !== null) {
        const exists = db.prepare('SELECT id FROM races WHERE id = ?').get(linkedRaceId);
        if (!exists) {
            res.status(400).json({ error: '关联的场次不存在' });
            return;
        }
    }

    const trackName = body.track_name !== undefined
        ? (typeof body.track_name === 'string' ? body.track_name.trim() : '')
        : undefined;
    const notes = body.notes !== undefined
        ? (typeof body.notes === 'string' ? body.notes.trim() : '')
        : undefined;

    const eventDetail = body.event_detail !== undefined
        ? (typeof body.event_detail === 'string' ? body.event_detail.trim() : '')
        : undefined;
    const eventSessionTime = body.event_session_time !== undefined
        ? (typeof body.event_session_time === 'string' ? body.event_session_time.trim() : '')
        : undefined;
    const raceDuration = body.race_duration !== undefined
        ? (typeof body.race_duration === 'string' ? body.race_duration.trim() : '')
        : undefined;
    const carGroup = body.car_group !== undefined
        ? (typeof body.car_group === 'string' ? body.car_group.trim() : '')
        : undefined;
    const bop = body.bop !== undefined
        ? (typeof body.bop === 'string' ? body.bop.trim() : '')
        : undefined;
    const entryRequirements = body.entry_requirements !== undefined
        ? (typeof body.entry_requirements === 'string' ? body.entry_requirements.trim() : '')
        : undefined;
    const pitRules = body.pit_rules !== undefined
        ? (typeof body.pit_rules === 'string' ? body.pit_rules.trim() : '')
        : undefined;

    const sets: string[] = ['updated_at = datetime(\'now\')'];
    const vals: unknown[] = [];

    if (eventDate !== undefined) { sets.push('event_date = ?'); vals.push(eventDate); }
    if (title !== undefined) { sets.push('title = ?'); vals.push(title); }
    if (trackName !== undefined) { sets.push('track_name = ?'); vals.push(trackName); }
    if (notes !== undefined) { sets.push('notes = ?'); vals.push(notes); }
    if (linkedRaceId !== undefined) { sets.push('linked_race_id = ?'); vals.push(linkedRaceId); }
    if (eventDetail !== undefined) { sets.push('event_detail = ?'); vals.push(eventDetail); }
    if (eventSessionTime !== undefined) { sets.push('event_session_time = ?'); vals.push(eventSessionTime); }
    if (raceDuration !== undefined) { sets.push('race_duration = ?'); vals.push(raceDuration); }
    if (carGroup !== undefined) { sets.push('car_group = ?'); vals.push(carGroup); }
    if (bop !== undefined) { sets.push('bop = ?'); vals.push(bop); }
    if (entryRequirements !== undefined) { sets.push('entry_requirements = ?'); vals.push(entryRequirements); }
    if (pitRules !== undefined) { sets.push('pit_rules = ?'); vals.push(pitRules); }

    if (vals.length === 0) {
        res.json({ ok: true });
        return;
    }

    vals.push(id);
    db.prepare(`UPDATE race_calendar SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    res.json({ ok: true });
});

app.delete('/api/admin/calendar/:id', requireAdmin, (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }
    const existing = db.prepare('SELECT id FROM race_calendar WHERE id = ?').get(id);
    if (!existing) {
        res.status(404).json({ error: '赛历条目不存在' });
        return;
    }
    db.prepare('DELETE FROM race_calendar WHERE id = ?').run(id);
    res.json({ ok: true });
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
    rankScore: number;
    validLapRate: number;
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
                typeof row.rawData === 'string' ? row.rawData : '{}',
                Number(row.rankScore) || 0,
                Number(row.validLapRate) || 0
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

app.post('/api/admin/recalculate-rank', requireAdmin, (_req: Request, res: Response) => {
    try {
        const raceResultsUpdated = recalculateAllRaceRankScores();
        recalculateAllDriverStats();
        res.json({ ok: true, raceResultsUpdated });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: msg });
    }
});

const clientDist = path.join(ROOT, 'dist');
if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
}

app.listen(PORT, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`Standings API listening on http://0.0.0.0:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`SQLite file: ${SQLITE_PATH}`);
    if (fs.existsSync(clientDist)) {
        // eslint-disable-next-line no-console
        console.log(`Serving static from ${clientDist}`);
    }
});
