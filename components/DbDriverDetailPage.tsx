import React, { useState, useEffect } from 'react';
import type { DriverRow, DriverRaceHistory, LicensePointLog, DriverTier } from '../db/standingsTypes';
import { getDriverById, getDriverRaceHistory, getLicensePointLogs, patchDriverTier } from '../services/standingsApi';
import { ArrowLeft, Calendar, MapPin, Trophy, Star, Target } from 'lucide-react';
import DriverTierBadge from './DriverTierBadge';
import { trackDisplay } from '../constants/tracks';

const STAT_CARDS = [
    { key: 'points', label: '积分', icon: Trophy, color: 'text-amber-400' },
    { key: 'license_points', label: '驾照分', icon: Star, color: 'text-emerald-400' },
    { key: 'total_races', label: '总场次', icon: Target, color: 'text-blue-400' },
    { key: 'podium_count', label: '领奖台', icon: Trophy, color: 'text-purple-400' },
    { key: 'top10_count', label: '前10', icon: Target, color: 'text-cyan-400' },
    { key: 'ptw_count', label: 'PTW', icon: Star, color: 'text-red-400' },
];

interface Props {
    driverId: number;
    showSteamId: boolean;
    usePoints: boolean;
    allowTierEdit?: boolean;
    onTierChange?: (tier: DriverTier) => void;
    onBack: () => void;
    onOpenRace: (raceId: number) => void;
}

function formatTime(ms: number): string {
    if (!ms || ms <= 0) return '-';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const ms2 = ms % 1000;
    if (m > 0) return `${m}:${String(s).padStart(2, '0')}.${String(ms2).padStart(3, '0')}`;
    return `${s}.${String(ms2).padStart(3, '0')}`;
}

