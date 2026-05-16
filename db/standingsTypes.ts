export type DriverTier = 'Rookie' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export const VALID_DRIVER_TIERS: DriverTier[] = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Platinum'];

export function isValidDriverTier(v: string): v is DriverTier {
    return VALID_DRIVER_TIERS.includes(v as DriverTier);
}

export interface DriverRow {
    id: number;
    name: string;
    steam_id: string;
    points: number;
    license_points: number;
    total_races: number;
    podium_count: number;
    ptw_count: number;
    top10_count: number;
    tier: DriverTier;
    created_at: string;
    updated_at: string;
}

export interface RaceRow {
    id: number;
    race_name: string;
    track_name: string;
    server_name: string;
    race_date: string;
    source_file_name: string;
    session_type: string;
    created_at: string;
}

export interface RaceResultRow {
    id: number;
    race_id: number;
    driver_id: number;
    position: number;
    points: number;
    laps: number;
    total_time: number;
    best_lap: number;
    is_podium: number;
    is_top10: number;
    is_ptw: number;
    raw_data: string;
    created_at: string;
}

export interface LicensePointLogRow {
    id: number;
    driver_id: number;
    change_value: number;
    before_points: number;
    after_points: number;
    reason: string;
    operator: string;
    created_at: string;
}

export interface DriverStanding {
    id: number;
    name: string;
    steam_id: string;
    points: number;
    license_points: number;
    total_races: number;
    podium_count: number;
    ptw_count: number;
    top10_count: number;
    tier: DriverTier;
}

export interface DriverRaceHistory {
    race_id: number;
    race_name: string;
    track_name: string;
    race_date: string;
    position: number;
    points: number;
    laps: number;
    total_time: number;
    best_lap: number;
    is_podium: number;
    is_top10: number;
    is_ptw: number;
}

export interface LicensePointLog {
    id: number;
    driver_id: number;
    change_value: number;
    before_points: number;
    after_points: number;
    reason: string;
    operator: string;
    created_at: string;
}

export interface RaceWithResults {
    race: RaceRow;
    results: Array<RaceResultRow & { driver_name: string; steam_id: string }>;
}

export type SortField = 'points' | 'license_points' | 'total_races';
export type SortOrder = 'asc' | 'desc';

export interface ImportResult {
    raceName: string;
    newDrivers: number;
    updatedDrivers: number;
    resultCount: number;
}

export interface AppSettings {
    usePoints: boolean;
    positionPointsMap: Record<number, number>;
}

export interface CalendarEventRow {
    id: number;
    event_date: string;
    title: string;
    track_name: string | null;
    notes: string | null;
    linked_race_id: number | null;
    event_detail: string | null;
    event_session_time: string | null;
    race_duration: string | null;
    car_group: string | null;
    bop: string | null;
    entry_requirements: string | null;
    pit_rules: string | null;
    created_at: string;
    updated_at: string;
}
