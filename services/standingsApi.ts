import type {
    DriverRow,
    DriverStanding,
    DriverRaceHistory,
    LicensePointLog,
    RaceRow,
    RaceResultRow,
    SortField,
    SortOrder,
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
    const res = await fetch(apiUrl('/api/admin/import-race'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return parseJson(res);
}

export async function patchDriverTier(driverId: number, tier: string): Promise<{ ok: boolean }> {
    const res = await fetch(apiUrl(`/api/drivers/${driverId}/tier`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
    });
    return parseJson<{ ok: boolean }>(res);
}

export async function postDriverLicenseChange(
    driverId: number,
    payload: { changeValue: number; reason: string; operator?: string }
): Promise<{ ok: boolean; after_points: number }> {
    const res = await fetch(apiUrl(`/api/drivers/${driverId}/license`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return parseJson(res);
}
