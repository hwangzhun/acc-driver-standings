/** 与历史 sql.js 初始化 DDL 一致，供服务端 SQLite 建表 */
export const STANDINGS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    steam_id TEXT UNIQUE NOT NULL,
    points INTEGER DEFAULT 0,
    license_points INTEGER DEFAULT 12,
    total_races INTEGER DEFAULT 0,
    podium_count INTEGER DEFAULT 0,
    ptw_count INTEGER DEFAULT 0,
    top10_count INTEGER DEFAULT 0,
    tier TEXT NOT NULL DEFAULT 'Rookie',
    rank_score REAL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS races (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_name TEXT NOT NULL,
    track_name TEXT,
    server_name TEXT,
    race_date TEXT,
    source_file_name TEXT,
    session_type TEXT DEFAULT 'R',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS race_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id INTEGER NOT NULL,
    driver_id INTEGER NOT NULL,
    position INTEGER,
    points INTEGER DEFAULT 0,
    laps INTEGER DEFAULT 0,
    total_time INTEGER DEFAULT 0,
    best_lap INTEGER DEFAULT 0,
    is_podium INTEGER DEFAULT 0,
    is_top10 INTEGER DEFAULT 0,
    is_ptw INTEGER DEFAULT 0,
    rank_score REAL DEFAULT 0,
    valid_lap_rate REAL DEFAULT 0,
    raw_data TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (race_id) REFERENCES races(id),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

CREATE TABLE IF NOT EXISTS license_point_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id INTEGER NOT NULL,
    change_value INTEGER NOT NULL,
    before_points INTEGER NOT NULL,
    after_points INTEGER NOT NULL,
    reason TEXT NOT NULL,
    operator TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

CREATE INDEX IF NOT EXISTS idx_race_results_race ON race_results(race_id);
CREATE INDEX IF NOT EXISTS idx_race_results_driver ON race_results(driver_id);
CREATE INDEX IF NOT EXISTS idx_license_logs_driver ON license_point_logs(driver_id);
CREATE INDEX IF NOT EXISTS idx_drivers_steam ON drivers(steam_id);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS race_calendar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_date TEXT NOT NULL,
    title TEXT NOT NULL,
    track_name TEXT,
    notes TEXT,
    linked_race_id INTEGER,
    event_detail TEXT,
    event_session_time TEXT,
    race_duration TEXT,
    car_group TEXT,
    bop TEXT,
    entry_requirements TEXT,
    pit_rules TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
`;
