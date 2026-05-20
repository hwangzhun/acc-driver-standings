import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeSchema2Penalties } from './standingsImport';
import { schema2ToAccResultData } from './schema2ToAccResultData';

describe('normalizeSchema2Penalties', () => {
    it('嵌套 penalties 对象 → 拆出 system 与 manual', () => {
        const { system, manual } = normalizeSchema2Penalties({
            schemaVersion: '2.0',
            session: { sessionType: 'R', trackName: 't', serverName: 's' },
            finalRanking: [],
            penalties: {
                system: [{ carId: 1, penalty: 'DriveThrough', penaltyValue: 3 }],
                manual: [{ carId: 2, type: 'TimePenalty', valueMs: 5000 }],
            },
        });
        expect(system).toHaveLength(1);
        expect(system[0].carId).toBe(1);
        expect(manual).toHaveLength(1);
        expect(manual[0].carId).toBe(2);
    });
});

describe('schema2ToAccResultData', () => {
    it('直接转换 sessions/1.json', () => {
        const path = join(process.cwd(), 'sessions', '1.json');
        const raw = JSON.parse(readFileSync(path, 'utf8'));
        const data = schema2ToAccResultData(raw);
        expect(data.sessionResult.leaderBoardLines.length).toBeGreaterThan(0);
        expect(data.penalties.some((p) => p.penalty === 'DriveThrough')).toBe(true);
    });
});
