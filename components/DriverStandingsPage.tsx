import React, { useState, useEffect, useCallback } from 'react';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';
import type { DriverStanding, SortField } from '../db/standingsTypes';
import { getDrivers } from '../services/standingsApi';
import DriverTierBadge from './DriverTierBadge';

const SORT_OPTIONS: { value: SortField; label: string }[] = [
    { value: 'points', label: '积分' },
    { value: 'license_points', label: '驾照分' },
    { value: 'total_races', label: '场次' },
];

interface Props {
    onOpenDriver: (id: number) => void;
    usePoints: boolean;
}

const DriverStandingsPage: React.FC<Props> = ({ onOpenDriver, usePoints }) => {
    const [sortField, setSortField] = useState<SortField>('points');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [search, setSearch] = useState('');
    const [drivers, setDrivers] = useState<DriverStanding[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const rows = await getDrivers(sortField, sortOrder, search);
            setDrivers(rows);
        } catch (e) {
            setDrivers([]);
            setLoadError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [sortField, sortOrder, search]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const toggleSort = (field: SortField) => {
        if (field === 'points' && !usePoints) return;
        if (sortField === field) {
            setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const activeSortOptions = SORT_OPTIONS.filter(opt => opt.value !== 'points' || usePoints);

    useEffect(() => {
        if (!usePoints && sortField === 'points') {
            setSortField('license_points');
        }
    }, [usePoints]);

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return null;
        return sortOrder === 'desc'
            ? <ChevronDown className="w-4 h-4 ml-1 inline" />
            : <ChevronUp className="w-4 h-4 ml-1 inline" />;
    };

    return (
        <div className="space-y-4">
            {loadError && (
                <div className="bg-red-950/40 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-200">
                    {loadError}
                </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="搜索车手名称..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500"
                    />
                </div>
                    <div className="flex gap-2">
                        {activeSortOptions.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => toggleSort(opt.value)}
                            className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                                sortField === opt.value
                                    ? 'bg-slate-700 border-slate-500 text-white'
                                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500'
                            }`}
                        >
                            {opt.label}
                            <SortIcon field={opt.value} />
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] text-sm">
                        <thead>
                                <tr className="bg-slate-900 text-slate-400 text-xs uppercase">
                                <th className="p-3 text-left w-12">#</th>
                                <th className="p-3 text-left">车手</th>
                                <th className="p-3 text-left">等级</th>
                                {usePoints && <th className="p-3 text-right">积分</th>}
                                <th className="p-3 text-right">驾照分</th>
                                <th className="p-3 text-right">场次</th>
                                <th className="p-3 text-right">领奖台</th>
                                <th className="p-3 text-right">前10</th>
                                <th className="p-3 text-right">PTW</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/60">
                            {loading ? (
                                    <tr>
                                        <td colSpan={usePoints ? 9 : 8} className="p-8 text-center text-slate-400">
                                            加载中…
                                        </td>
                                    </tr>
                                ) : drivers.length === 0 ? (
                                    <tr>
                                        <td colSpan={usePoints ? 9 : 8} className="p-8 text-center text-slate-400">
                                            暂无数据
                                        </td>
                                    </tr>
                            ) : (
                                drivers.map((d, idx) => (
                                    <tr
                                        key={d.id}
                                        className="hover:bg-slate-700/40 cursor-pointer"
                                        onClick={() => onOpenDriver(d.id)}
                                    >
                                        <td className="p-3 text-slate-400 font-mono text-xs">{idx + 1}</td>
                                        <td className="p-3 text-slate-100 font-medium">{d.name}</td>
                                        <td className="p-3"><DriverTierBadge tier={d.tier} /></td>
                                        {usePoints && <td className="p-3 text-right text-amber-400 font-semibold">{d.points}</td>}
                                        <td className="p-3 text-right">
                                            <span className={`font-semibold ${d.license_points <= 6 ? 'text-orange-400' : 'text-emerald-400'}`}>
                                                {d.license_points}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right text-slate-300">{d.total_races}</td>
                                        <td className="p-3 text-right text-slate-300">{d.podium_count}</td>
                                        <td className="p-3 text-right text-slate-300">{d.top10_count}</td>
                                        <td className="p-3 text-right text-slate-300">{d.ptw_count}</td>
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

export default DriverStandingsPage;
