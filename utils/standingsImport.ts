/**
 * ACC Race Result JSON Import Utility
 *
 * Supports schemaVersion 2.0 (ACC export format).
 *
 * Field mapping:
 *   session.sessionType   -> races.session_type  ('R'|'Q'|'P')
 *   session.trackName     -> races.track_name
 *   session.serverName    -> races.server_name
 *   exportedAt            -> races.race_date
 *
 *   finalRanking[].driverName  -> drivers.name
 *   finalRanking[].playerId    -> drivers.steam_id  (extracted from lapsByCar via carId match)
 *   finalRanking[].position    -> race_results.position
 *   finalRanking[].lapCount    -> race_results.laps
 *   finalRanking[].officialTime-> race_results.total_time  (milliseconds)
 *   finalRanking[].bestLap      -> race_results.best_lap   (milliseconds)
 *
 *   Points: not present in JSON, computed from position using POSITION_POINTS_MAP.
 *   is_podium: position 1-3
 *   is_top10:  position 1-10
 *   is_ptw:    position 1 (winner)
 */

import type { ImportResult } from '../db/standingsTypes';

/** Position-to-points mapping. Edit this map to adjust scoring. */
export const POSITION_POINTS_MAP: Record<number, number> = {
    1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
    6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
};

export function pointsForPosition(pos: number): number {
    return POSITION_POINTS_MAP[pos] ?? 0;
}

export interface AccSchema2 {
    schemaVersion: string;
    exportedAt?: string;
    session: {
        sessionType: string;
        trackName: string;
        serverName: string;
        rankingMode?: string;
    };
    finalRanking: Array<{
        position: number;
        status: string;
        carId: number;
        raceNumber?: number;
        driverName?: string;
        carModel?: number;
        carName?: string;
        carClass?: string;
        lapCount?: number;
        officialTime?: number;
        bestLap?: number;
        gapToLeaderMs?: number;
    }>;
    lapsByCar?: Array<{
        carId: number;
        raceNumber?: number;
        carModel?: number;
        carName?: string;
        drivers?: Array<{
            firstName?: string;
            lastName?: string;
            shortName?: string;
            playerId?: string;
        }>;
        laps?: Array<{
            lapNumber: number;
            driverIndex?: number;
            lapTime: number;
            isValidForBest?: boolean;
            splits?: number[];
        }>;
    }>;
    penalties?: Array<{
        carId: number;
        driverIndex?: number;
        reason?: string;
        penalty?: string;
        penaltyValue?: number;
        violationInLap?: number;
        clearedInLap?: number;
    }>;
    manual?: Array<{
        carId: number;
        type?: string;
        valueMs?: number;
        reason?: string;
    }>;
}

/** Build a carId -> playerId map from lapsByCar section */
function buildCarIdToSteamIdMap(data: AccSchema2): Map<number, string> {
    const map = new Map<number, string>();
    if (!data.lapsByCar) return map;
    for (const car of data.lapsByCar) {
        if (car.drivers?.[0]?.playerId) {
            map.set(car.carId, car.drivers[0].playerId);
        }
    }
    return map;
}

export function parseRaceDate(exportedAt?: string): string {
    if (!exportedAt) return new Date().toISOString().slice(0, 19).replace('T', ' ');
    const d = new Date(exportedAt);
    if (Number.isNaN(d.getTime())) return exportedAt;
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function parseRaceName(serverName: string, trackName: string, sessionType: string): string {
    const label = sessionTypeLabel(sessionType);
    return `${serverName} — ${trackName} ${label}`.trim();
}

function sessionTypeLabel(t: string): string {
    switch (t) {
        case 'R': return '正赛';
        case 'Q': return '排位';
        case 'P': return '练习';
        default: return t;
    }
}

export interface ParsedDriverResult {
    driverName: string;
    steamId: string;
    position: number;
    points: number;
    laps: number;
    totalTime: number;
    bestLap: number;
    rawData: string;
}

export function parseJsonToResults(data: AccSchema2): {
    raceName: string;
    trackName: string;
    serverName: string;
    raceDate: string;
    sourceFileName: string;
    sessionType: string;
    results: ParsedDriverResult[];
} {
    const carIdToSteam = buildCarIdToSteamIdMap(data);

    const results: ParsedDriverResult[] = (data.finalRanking ?? []).map((item) => {
        const steamId = carIdToSteam.get(item.carId) ?? '';
        const pos = item.position ?? 99;
        const laps = item.lapCount ?? 0;
        const totalTime = item.officialTime ?? 0;
        const bestLap = item.bestLap ?? 0;
        const rawData = JSON.stringify(item);

        return {
            driverName: item.driverName ?? 'Unknown',
            steamId,
            position: pos,
            points: pointsForPosition(pos),
            laps,
            totalTime,
            bestLap,
            rawData,
        };
    });

    return {
        raceName: parseRaceName(
            data.session?.serverName ?? 'Unknown Server',
            data.session?.trackName ?? 'Unknown Track',
            data.session?.sessionType ?? 'R'
        ),
        trackName: data.session?.trackName ?? '',
        serverName: data.session?.serverName ?? '',
        raceDate: parseRaceDate(data.exportedAt),
        sourceFileName: '',
        sessionType: data.session?.sessionType ?? 'R',
        results,
    };
}
