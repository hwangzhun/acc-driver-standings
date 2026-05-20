import { describe, it, expect } from 'vitest';
import {
    positionPercentile,
    positionPerformanceScore,
    gridScaleCoeff,
    stabilityCoeff,
    finishCoeff,
    isRankEligible,
    computeRaceRankScore,
    tierFromTotalRank,
    computeDriverTotalRank,
} from '../utils/rankScore';

describe('positionPercentile', () => {
    it('20人场冠军 → 1.0', () => {
        expect(positionPercentile(20, 1)).toBeCloseTo(1.0, 10);
    });
    it('20人场第10 → (20-10)/(20-1) = 10/19', () => {
        expect(positionPercentile(20, 10)).toBeCloseTo(10 / 19, 10);
    });
    it('gridSize=1, pos=1 → 1', () => {
        expect(positionPercentile(1, 1)).toBe(1);
    });
    it('gridSize=1, pos=2 → 0', () => {
        expect(positionPercentile(1, 2)).toBe(0);
    });
});

describe('positionPerformanceScore', () => {
    it('20人冠军：percentile=1 → 2+8*1^0.8 = 10', () => {
        expect(positionPerformanceScore(20, 1)).toBeCloseTo(10, 5);
    });
    it('20人第10名：percentile=10/19 ≈ 0.5263 → 2+8*0.5263^0.8 ≈ 6.15', () => {
        const got = positionPerformanceScore(20, 10);
        const expected = 2 + 8 * Math.pow(10 / 19, 0.8);
        expect(got).toBeCloseTo(expected, 5);
    });
    it('2人亚军：percentile=(2-2)/(2-1)=0 → 2+8*0 = 2', () => {
        expect(positionPerformanceScore(2, 2)).toBeCloseTo(2, 5);
    });
});

describe('gridScaleCoeff', () => {
    it('2人场 ≈ 0.857', () => {
        expect(gridScaleCoeff(2)).toBeCloseTo(0.85 + 0.15 * (1 / 19), 5);
    });
    it('20人场 → 1.00', () => {
        expect(gridScaleCoeff(20)).toBe(1.0);
    });
    it('21人场 → 1.00 (min saturation)', () => {
        expect(gridScaleCoeff(21)).toBe(1.0);
    });
    it('1人场 → 0.85 (min gridSize-1=0)', () => {
        expect(gridScaleCoeff(1)).toBe(0.85);
    });
});

describe('stabilityCoeff', () => {
    it('>= 95% → 1.10', () => {
        expect(stabilityCoeff(0.95)).toBe(1.10);
        expect(stabilityCoeff(1.0)).toBe(1.10);
    });
    it('>= 90% → 1.07', () => {
        expect(stabilityCoeff(0.90)).toBe(1.07);
        expect(stabilityCoeff(0.94)).toBe(1.07);
    });
    it('>= 80% → 1.04', () => {
        expect(stabilityCoeff(0.80)).toBe(1.04);
        expect(stabilityCoeff(0.89)).toBe(1.04);
    });
    it('>= 70% → 1.00', () => {
        expect(stabilityCoeff(0.70)).toBe(1.00);
        expect(stabilityCoeff(0.79)).toBe(1.00);
    });
    it('< 70% → 0.95', () => {
        expect(stabilityCoeff(0.69)).toBe(0.95);
        expect(stabilityCoeff(0.0)).toBe(0.95);
    });
});

describe('finishCoeff', () => {
    it('completed >= 80% of winner laps → 1.0', () => {
        expect(finishCoeff(10, 10)).toBe(1.0);
        expect(finishCoeff(9, 10)).toBe(1.0);
        expect(finishCoeff(8, 10)).toBe(1.0);
    });
    it('completed < 80% of winner laps → 0.2 (DNF)', () => {
        expect(finishCoeff(7, 10)).toBe(0.2);
        expect(finishCoeff(1, 10)).toBe(0.2);
        expect(finishCoeff(0, 10)).toBe(0.2);
    });
    it('winnerLaps <= 0 → 0.2', () => {
        expect(finishCoeff(5, 0)).toBe(0.2);
        expect(finishCoeff(5, -1)).toBe(0.2);
    });
});

describe('isRankEligible', () => {
    it('laps > 0 → true', () => {
        expect(isRankEligible(1)).toBe(true);
        expect(isRankEligible(99)).toBe(true);
    });
    it('laps <= 0 → false', () => {
        expect(isRankEligible(0)).toBe(false);
        expect(isRankEligible(-1)).toBe(false);
    });
});

