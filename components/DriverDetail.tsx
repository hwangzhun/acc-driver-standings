import React, { useEffect, useState } from 'react';
import { Lap, LeaderboardLine, CAR_MODELS, Penalty, getCarClassByModelId } from '../types';
import {
    formatTime,
    getSectorColor,
    formatTimeShort,
    carClassBadgeClass,
    sumJsonTimePenaltyMs,
    formatPenaltyDelta,
    JSON_TIME_PENALTY_SUM_MIN_MS,
    formatPenaltyTypeLabel,
    isIgnoredJsonPenaltyType,
} from '../utils';
import { TrendingUp, AlertTriangle } from 'lucide-react';

interface DriverDetailProps {
    carId: number | null;
    leaderboard: LeaderboardLine[];
    laps: Lap[];
    sessionBestSplits: number[];
    sessionType?: string;
    /** 来自成绩 JSON 的 serverName，用于空状态与会话上下文 */
    sessionTitle?: string;
    trackName?: string;
    penalties?: Penalty[];
    manualPenaltyMsByCarId?: Record<number, number>;
    onManualPenaltyChange?: (carId: number, ms: number) => void;
}

const DriverDetail: React.FC<DriverDetailProps> = ({
    carId,
    leaderboard,
    laps,
    sessionBestSplits,
    sessionType = '',
    sessionTitle,
    trackName,
    penalties = [],
    manualPenaltyMsByCarId = {},
    onManualPenaltyChange,
}) => {
    const [draftSec, setDraftSec] = useState('');
    const manualMsForCar =
        carId != null ? Math.max(0, manualPenaltyMsByCarId[carId] ?? 0) : 0;

    useEffect(() => {
        if (carId == null) return;
        setDraftSec(manualMsForCar === 0 ? '' : String(manualMsForCar / 1000));
    }, [carId, manualMsForCar]);

    if (!carId) {
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-2xl h-full flex flex-col items-center justify-center text-slate-500 text-center">
                <TrendingUp className="w-12 h-12 mb-4 opacity-20" />
                {sessionTitle ? (
                    <p className="text-slate-400 text-sm font-medium mb-2 max-w-full px-2">{sessionTitle}</p>
                ) : null}
                {trackName ? (
                    <p className="text-xs text-slate-600 font-mono capitalize mb-3">{trackName}</p>
                ) : null}
                <p className="text-sm">请从排行榜选择一位车手以查看详细数据。</p>
            </div>
        );
    }

    const driverLine = leaderboard.find((l) => l.car.carId === carId);
    if (!driverLine) return null;

    const driverLaps = laps.filter((l) => l.carId === carId);
    const driverPenalties = penalties.filter(
        (p) => p.carId === carId && !isIgnoredJsonPenaltyType(p.penalty)
    );
    const jsonPenaltyMs = sumJsonTimePenaltyMs(carId, penalties);
    const totalPenaltyMs = jsonPenaltyMs + manualMsForCar;
    const isRace = sessionType === 'R';
    const totalTimeRaw = driverLine.timing.totalTime;
    const canShowWithPenalty =
        isRace && totalTimeRaw && totalTimeRaw !== 2147483647;

    const personalBestSplits = [999999, 999999, 999999];
    driverLaps
        .filter((l) => l.isValidForBest)
        .forEach((lap) => {
            lap.splits.forEach((split, idx) => {
                if (split < personalBestSplits[idx]) personalBestSplits[idx] = split;
            });
        });

    const theoreticalBest = personalBestSplits.reduce((a, b) => a + b, 0);
    const carClass = getCarClassByModelId(driverLine.car.carModel);
    const classLabel = carClass ?? '—';

    const applyManualFromDraft = () => {
        if (!onManualPenaltyChange) return;
        const n = parseFloat(draftSec.replace(',', '.'));
        const sec = Number.isFinite(n) ? Math.max(0, n) : 0;
        onManualPenaltyChange(carId, Math.round(sec * 1000));
    };

    const clearManual = () => {
        setDraftSec('');
        onManualPenaltyChange?.(carId, 0);
    };

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-2xl flex flex-col h-full max-h-[600px] lg:max-h-[800px]">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-2xl font-black text-white italic">#{driverLine.car.raceNumber}</span>
                            <span className="text-lg font-bold text-slate-200">
                                {driverLine.currentDriver.firstName} {driverLine.currentDriver.lastName}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${carClassBadgeClass(carClass)}`}
                            >
                                组别 {classLabel}
                            </span>
                            <p className="text-xs text-slate-400 font-mono">
                                {CAR_MODELS[driverLine.car.carModel] || `车型 ${driverLine.car.carModel}`}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-slate-500 uppercase font-bold">最快圈</p>
                        <p className="text-xl font-mono font-bold text-green-400">{formatTime(driverLine.timing.bestLap)}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4">
                    <div className="bg-slate-900/50 p-2 rounded border border-slate-700/50">
                        <p className="text-[10px] text-slate-500 uppercase">理论最快</p>
                        <p className="text-sm font-mono text-purple-400">{formatTime(theoreticalBest)}</p>
                    </div>
                    <div className="bg-slate-900/50 p-2 rounded border border-slate-700/50">
                        <p className="text-[10px] text-slate-500 uppercase">有效圈</p>
                        <p className="text-sm font-mono text-slate-300">
                            {driverLaps.filter((l) => l.isValidForBest).length}{' '}
                            <span className="text-slate-600">/ {driverLaps.length}</span>
                        </p>
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                    <div className="bg-slate-900/50 rounded border border-slate-700/50 px-1.5 py-1.5">
                        <p className="text-[9px] text-slate-500 uppercase">JSON 罚时</p>
                        <p className="text-[11px] font-mono text-amber-200/90">{formatPenaltyDelta(jsonPenaltyMs)}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded border border-slate-700/50 px-1.5 py-1.5">
                        <p className="text-[9px] text-slate-500 uppercase">手动罚时</p>
                        <p className="text-[11px] font-mono text-amber-200/90">{formatPenaltyDelta(manualMsForCar)}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded border border-amber-900/40 px-1.5 py-1.5">
                        <p className="text-[9px] text-slate-500 uppercase">合计</p>
                        <p className="text-[11px] font-mono font-semibold text-amber-300">{formatPenaltyDelta(totalPenaltyMs)}</p>
                    </div>
                </div>

                {canShowWithPenalty && (
                    <p className="mt-2 text-[11px] font-mono text-slate-400">
                        含罚时完赛（参考）：{' '}
                        <span className="text-slate-200">{formatTime(totalTimeRaw + totalPenaltyMs)}</span>
                    </p>
                )}

                {onManualPenaltyChange && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="text-[10px] text-slate-500 whitespace-nowrap">手动加罚（秒）</label>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={draftSec}
                            onChange={(e) => setDraftSec(e.target.value)}
                            onBlur={applyManualFromDraft}
                            placeholder="0"
                            className="w-20 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-xs font-mono text-white"
                        />
                        <button
                            type="button"
                            onClick={applyManualFromDraft}
                            className="text-[10px] px-2 py-1 rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                        >
                            应用
                        </button>
                        <button
                            type="button"
                            onClick={clearManual}
                            className="text-[10px] px-2 py-1 rounded border border-slate-600 text-slate-400 hover:text-white"
                        >
                            清除
                        </button>
                    </div>
                )}

                {driverPenalties.length > 0 && (
                    <div className="mt-3 space-y-1.5 max-h-28 overflow-y-auto">
                        {driverPenalties.map((p, i) => {
                            const typeLabel = formatPenaltyTypeLabel(p.penalty);
                            return (
                            <div
                                key={`${p.penalty}-${p.violationInLap}-${i}`}
                                className="text-[11px] bg-amber-950/40 border border-amber-800/50 rounded px-2 py-1.5 text-amber-100/90"
                            >
                                <span className="font-semibold text-yellow-400 font-mono">{typeLabel}</span>
                                {typeLabel !== p.penalty ? (
                                    <span className="text-slate-500 font-mono text-[10px] ml-1">({p.penalty})</span>
                                ) : null}
                                {p.penaltyValue >= JSON_TIME_PENALTY_SUM_MIN_MS ? (
                                    <span className="text-amber-200/80 font-mono"> {formatPenaltyDelta(p.penaltyValue)}</span>
                                ) : null}
                                {p.reason ? <span className="text-slate-400"> · {p.reason}</span> : null}
                                {p.violationInLap >= 0 ? (
                                    <span className="text-slate-500"> （第 {p.violationInLap} 圈）</span>
                                ) : null}
                            </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="overflow-y-auto flex-grow bg-slate-800">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-900 z-10 shadow-md">
                        <tr className="text-slate-400 font-mono uppercase">
                            <th className="p-2 text-center w-10">圈</th>
                            <th className="p-2 text-right">时间</th>
                            <th className="p-2 text-right text-slate-600">S1</th>
                            <th className="p-2 text-right text-slate-600">S2</th>
                            <th className="p-2 text-right text-slate-600">S3</th>
                            <th className="p-2 text-center w-8"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                        {driverLaps.map((lap, idx) => {
                            const isPB = lap.laptime === driverLine.timing.bestLap;
                            return (
                                <tr key={idx} className={`font-mono hover:bg-slate-700/30 ${isPB ? 'bg-slate-700/50' : ''}`}>
                                    <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                                    <td
                                        className={`p-2 text-right font-bold ${
                                            isPB
                                                ? 'text-green-400'
                                                : lap.isValidForBest
                                                  ? 'text-slate-200'
                                                  : 'text-red-400 line-through decoration-red-500/50'
                                        }`}
                                    >
                                        {formatTime(lap.laptime)}
                                    </td>
                                    {lap.splits.map((split, sIdx) => (
                                        <td
                                            key={sIdx}
                                            className={`p-2 text-right ${
                                                lap.isValidForBest
                                                    ? getSectorColor(
                                                          split,
                                                          personalBestSplits[sIdx],
                                                          sessionBestSplits[sIdx]
                                                      )
                                                    : 'text-slate-600'
                                            }`}
                                        >
                                            {formatTimeShort(split)}
                                        </td>
                                    ))}
                                    <td className="p-2 text-center">
                                        {!lap.isValidForBest && (
                                            <AlertTriangle className="w-3 h-3 text-red-500 mx-auto" />
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default DriverDetail;
