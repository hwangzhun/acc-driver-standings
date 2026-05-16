import type {
    DriverRow,
    DriverStanding,
    DriverRaceHistory,
    LicensePointLog,
    RaceRow,
    RaceResultRow,
    SortField,
    SortOrder,
    AppSettings,
    CalendarEventRow,
} from '../db/standingsTypes';
import type { ParsedDriverResult } from '../utils/standingsImport';

const API_PREFIX = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

function apiUrl(path: string): string {
    const p = path.startsWith('/') ? path : `/${path}`;
    return API_PREFIX ? `${API_PREFIX}${p}` : p;
}

async function readError(res: Response): Promise<string> {
    try {
        const j = (await res.json()) as { error?: string };
        if (j?.error) return j.error;
    } catch {
        try {
            const t = await res.text();
            if (t) return t;
        } catch {
            /* ignore */
        }
    }
    return res.statusText || `HTTP ${res.status}`;
}

async function parseJson<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(await readError(res));
    return res.json() as Promise<T>;
}

export async function initStandingsApi(): Promise<void> {
    const res = await fetch(apiUrl('/api/health'));
    if (!res.ok) throw new Error(await readError(res));
}

export async function getAppSettings(): Promise<AppSettings> {
    const res = await fetch(apiUrl('/api/settings'));
    return parseJson<AppSettings>(res);
}

export async function getDrivers(
    sortField: SortField = 'points',
    sortOrder: SortOrder = 'desc',
    search: string = ''
): Promise<DriverStanding[]> {
    const q = new URLSearchParams({
        sort: sortField,
        order: sortOrder,
        search,
    });
    const res = await fetch(apiUrl(`/api/drivers?${q}`));
    return parseJson<DriverStanding[]>(res);
}

export async function getDriverById(id: number): Promise<DriverRow | null> {
    const res = await fetch(apiUrl(`/api/drivers/${id}`));
    if (res.status === 404) return null;
    return parseJson<DriverRow>(res);
}

export async function getDriverRaceHistory(driverId: number): Promise<DriverRaceHistory[]> {
    const res = await fetch(apiUrl(`/api/drivers/${driverId}/history`));
    return parseJson<DriverRaceHistory[]>(res);
}

export async function getLicensePointLogs(driverId: number): Promise<LicensePointLog[]> {
    const res = await fetch(apiUrl(`/api/drivers/${driverId}/license-logs`));
    return parseJson<LicensePointLog[]>(res);
}

export async function getRaces(): Promise<RaceRow[]> {
    const res = await fetch(apiUrl('/api/races'));
    return parseJson<RaceRow[]>(res);
}

export async function getRaceById(id: number): Promise<RaceRow | null> {
    const res = await fetch(apiUrl(`/api/races/${id}`));
    if (res.status === 404) return null;
    return parseJson<RaceRow>(res);
}

export async function getRaceResultsWithDrivers(
    raceId: number
): Promise<Array<RaceResultRow & { driver_name: string; steam_id: string }>> {
    const res = await fetch(apiUrl(`/api/races/${raceId}/results`));
    return parseJson(res);
}

// ── Admin token ────────────────────────────────────────────────────────────────

const ADMIN_TOKEN_KEY = 'acc-admin-token';

export function getAdminToken(): string | null {
    try {
        return sessionStorage.getItem(ADMIN_TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setAdminToken(token: string): void {
    try {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    } catch {
        /* ignore */
    }
}

export function clearAdminToken(): void {
    try {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {
        /* ignore */
    }
}

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
    const token = getAdminToken();
    const headers: Record<string, string> = {
        ...(init?.headers as Record<string, string>),
        'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(apiUrl(path), { ...init, headers });
    if (res.status === 401) {
        clearAdminToken();
        window.dispatchEvent(new Event('acc:admin-unauthorized'));
    }
    return res;
}

// ── Admin auth API ────────────────────────────────────────────────────────────

export async function adminLogin(password: string): Promise<void> {
    const res = await fetch(apiUrl('/api/admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const data = (await res.json()) as { token: string };
    setAdminToken(data.token);
}

export async function adminMe(): Promise<void> {
    const res = await adminFetch('/api/admin/me');
    if (!res.ok) throw new Error(await readError(res));
}

export async function adminLogout(): Promise<void> {
    try {
        const res = await adminFetch('/api/admin/logout', { method: 'POST' });
        if (!res.ok) throw new Error(await readError(res));
    } finally {
        clearAdminToken();
    }
}

// ── Admin write APIs ─────────────────────────────────────────────────────────

export interface AdminImportRaceBody {
    sourceFileName: string;
    raceName: string;
    trackName: string;
    serverName: string;
    raceDate: string;
    sessionType: string;
    results: ParsedDriverResult[];
}

export async function adminImportRace(
    body: AdminImportRaceBody
): Promise<{ raceId: number; newDrivers: number; updatedDrivers: number; resultCount: number }> {
    const res = await adminFetch('/api/admin/import-race', {
        method: 'POST',
        body: JSON.stringify(body),
    });
    return parseJson(res);
}

export async function patchDriverTier(driverId: number, tier: string): Promise<{ ok: boolean }> {
    const res = await adminFetch(`/api/drivers/${driverId}/tier`, {
        method: 'PATCH',
        body: JSON.stringify({ tier }),
    });
    return parseJson<{ ok: boolean }>(res);
}

export async function postDriverLicenseChange(
    driverId: number,
    payload: { changeValue: number; reason: string; operator?: string }
): Promise<{ ok: boolean; after_points: number }> {
    const res = await adminFetch(`/api/drivers/${driverId}/license`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    return parseJson(res);
}

export async function updateAppSettings(s: { usePoints: boolean }): Promise<{ usePoints: boolean }> {
    const res = await adminFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(s),
    });
    return parseJson(res);
}

export async function updatePositionPointsMap(
    map: Record<number, number>
): Promise<{ ok: boolean; positionPointsMap: Record<number, number>; recalculatedRaceResults: number }> {
    const res = await adminFetch('/api/admin/position-points', {
        method: 'PATCH',
        body: JSON.stringify({ map }),
    });
    return parseJson(res);
}

// ── Calendar API ────────────────────────────────────────────────────────────────

export async function getCalendarEvents(): Promise<CalendarEventRow[]> {
    const res = await fetch(apiUrl('/api/calendar'));
    return parseJson<CalendarEventRow[]>(res);
}

export async function adminCreateCalendarEvent(body: {
    event_date: string;
    title: string;
    track_name?: string;
    notes?: string;
    linked_race_id?: number | null;
    event_detail?: string;
    event_session_time?: string;
    race_duration?: string;
    car_group?: string;
    bop?: string;
    entry_requirements?: string;
    pit_rules?: string;
}): Promise<{ id: number }> {
    const res = await adminFetch('/api/admin/calendar', {
        method: 'POST',
        body: JSON.stringify(body),
    });
    return parseJson(res);
}

export async function adminUpdateCalendarEvent(
    id: number,
    body: {
        event_date?: string;
        title?: string;
        track_name?: string;
        notes?: string;
        linked_race_id?: number | null;
        event_detail?: string;
        event_session_time?: string;
        race_duration?: string;
        car_group?: string;
        bop?: string;
        entry_requirements?: string;
        pit_rules?: string;
    }
): Promise<{ ok: boolean }> {
    const res = await adminFetch(`/api/admin/calendar/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
    });
    return parseJson(res);
}

export async function adminDeleteCalendarEvent(id: number): Promise<{ ok: boolean }> {
    const res = await adminFetch(`/api/admin/calendar/${id}`, { method: 'DELETE' });
    return parseJson(res);
}