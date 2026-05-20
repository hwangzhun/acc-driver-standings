import type { AccResultData, Lap, LeaderboardLine, Penalty } from '../types';
import type { AccSchema2 } from './standingsImport';
import { normalizeSchema2Penalties } from './standingsImport';

function ensureArray<T>(value: T[] | null | undefined): T[] {
    return Array.isArray(value) ? value : [];
}

/** 与原生 ACC JSON（含 sessionResult.leaderBoardLines）区分 */
export function isSchema2Payload(obj: unknown): obj is AccSchema2 {
    if (!obj || typeof obj !== 'object') return false;
    const o = obj as Record<string, unknown>;
    const sr = o.sessionResult;
    if (sr && typeof sr === 'object' && Array.isArray((sr as Record<string, unknown>).leaderBoardLines)) {
        return false;
    }
    return Array.isArray(o.finalRanking);
}

function splitDriverName(name: string): { firstName: string; lastName: string } {
    const t = name.trim();
    if (!t) return { firstName: '', lastName: 'Unknown' };
    const parts = t.split(/\s+/);
    if (parts.length === 1) return { firstName: '', lastName: parts[0] };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

const INVALID_RACE_MS = 2147483647;

/**
 * 将 schema 2.0 分析导出 JSON 转为 AccResultData（导入解析等内部使用）。
 * 字段映射见 standingsImport.ts 注释；此处补齐 timing、laps、penalties。
 */
export function schema2ToAccResultData(data: AccSchema2): AccResultData {
    const session = data.session ?? { sessionType: 'R', trackName: '', serverName: '' };
    const lapsByCar = ensureArray(data.lapsByCar);
    const { system: systemPenalties, manual: manualPenalties } = normalizeSchema2Penalties(data);
    const carMeta = new Map<
        number,
        { raceNumber: number; carModel: number; carName: string; carClass: string }
    >();
    for (const c of lapsByCar) {
        const cls =
            (data.finalRanking ?? []).find((r) => r.carId === c.carId)?.carClass ?? 'GT3';
        carMeta.set(c.carId, {
            raceNumber: c.raceNumber ?? 0,
            carModel: c.carModel ?? 32,
            carName: c.carName ?? '',
            carClass: cls,
        });
    }

    const lapsByCarById = new Map(lapsByCar.map((c) => [c.carId, c]));

    const lines: LeaderboardLine[] = (data.finalRanking ?? []).map((item) => {
        const meta = carMeta.get(item.carId);
        const lapCar = lapsByCarById.get(item.carId);
        const driverName = (item.driverName ?? lapCar?.drivers?.[0]?.lastName ?? 'Unknown').trim() || 'Unknown';
        const { firstName, lastName } = splitDriverName(driverName);
        const d0 = lapCar?.drivers?.[0];
        const playerId = d0?.playerId ?? `car-${item.carId}`;
        const shortName = (d0?.shortName ?? driverName.slice(0, 3)).toUpperCase();

        const totalTime =
            item.status === 'DSQ' || item.officialTime == null || item.officialTime <= 0
                ? INVALID_RACE_MS
                : item.officialTime;
        const lapCount = item.lapCount ?? 0;
        const bestLap = item.bestLap && item.bestLap > 0 ? item.bestLap : totalTime;

        return {
            car: {
                carId: item.carId,
                raceNumber: item.raceNumber ?? meta?.raceNumber ?? item.carId,
                carModel: item.carModel ?? meta?.carModel ?? 32,
                cupCategory: 0,
                carGroup: item.carClass ?? meta?.carClass ?? 'GT3',
                teamName: item.carName ?? meta?.carName ?? '',
                nationality: 0,
                drivers: [
                    {
                        firstName: (d0?.firstName ?? firstName).trim() || firstName,
                        lastName: (d0?.lastName ?? lastName).trim() || lastName,
                        shortName,
                        playerId,
                    },
                ],
            },
            currentDriver: {
                firstName: (d0?.firstName ?? firstName).trim() || firstName,
                lastName: (d0?.lastName ?? lastName).trim() || lastName,
                shortName,
                playerId,
            },
            currentDriverIndex: 0,
            timing: {
                lastLap: totalTime,
                lastSplits: [],
                bestLap,
                bestSplits: [INVALID_RACE_MS, INVALID_RACE_MS, INVALID_RACE_MS],
                totalTime,
                lapCount,
                lastSplitId: 0,
            },
            missingMandatoryPitstop: -1,
            driverTotalTimes: [],
            finishPosition: item.position > 0 ? item.position : undefined,
        };
    });

    const laps: Lap[] = [];
    for (const car of lapsByCar) {
        for (const L of car.laps ?? []) {
            laps.push({
                carId: car.carId,
                driverIndex: L.driverIndex ?? 0,
                laptime: L.lapTime,
                isValidForBest: Boolean(L.isValidForBest),
                splits: Array.isArray(L.splits) ? L.splits : [],
            });
        }
    }

    const penalties: Penalty[] = [];

    for (const row of data.finalRanking ?? []) {
        if (row.status === 'DSQ') {
            penalties.push({
                carId: row.carId,
                driverIndex: 0,
                reason: 'DSQ',
                penalty: 'Disqualified',
                penaltyValue: 0,
                violationInLap: -1,
                clearedInLap: -1,
            });
        }
    }

    for (const p of systemPenalties) {
        penalties.push({
            carId: p.carId,
            driverIndex: p.driverIndex ?? 0,
            reason: p.reason ?? '',
            penalty: p.penalty ?? '',
            penaltyValue: typeof p.penaltyValue === 'number' ? p.penaltyValue : 0,
            violationInLap: p.violationInLap ?? -1,
            clearedInLap: p.clearedInLap ?? -1,
        });
    }

    for (const m of manualPenalties) {
        if (m.type === 'Disqualified') {
            penalties.push({
                carId: m.carId,
                driverIndex: 0,
                reason: m.reason ?? 'Manual DSQ',
                penalty: 'Disqualified',
                penaltyValue: 0,
                violationInLap: -1,
                clearedInLap: -1,
            });
        } else if (m.type === 'TimePenalty' && typeof m.valueMs === 'number' && m.valueMs > 0) {
            penalties.push({
                carId: m.carId,
                driverIndex: 0,
                reason: m.reason ?? 'Manual Time Penalty',
                penalty: 'TimePenalty',
                penaltyValue: m.valueMs,
                violationInLap: -1,
                clearedInLap: -1,
            });
        }
    }

    let bestlap = INVALID_RACE_MS;
    for (const line of lines) {
        const b = line.timing.bestLap;
        if (b > 0 && b < bestlap) bestlap = b;
    }
    if (bestlap === INVALID_RACE_MS) bestlap = 0;

    return {
        sessionType: session.sessionType ?? 'R',
        trackName: session.trackName ?? '',
        sessionIndex: 0,
        raceWeekendIndex: 0,
        metaData: `schemaVersion:${data.schemaVersion ?? '2.0'}`,
        serverName: session.serverName ?? '',
        exportedAt: data.exportedAt,
        sessionResult: {
            bestlap,
            bestSplits: [INVALID_RACE_MS, INVALID_RACE_MS, INVALID_RACE_MS],
            isWetSession: 0,
            type: 0,
            leaderBoardLines: lines,
        },
        laps,
        penalties,
        post_race_penalties: [],
    };
}
