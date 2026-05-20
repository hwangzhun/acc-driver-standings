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
import { stabilityCoeff, finishCoeff, computeRaceRankScore, isRankEligible } from './rankScore';

/** Position-to-points mapping. Edit this map to adjust scoring. */
export const POSITION_POINTS_MAP: Record<number, number> = {
    1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
    6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
};

export function pointsForPosition(pos: number, map: Record<number, number> = POSITION_POINTS_MAP): number {
    return map[pos] ?? 0;
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
    /** 扁平数组（旧格式）或 { system, manual } 对象（schema 2.0 导出） */
    penalties?:
        | Array<Schema2PenaltyEntry>
        | {
              system?: Schema2PenaltyEntry[];
              manual?: Schema2ManualEntry[];
          };
    /** 顶层 manual（可与 penalties.manual 并存） */
    manual?: Schema2ManualEntry[];
}

export type Schema2PenaltyEntry = {
    carId: number;
    driverIndex?: number;
    reason?: string;
    penalty?: string;
    penaltyValue?: number;
    violationInLap?: number;
    clearedInLap?: number;
};

export type Schema2ManualEntry = {
    carId: number;
    type?: string;
    valueMs?: number;
    reason?: string;
};

/** schema 2.0 导出中 penalties 可能是数组，也可能是 { system, manual } */
export function normalizeSchema2Penalties(data: AccSchema2): {
    system: Schema2PenaltyEntry[];
    manual: Schema2ManualEntry[];
} {
    const topManual = Array.isArray(data.manual) ? data.manual : [];
    const penalties = data.penalties;
    if (penalties && typeof penalties === 'object' && !Array.isArray(penalties)) {
        const nested = penalties as { system?: Schema2PenaltyEntry[]; manual?: Schema2ManualEntry[] };
        const system = Array.isArray(nested.system) ? nested.system : [];
        const manual = Array.isArray(nested.manual) ? [...nested.manual, ...topManual] : [...topManual];
        return { system, manual };
    }
    const system = Array.isArray(penalties) ? penalties : [];
    return { system, manual: topManual };
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
    if (!exportedAt) return new Date().toISOString().slice(0, 10);
    const d = new Date(exportedAt);
    if (Number.isNaN(d.getTime())) return exportedAt.slice(0, 10);
    return d.toISOString().slice(0, 10);
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
    /** Single-race Rank score (0 if non-race session) */
    rankScore: number;
    /** Fraction of valid-for-best laps, 0..1 */
    validLapRate: number;
}

export interface EditableDriverResult extends ParsedDriverResult {
    removed?: boolean;
}

export interface DbResultRow {
    driver_name: string;
    steam_id: string;
    position: number;
    points: number;
    laps: number;
    total_time: number;
    best_lap: number;
    raw_data: string;
    rank_score?: number;
    valid_lap_rate?: number;
}

export function dbResultsToParsed(
    rows: DbResultRow[]
): EditableDriverResult[] {
    return rows.map(row => ({
        driverName: row.driver_name,
        steamId: row.steam_id,
        position: row.position,
        points: row.points,
        laps: row.laps,
        totalTime: row.total_time,
        bestLap: row.best_lap,
        rawData: row.raw_data,
        removed: false,
        rankScore: row.rank_score ?? 0,
        validLapRate: row.valid_lap_rate ?? 0,
    }));
}

/**
 * 给定完整的结果列表（含 removed 标记），按当前有效条目重新计算 gridSize / winnerLaps，
 * 然后重算所有人的 rankScore。
 * - removed = true 或 laps <= 0 → rankScore = 0
 * - 非正赛 → rankScore = 0
 * - 其余按 computeRaceRankScore 计算（gridSize/winnerLaps 只统计 active 条目）
 */
export function recomputeParsedResultsRanks(
    results: EditableDriverResult[],
    sessionType: string
): EditableDriverResult[] {
    const active = results.filter(r => !r.removed && isRankEligible(r.laps));
    const gridSize = active.length;
    const winnerLaps = active.reduce((max, r) => Math.max(max, r.laps), 0);

    return results.map(r => {
        if (r.removed || !isRankEligible(r.laps)) {
            return { ...r, rankScore: 0 };
        }
        if (sessionType !== 'R') {
            return { ...r, rankScore: 0 };
        }
        const rankScore = computeRaceRankScore({
            gridSize,
            position: r.position,
            driverLaps: r.laps,
            winnerLaps,
            validLapRate: r.validLapRate,
        });
        return { ...r, rankScore };
    });
}

export function parseJsonToResults(data: AccSchema2, positionPointsMap?: Record<number, number>): {
    raceName: string;
    trackName: string;
    serverName: string;
    raceDate: string;
    sourceFileName: string;
    sessionType: string;
    results: ParsedDriverResult[];
} {
    const carIdToSteam = buildCarIdToSteamIdMap(data);

    // Build carId → { totalLaps, validLaps }
    const carLapStats = new Map<number, { total: number; valid: number }>();
    if (data.lapsByCar) {
        for (const car of data.lapsByCar) {
            const laps = car.laps ?? [];
            const valid = laps.filter((l) => l.isValidForBest).length;
            carLapStats.set(car.carId, { total: laps.length, valid });
        }
    }

    const finalRanking = data.finalRanking ?? [];
    // gridSize / winnerLaps 只统计有实际圈数的车手（与 isRankEligible 逻辑一致）
    const rankedEntries = finalRanking.filter(item => (item.lapCount ?? 0) > 0);
    const winnerLaps = rankedEntries.reduce((max, item) => Math.max(max, item.lapCount ?? 0), 0);
    const gridSize = rankedEntries.length;

    const results: ParsedDriverResult[] = finalRanking.map((item) => {
        const steamId = carIdToSteam.get(item.carId) ?? '';
        const pos = item.position ?? 99;
        const laps = item.lapCount ?? 0;
        const totalTime = item.officialTime ?? 0;
        const bestLap = item.bestLap ?? 0;
        const rawData = JSON.stringify(item);

        const lapStats = carLapStats.get(item.carId) ?? { total: laps, valid: 0 };
        // If no laps tracked, fall back to lapCount fields
        const totalLaps = lapStats.total > 0 ? lapStats.total : laps;
        const validLaps = lapStats.valid > 0 ? lapStats.valid : 0;
        const validLapRate = totalLaps > 0 ? validLaps / totalLaps : 0;

        let rankScore = 0;
        if (data.session?.sessionType === 'R') {
            rankScore = computeRaceRankScore({
                gridSize,
                position: pos,
                driverLaps: laps,
                winnerLaps,
                validLapRate,
            });
        }

        return {
            driverName: item.driverName ?? 'Unknown',
            steamId,
            position: pos,
            points: pointsForPosition(pos, positionPointsMap),
            laps,
            totalTime,
            bestLap,
            rawData,
            rankScore,
            validLapRate,
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
