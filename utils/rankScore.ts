import type { DriverTier } from '../db/standingsTypes';

/**
 * 名次百分位 = (总发车人数 - 名次) / (总发车人数 - 1)
 * gridSize 最小为 1；避免除零时返回 1（仅 position=1 时）或 0。
 */
export function positionPercentile(gridSize: number, position: number): number {
    if (gridSize <= 1) return position === 1 ? 1 : 0;
    return Math.max(0, (gridSize - position) / (gridSize - 1));
}

/**
 * 名次表现分 = 2 + 8 × 名次百分位^0.8
 */
export function positionPerformanceScore(gridSize: number, position: number): number {
    const p = positionPercentile(gridSize, position);
    return 2 + 8 * Math.pow(p, 0.8);
}

/**
 * 参赛规模系数 = 0.85 + 0.15 × min((总发车人数 - 1) / 19, 1)
 * 2 人场 ≈ 0.857；20 人及以上 → 1.00
 */
export function gridScaleCoeff(gridSize: number): number {
    return 0.85 + 0.15 * Math.min((gridSize - 1) / 19, 1);
}

/**
 * 稳定性系数基于有效圈率。
 * validLapRate: fraction of laps that are valid for best (isValidForBest), 0..1
 */
export function stabilityCoeff(validLapRate: number): number {
    if (validLapRate >= 0.95) return 1.10;
    if (validLapRate >= 0.90) return 1.07;
    if (validLapRate >= 0.80) return 1.04;
    if (validLapRate >= 0.70) return 1.00;
    return 0.95;
}

/**
 * 判断车手是否有资格获得 Rank 分。
 * driverLaps <= 0 时视为未参赛，单场 Rank 强制为 0。
 */
export function isRankEligible(driverLaps: number): boolean {
    return driverLaps > 0;
}

/**
 * 完赛系数: 1.0 if completed >= 80% of winner laps, else 0.2 (DNF/未完赛)
 */
export function finishCoeff(driverLaps: number, winnerLaps: number): number {
    if (winnerLaps <= 0) return 0.2;
    if (driverLaps >= winnerLaps * 0.8) return 1.0;
    return 0.2;
}

export interface RaceRankInput {
    gridSize: number;       // number of starters in this race (正赛发车人数)
    position: number;       // finish position (1 = winner)
    driverLaps: number;     // laps completed by this driver
    winnerLaps: number;     // laps completed by race winner
    validLapRate: number;   // 0..1
}

/**
 * 单场 Rank 分 = 名次表现分 × 参赛规模系数 × 完赛系数 × 稳定性系数
 * 最终限制在 0～10 分。
 * 无参赛资格（driverLaps <= 0）直接返回 0。
 */
export function computeRaceRankScore(input: RaceRankInput): number {
    if (!isRankEligible(input.driverLaps)) return 0;
    const posScore = positionPerformanceScore(input.gridSize, input.position);
    const gsc = gridScaleCoeff(input.gridSize);
    const fc = finishCoeff(input.driverLaps, input.winnerLaps);
    const sc = stabilityCoeff(input.validLapRate);
    const raw = posScore * gsc * fc * sc;
    return Math.min(10, Math.max(0, raw));
}

/**
 * Map total Rank average to a tier.
 * Rookie is handled separately (不足10场 → Rookie).
 */
export function tierFromTotalRank(total: number): DriverTier {
    if (total >= 8.5) return 'Platinum';
    if (total >= 7.0) return 'Gold';
    if (total >= 5.0) return 'Silver';
    if (total >= 3.0) return 'Bronze';
    return 'Bronze';
}

/**
 * Compute driver total Rank from an array of recent race Rank scores.
 * Returns null if fewer than 10 races.
 */
export function computeDriverTotalRank(recentRaceRanks: number[]): number | null {
    if (recentRaceRanks.length < 10) return null;
    const last10 = recentRaceRanks.slice(0, 10);
    const sum = last10.reduce((a, b) => a + b, 0);
    return sum / 10;
}