describe('computeRaceRankScore', () => {
    it('20人冠军+完赛+100%有效圈 → clamp 到 10.00', () => {
        const score = computeRaceRankScore({
            gridSize: 20,
            position: 1,
            driverLaps: 20,
            winnerLaps: 20,
            validLapRate: 1.0,
        });
        // posScore=10, gsc=1.0, fc=1.0, sc=1.10 → raw=11.0 → clamp 10.0
        expect(score).toBe(10.0);
    });
    it('20人P5+完赛+90%有效圈', () => {
        const score = computeRaceRankScore({
            gridSize: 20,
            position: 5,
            driverLaps: 20,
            winnerLaps: 20,
            validLapRate: 0.90,
        });
        const percentile = (20 - 5) / 19;
        const posScore = 2 + 8 * Math.pow(percentile, 0.8);
        const gsc = 1.0;
        const fc = 1.0;
        const sc = 1.07;
        const expected = Math.min(10, posScore * gsc * fc * sc);
        expect(score).toBeCloseTo(expected, 5);
    });
    it('20人DNF(完赛<80%)+90%有效圈 → 系数 0.2 大幅降低', () => {
        const score = computeRaceRankScore({
            gridSize: 20,
            position: 5,
            driverLaps: 5,   // 5/20=25% < 80% → fc=0.2
            winnerLaps: 20,
            validLapRate: 0.90,
        });
        const percentile = (20 - 5) / 19;
        const posScore = 2 + 8 * Math.pow(percentile, 0.8);
        const gsc = 1.0;
        const fc = 0.2;
        const sc = 1.07;
        const expected = Math.min(10, posScore * gsc * fc * sc);
        expect(score).toBeCloseTo(expected, 5);
    });
    it('2人小场冠军：规模系数≈0.857，分数明显低于大场冠军', () => {
        const small = computeRaceRankScore({
            gridSize: 2,
            position: 1,
            driverLaps: 10,
            winnerLaps: 10,
            validLapRate: 1.0,
        });
        const large = computeRaceRankScore({
            gridSize: 20,
            position: 1,
            driverLaps: 20,
            winnerLaps: 20,
            validLapRate: 1.0,
        });
        expect(small).toBeLessThan(large); // small场冠军 < 大场冠军(被clamp到10)
        // 2人冠军：percentile=1, posScore=10, gsc=0.85+0.15*1/19≈0.8579, fc=1, sc=1.10
        // raw≈10*0.8579*1*1.10≈9.437
        expect(small).toBeCloseTo(9.44, 1);
    });
    it('result is always clamped to 0..10', () => {
        const max = computeRaceRankScore({ gridSize: 100, position: 1, driverLaps: 100, winnerLaps: 100, validLapRate: 1.0 });
        expect(max).toBe(10.0);
    });
    it('driverLaps = 0 → rank 0 (无参赛资格)', () => {
        const score = computeRaceRankScore({ gridSize: 20, position: 5, driverLaps: 0, winnerLaps: 20, validLapRate: 0 });
        expect(score).toBe(0);
    });
});

describe('tierFromTotalRank', () => {
    it('Platinum >= 8.5', () => {
        expect(tierFromTotalRank(8.5)).toBe('Platinum');
        expect(tierFromTotalRank(10)).toBe('Platinum');
    });
    it('Gold 7.0–8.4', () => {
        expect(tierFromTotalRank(7.0)).toBe('Gold');
        expect(tierFromTotalRank(8.4)).toBe('Gold');
    });
    it('Silver 5.0–6.9', () => {
        expect(tierFromTotalRank(5.0)).toBe('Silver');
        expect(tierFromTotalRank(6.9)).toBe('Silver');
    });
    it('Bronze 3.0–4.9', () => {
        expect(tierFromTotalRank(3.0)).toBe('Bronze');
        expect(tierFromTotalRank(4.9)).toBe('Bronze');
    });
    it('below 3.0 → Bronze', () => {
        expect(tierFromTotalRank(2.9)).toBe('Bronze');
        expect(tierFromTotalRank(0)).toBe('Bronze');
    });
});

describe('computeDriverTotalRank', () => {
    it('< 10 races → null', () => {
        expect(computeDriverTotalRank([])).toBeNull();
        expect(computeDriverTotalRank([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBeNull();
    });
    it('exactly 10 races → average of all 10', () => {
        const scores = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
        expect(computeDriverTotalRank(scores)).toBe(5.5);
    });
    it('> 10 races → average of last 10 only', () => {
        const scores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10];
        // last 10 (indices 0-9): 1+2+3+4+5+6+7+8+9+10 = 55 → 5.5
        expect(computeDriverTotalRank(scores)).toBe(5.5);
    });
});