import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import type { CalendarEventRow, RaceRow } from '../db/standingsTypes';
import {
    getCalendarEvents,
    getRaces,
    adminCreateCalendarEvent,
    adminUpdateCalendarEvent,
    adminDeleteCalendarEvent,
} from '../services/standingsApi';
import { TRACKS, trackDisplay } from '../constants/tracks';

interface Props {
    onBack: () => void;
}

interface EditEvent {
    id?: number;
    event_date: string;
    title: string;
    track_name: string;
    notes: string;
    linked_race_id: number | null;
    event_detail: string;
    event_session_time: string;
    race_duration: string;
    car_group: string;
    bop: string;
    entry_requirements: string;
    pit_rules: string;
}

const AdminCalendarPage: React.FC<Props> = ({ onBack }) => {
    const [events, setEvents] = useState<CalendarEventRow[]>([]);
    const [races, setRaces] = useState<RaceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [editing, setEditing] = useState<EditEvent | null>(null);
    const [isNew, setIsNew] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const [evRows, raceRows] = await Promise.all([getCalendarEvents(), getRaces()]);
            setEvents(evRows);
            setRaces(raceRows);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const startCreate = () => {
        setEditing({
            event_date: '',
            title: '',
            track_name: '',
            notes: '',
            linked_race_id: null,
            event_detail: '',
            event_session_time: '',
            race_duration: '',
            car_group: '',
            bop: '',
            entry_requirements: '',
            pit_rules: '',
        });
        setIsNew(true);
        setError(null);
    };

    const startEdit = (ev: CalendarEventRow) => {
        setEditing({
            id: ev.id,
            event_date: ev.event_date,
            title: ev.title,
            track_name: ev.track_name ?? '',
            notes: ev.notes ?? '',
            linked_race_id: ev.linked_race_id,
            event_detail: ev.event_detail ?? '',
            event_session_time: ev.event_session_time ?? '',
            race_duration: ev.race_duration ?? '',
            car_group: ev.car_group ?? '',
            bop: ev.bop ?? '',
            entry_requirements: ev.entry_requirements ?? '',
            pit_rules: ev.pit_rules ?? '',
        });
        setIsNew(false);
        setError(null);
    };

    const cancelEdit = () => {
        setEditing(null);
        setError(null);
    };

    const handleSave = async () => {
        if (!editing) return;
        if (!editing.event_date.trim() || !editing.title.trim()) {
            setError('日期和标题不能为空');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            if (isNew) {
                await adminCreateCalendarEvent({
                    event_date: editing.event_date,
                    title: editing.title,
                    track_name: editing.track_name || undefined,
                    notes: editing.notes || undefined,
                    linked_race_id: editing.linked_race_id,
                    event_detail: editing.event_detail || undefined,
                    event_session_time: editing.event_session_time || undefined,
                    race_duration: editing.race_duration || undefined,
                    car_group: editing.car_group || undefined,
                    bop: editing.bop || undefined,
                    entry_requirements: editing.entry_requirements || undefined,
                    pit_rules: editing.pit_rules || undefined,
                });
            } else if (editing.id != null) {
                await adminUpdateCalendarEvent(editing.id, {
                    event_date: editing.event_date,
                    title: editing.title,
                    track_name: editing.track_name || undefined,
                    notes: editing.notes || undefined,
                    linked_race_id: editing.linked_race_id,
                    event_detail: editing.event_detail || undefined,
                    event_session_time: editing.event_session_time || undefined,
                    race_duration: editing.race_duration || undefined,
                    car_group: editing.car_group || undefined,
                    bop: editing.bop || undefined,
                    entry_requirements: editing.entry_requirements || undefined,
                    pit_rules: editing.pit_rules || undefined,
                });
            }
            setEditing(null);
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('确认删除该赛历条目？')) return;
        try {
            await adminDeleteCalendarEvent(id);
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="text-slate-400 hover:text-white text-sm transition-colors"
                >
                    ← 返回
                </button>
                <h2 className="text-xl font-bold text-white">赛历管理</h2>
            </div>

            {error && (
                <div className="bg-red-950/40 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-200">
                    {error}
                </div>
            )}

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={startCreate}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    新增赛历
                </button>
            </div>

            {editing && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
                    <h3 className="text-white font-semibold">{isNew ? '新增赛历' : '编辑赛历'}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">日期 *</label>
                            <input
                                type="date"
                                value={editing.event_date}
                                onChange={(e) => setEditing({ ...editing, event_date: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">赛事标题 *</label>
                            <input
                                type="text"
                                value={editing.title}
                                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                                placeholder="e.g. 第三轮厂商杯"
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">赛道</label>
                            <select
                                value={editing.track_name}
                                onChange={(e) => setEditing({ ...editing, track_name: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                            >
                                <option value="">选择赛道</option>
                                {Object.entries(TRACKS).map(([key, val]) => (
                                    <option key={key} value={key}>
                                        {val.zh}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="sm:col-span-2 lg:col-span-3">
                            <label className="block text-xs text-slate-400 mb-1">关联场次（可选）</label>
                            <select
                                value={editing.linked_race_id ?? ''}
                                onChange={(e) =>
                                    setEditing({
                                        ...editing,
                                        linked_race_id: e.target.value ? Number(e.target.value) : null,
                                    })
                                }
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                            >
                                <option value="">不关联</option>
                                {races.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.race_name} ({r.race_date?.slice(0, 10)})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="sm:col-span-2 lg:col-span-3">
                            <label className="block text-xs text-slate-400 mb-1">备注</label>
                            <input
                                type="text"
                                value={editing.notes}
                                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                                placeholder="可选备注"
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-3">
                            <label className="block text-xs text-slate-400 mb-1">赛事详情</label>
                            <textarea
                                value={editing.event_detail}
                                onChange={(e) => setEditing({ ...editing, event_detail: e.target.value })}
                                placeholder="可选，赛事说明"
                                rows={2}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 resize-y"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">比赛时间</label>
                            <input
                                type="text"
                                value={editing.event_session_time}
                                onChange={(e) => setEditing({ ...editing, event_session_time: e.target.value })}
                                placeholder="如：练习 14:00 / 排位 15:30"
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">正赛时长</label>
                            <input
                                type="text"
                                value={editing.race_duration}
                                onChange={(e) => setEditing({ ...editing, race_duration: e.target.value })}
                                placeholder="如：60 分钟"
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">组别</label>
                            <input
                                type="text"
                                value={editing.car_group}
                                onChange={(e) => setEditing({ ...editing, car_group: e.target.value })}
                                placeholder="如：Pro / Pro-Am"
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">BOP</label>
                            <input
                                type="text"
                                value={editing.bop}
                                onChange={(e) => setEditing({ ...editing, bop: e.target.value })}
                                placeholder="BOP 说明"
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">准入要求</label>
                            <input
                                type="text"
                                value={editing.entry_requirements}
                                onChange={(e) => setEditing({ ...editing, entry_requirements: e.target.value })}
                                placeholder="准入要求"
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">进站规则</label>
                            <input
                                type="text"
                                value={editing.pit_rules}
                                onChange={(e) => setEditing({ ...editing, pit_rules: e.target.value })}
                                placeholder="进站规则"
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={cancelEdit}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-slate-300 border border-slate-600 rounded-lg hover:bg-slate-700 transition-colors"
                        >
                            <X className="w-4 h-4" />
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-red-700 hover:bg-red-600 text-white rounded-lg disabled:opacity-50 transition-colors"
                        >
                            <Check className="w-4 h-4" />
                            {saving ? '保存中…' : '保存'}
                        </button>
                    </div>
                </div>
            )}

            {loadError && (
                <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-red-200">{loadError}</div>
            )}

            {loading ? (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-slate-300">加载中…</div>
            ) : events.length === 0 && !editing ? (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-slate-400 text-center">
                    暂无赛历，点击右上角新增
                </div>
            ) : (
                <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-900/60 text-slate-400 text-left">
                                <th className="px-4 py-3 font-medium">日期</th>
                                <th className="px-4 py-3 font-medium">赛事</th>
                                <th className="px-4 py-3 font-medium hidden md:table-cell">赛道</th>
                                <th className="px-4 py-3 font-medium hidden lg:table-cell">备注</th>
                                <th className="px-4 py-3 font-medium">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {events.map((ev) => (
                                <tr key={ev.id} className="hover:bg-slate-700/40 transition-colors">
                                    <td className="px-4 py-3 text-slate-200 font-mono">{ev.event_date}</td>
                                    <td className="px-4 py-3 text-white font-medium">{ev.title}</td>
                                    <td className="px-4 py-3 text-slate-400 hidden md:table-cell">
                                        {ev.track_name ? trackDisplay(ev.track_name) : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">
                                        {ev.notes || '-'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-3">
                                            <button
                                                type="button"
                                                onClick={() => startEdit(ev)}
                                                className="text-slate-400 hover:text-white transition-colors"
                                                title="编辑"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(ev.id)}
                                                className="text-slate-400 hover:text-red-400 transition-colors"
                                                title="删除"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default AdminCalendarPage;