const DbDriverDetailPage: React.FC<Props> = ({ driverId, showSteamId, usePoints, allowTierEdit, onTierChange, onBack, onOpenRace }) => {
    const [driver, setDriver] = useState<DriverRow | null | undefined>(undefined);
    const [history, setHistory] = useState<DriverRaceHistory[]>([]);
    const [logs, setLogs] = useState<LicensePointLog[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [tierSaving, setTierSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoadError(null);
            setDriver(undefined);
            try {
                const [d, h, l] = await Promise.all([
                    getDriverById(driverId),
                    getDriverRaceHistory(driverId),
                    getLicensePointLogs(driverId),
                ]);
                if (cancelled) return;
                setDriver(d);
                setHistory(h);
                setLogs(l);
            } catch (e) {
                if (!cancelled) {
                    setDriver(null);
                    setHistory([]);
                    setLogs([]);
                    setLoadError(e instanceof Error ? e.message : String(e));
                }
            }
        }
        void load();
        return () => {
            cancelled = true;
        };
    }, [driverId]);

    if (driver === undefined) {
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center text-slate-400">
                加载中…
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center text-red-300">
                {loadError}
            </div>
        );
    }

    if (!driver) {
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center text-slate-400">
                未找到该车手
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800/90 border border-slate-600 text-slate-100 text-sm font-medium hover:bg-slate-700 hover:border-slate-500 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                返回榜单
            </button>

            {/* Driver header */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-bold text-white">{driver.name}</h2>
                            <DriverTierBadge tier={driver.tier} />
                            {allowTierEdit && onTierChange && (
                                <select
                                    value={driver.tier}
                                    onChange={async (e) => {
                                        const newTier = e.target.value as DriverTier;
                                        setDriver((prev) => prev ? { ...prev, tier: newTier } : prev);
                                        try {
                                            await patchDriverTier(driverId, newTier);
                                        } catch {
                                            if (driver) setDriver({ ...driver });
                                        }
                                    }}
                                    disabled={tierSaving}
                                    className="bg-slate-700 border border-slate-500 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-red-500 disabled:opacity-50"
                                >
                                    <option value="Rookie">Rookie</option>
                                    <option value="Bronze">Bronze</option>
                                    <option value="Silver">Silver</option>
                                    <option value="Gold">Gold</option>
                                    <option value="Platinum">Platinum</option>
                                </select>
                            )}
                        </div>
                        {showSteamId && driver.steam_id && (
                            <p className="text-sm text-slate-400 font-mono mt-1">{driver.steam_id}</p>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {STAT_CARDS.filter(c => c.key !== 'points' || usePoints).map(({ key, label, icon: Icon, color }) => {
                            const val = (driver as Record<string, number>)[key] as number;
                            return (
                                <div key={key} className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 min-w-[100px]">
                                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                                        <Icon className={`w-3.5 h-3.5 ${color}`} />
                                        {label}
                                    </div>
                                    <div className={`text-xl font-bold ${color}`}>{val}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Race history */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-700">
                    <h3 className="text-lg font-semibold text-white">参赛记录</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-sm">
                        <thead>
                            <tr className="bg-slate-900 text-slate-400 text-xs uppercase">
                                <th className="p-3 text-left">比赛</th>
                                <th className="p-3 text-left">赛道</th>
                                <th className="p-3 text-left">日期</th>
                                <th className="p-3 text-right">名次</th>
                                {usePoints && <th className="p-3 text-right">积分</th>}
                                <th className="p-3 text-right">圈数</th>
                                <th className="p-3 text-right">用时</th>
                                <th className="p-3 text-right">最快圈</th>
                                <th className="p-3 text-center">领奖台</th>
                                <th className="p-3 text-center">前10</th>
                                <th className="p-3 text-center">PTW</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/60">
                                {history.length === 0 ? (
                                <tr>
                                    <td colSpan={usePoints ? 11 : 10} className="p-8 text-center text-slate-400">
                                        暂无参赛记录
                                    </td>
                                </tr>
                            ) : (
                                history.map((r) => (
                                    <tr
                                        key={r.race_id}
                                        className="hover:bg-slate-700/40 cursor-pointer"
                                        onClick={() => onOpenRace(r.race_id)}
                                    >
                                        <td className="p-3 text-slate-100">{r.race_name}</td>
                                        <td className="p-3 text-slate-400">{trackDisplay(r.track_name)}</td>
                                        <td className="p-3 text-slate-400 text-xs">{r.race_date?.slice(0, 10)}</td>
                                        <td className="p-3 text-right">
                                            <span className={`font-bold ${r.position <= 3 ? 'text-amber-400' : 'text-slate-200'}`}>
                                                {r.position}
                                            </span>
                                        </td>
                                        {usePoints && <td className="p-3 text-right text-amber-400 font-semibold">{r.points}</td>}
                                        <td className="p-3 text-right text-slate-300">{r.laps}</td>
                                        <td className="p-3 text-right text-slate-300 font-mono text-xs">{formatTime(r.total_time)}</td>
                                        <td className="p-3 text-right text-slate-300 font-mono text-xs">{formatTime(r.best_lap)}</td>
                                        <td className="p-3 text-center">
                                            {r.is_podium ? <span className="text-amber-400">Y</span> : <span className="text-slate-600">-</span>}
                                        </td>
                                        <td className="p-3 text-center">
                                            {r.is_top10 ? <span className="text-cyan-400">Y</span> : <span className="text-slate-600">-</span>}
                                        </td>
                                        <td className="p-3 text-center">
                                            {r.is_ptw ? <span className="text-red-400">Y</span> : <span className="text-slate-600">-</span>}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* License point log */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-700">
                    <h3 className="text-lg font-semibold text-white">驾照分记录</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-sm">
                        <thead>
                            <tr className="bg-slate-900 text-slate-400 text-xs uppercase">
                                <th className="p-3 text-left">类型</th>
                                <th className="p-3 text-right">变动</th>
                                <th className="p-3 text-right">变动后</th>
                                <th className="p-3 text-left">备注</th>
                                <th className="p-3 text-left">操作人</th>
                                <th className="p-3 text-left">时间</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/60">
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-slate-400">
                                        暂无记录
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-700/40">
                                        <td className="p-3">
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                                log.change_value > 0
                                                    ? 'bg-emerald-900/50 text-emerald-400'
                                                    : 'bg-orange-900/50 text-orange-400'
                                            }`}>
                                                {log.change_value > 0 ? '加分' : '扣分'}
                                            </span>
                                        </td>
                                        <td className={`p-3 text-right font-semibold ${
                                            log.change_value > 0 ? 'text-emerald-400' : 'text-orange-400'
                                        }`}>
                                            {log.change_value > 0 ? '+' : ''}{log.change_value}
                                        </td>
                                        <td className="p-3 text-right text-slate-200 font-semibold">{log.after_points}</td>
                                        <td className="p-3 text-slate-300 text-xs max-w-[200px] truncate" title={log.reason}>{log.reason}</td>
                                        <td className="p-3 text-slate-400 text-xs">{log.operator || '-'}</td>
                                        <td className="p-3 text-slate-400 text-xs">{log.created_at?.slice(0, 16)}</td>
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

export default DbDriverDetailPage;
