import React, { useEffect, useState } from 'react';
import type { RaceRow, RaceResultRow } from '../db/standingsTypes';
import { getRaceById, getRaceResultsWithDrivers } from '../services/standingsApi';
import { ArrowLeft, Calendar, MapPin } from 'lucide-react';
import { trackDisplay } from '../constants/tracks';

function formatTime(ms: number): string {
    if (!ms || ms <= 0) return '-';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const ms2 = ms % 1000;
    if (m > 0) return `${m}:${String(s).padStart(2, '0')}.${String(ms2).padStart(3, '0')}`;
    return `${s}.${String(ms2).padStart(3, '0')}`;
}

interface Props {
    raceId: number;
    showSteamId: boolean;
    usePoints: boolean;
    onBack: () => void;
}

const DbRaceDetailPage: React.FC<Props> = ({ raceId, showSteamId, usePoints, onBack }) => {
    const [race, setRace] = useState<RaceRow | null | undefined>(undefined);
    const [results, setResults] = useState<Array<RaceResultRow & { driver_name: string; steam_id: string }>>([]);
    const [dbError, setDbError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function loadRace() {
            setDbError(null);
            setRace(undefined);
            setResults([]);
            try {
                const [r, res] = await Promise.all([
                    getRaceById(raceId),
                    getRaceResultsWithDrivers(raceId),
                ]);
                if (cancelled) return;
                setRace(r);
                setResults(res);
            } catch (e) {
                if (!cancelled) {
                    setRace(null);
                    setResults([]);
                    setDbError(e instanceof Error ? e.message : String(e));
                }
            }
        }
        void loadRace();
        return () => {
            cancelled = true;
        };
    }, [raceId]);

    if (race === undefined) {
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-slate-300">
                正在加载比赛信息…
            </div>
        );
    }

    if (dbError) {
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center text-red-300">
                {dbError}
            </div>
        );
    }

    if (!race) {
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center text-slate-400">
                未找到该比赛
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800/90 border border-slate-600 text-slate-100 text-sm font-medium hover:bg-slate-700 hover:border-slate-500 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                返回
            </button>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <h2 className="text-xl font-bold text-white">{race.race_name}</h2>
                <p className="text-xs text-slate-500 mt-1">比赛快照</p>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-400">
                    {race.track_name && (
                        <span className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-red-400" />
                            <span>{trackDisplay(race.track_name)}</span>
                        </span>
                    )}
                    {race.race_date && (
                        <span className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-blue-400" />
                            {race.race_date.slice(0, 10)}
                        </span>
                    )}
                    {race.server_name && <span className="text-slate-500 text-xs">{race.server_name}</span>}
                </div>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-sm">
                        <thead>
                            <tr className="bg-slate-900 text-slate-400 text-xs uppercase">
                                <th className="p-3 text-left w-12">#</th>
                                <th className="p-3 text-left">车手</th>
                                {showSteamId && <th className="p-3 text-left">SteamID</th>}
                                <th className="p-3 text-right">圈数</th>
                                <th className="p-3 text-right">总用时</th>
                                <th className="p-3 text-right">最快圈</th>
                                {usePoints && <th className="p-3 text-right">积分</th>}
                                <th className="p-3 text-right">Rank</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/60">
                            {results.length === 0 ? (
                                <tr>
                                    <td colSpan={showSteamId ? (usePoints ? 8 : 7) : (usePoints ? 7 : 6)} className="p-8 text-center text-slate-400">
                                        暂无数据
                                    </td>
                                </tr>
                            ) : (
                                results.map((r, idx) => (
                                    <tr key={r.id} className="hover:bg-slate-700/40">
                                        <td className="p-3 text-slate-400 font-mono text-xs">{idx + 1}</td>
                                        <td className="p-3 text-slate-100 font-medium">{r.driver_name}</td>
                                        {showSteamId && (
                                            <td className="p-3 text-slate-400 font-mono text-xs">{r.steam_id}</td>
                                        )}
                                        <td className="p-3 text-right text-slate-300">{r.laps}</td>
                                        <td className="p-3 text-right text-slate-300 font-mono text-xs">
                                            {formatTime(r.total_time)}
                                        </td>
                                        <td className="p-3 text-right text-slate-300 font-mono text-xs">
                                            {formatTime(r.best_lap)}
                                        </td>
                                        {usePoints && <td className="p-3 text-right text-amber-400 font-semibold">{r.points}</td>}
                                        <td className="p-3 text-right text-yellow-400 font-semibold">
                                            {r.rank_score > 0 ? r.rank_score.toFixed(2) : '—'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default DbRaceDetailPage;