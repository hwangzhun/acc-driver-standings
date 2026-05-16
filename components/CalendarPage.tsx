import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X, Flag } from 'lucide-react';
import type { CalendarEventRow } from '../db/standingsTypes';
import { getCalendarEvents } from '../services/standingsApi';
import { trackDisplay } from '../constants/tracks';

interface Props {
    onOpenRace: (raceId: number) => void;
}

type DayCell = {
    date: Date;
    year: number;
    month: number;
    day: number;
    events: CalendarEventRow[];
    isCurrentMonth: boolean;
    isToday: boolean;
};

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/** 统一为 YYYY-MM-DD，避免后台录入 `2026-5-6` 与格子键不一致导致「点不到」 */
function normalizeCalendarDate(raw: string): string {
    const s = raw.trim().slice(0, 10);
    const parts = s.split(/[-/]/).map((p) => p.trim());
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        const y = parts[0];
        const m = parts[1].padStart(2, '0');
        const d = parts[2].padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return s;
}

function buildCalendarDays(year: number, month: number, events: CalendarEventRow[]): DayCell[] {
    const today = new Date();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const eventMap: Record<string, CalendarEventRow[]> = {};
    for (const ev of events) {
        const key = normalizeCalendarDate(ev.event_date);
        if (!eventMap[key]) eventMap[key] = [];
        eventMap[key].push(ev);
    }

    const days: DayCell[] = [];

    for (let i = 0; i < startDow; i++) {
        const d = new Date(year, month, 1 - (startDow - i));
        days.push({
            date: d, year: d.getFullYear(), month: d.getMonth(), day: d.getDate(),
            events: [], isCurrentMonth: false,
            isToday: d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate(),
        });
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
        const date = new Date(year, month, d);
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        days.push({
            date, year, month, day: d,
            events: eventMap[key] ?? [],
            isCurrentMonth: true,
            isToday: date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate(),
        });
    }

    while (days.length < 42) {
        const d = new Date(year, month + 1, days.length - startDow - lastDay.getDate() + 1);
        days.push({
            date: d, year: d.getFullYear(), month: d.getMonth(), day: d.getDate(),
            events: [], isCurrentMonth: false,
            isToday: d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate(),
        });
    }

    return days;
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
    return (
        <div className="flex gap-4 border-b border-slate-700/50 py-2">
            <span className="text-slate-400 text-xs w-20 flex-shrink-0 pt-0.5">{label}</span>
            <span className="text-slate-200 text-sm">{value || '—'}</span>
        </div>
    );
}

const CalendarPage: React.FC<Props> = ({ onOpenRace }) => {
    const [events, setEvents] = useState<CalendarEventRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [current, setCurrent] = useState(() => new Date());
    const [selected, setSelected] = useState<CalendarEventRow | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const rows = await getCalendarEvents();
            setEvents(rows);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const year = current.getFullYear();
    const month = current.getMonth();

    const days = useMemo(() => buildCalendarDays(year, month, events), [year, month, events]);

    const prevMonth = () => setCurrent(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrent(new Date(year, month + 1, 1));

    const monthLabel = `${year}年${month + 1}月`;

    if (loadError) {
        return (
            <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-red-200">
                {loadError}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-slate-300">
                正在加载赛历…
            </div>
        );
    }

    const hasAnyEvents = days.some(d => d.events.length > 0);

    return (
        <div className="space-y-4">
            {/* Month navigation header */}
            <div className="flex items-center justify-between px-2">
                <button
                    type="button"
                    onClick={prevMonth}
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2 text-white font-bold text-lg">
                    <CalendarIcon className="w-5 h-5 text-red-400" />
                    {monthLabel}
                </div>
                <button
                    type="button"
                    onClick={nextMonth}
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>

            {/* Calendar grid */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                {/* Weekday header */}
                <div className="grid grid-cols-7 bg-slate-900/60">
                    {WEEKDAY_LABELS.map((label, i) => (
                        <div
                            key={i}
                            className={`px-2 py-2 text-center text-xs font-medium ${i >= 5 ? 'text-slate-500' : 'text-slate-400'}`}
                        >
                            {label}
                        </div>
                    ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7">
                    {days.map((cell, idx) => (
                        <div
                            key={idx}
                            className={`
                                min-h-[100px] p-2 border-t border-slate-700/50 relative
                                ${!cell.isCurrentMonth ? 'bg-slate-800/40' : 'bg-slate-800'}
                                ${cell.isToday ? 'ring-2 ring-red-500 ring-inset' : ''}
                            `}
                        >
                            {/* Day number */}
                            <div className={`text-xs font-mono mb-1 ${!cell.isCurrentMonth ? 'text-slate-600' : cell.isToday ? 'text-red-400 font-bold' : 'text-slate-400'}`}>
                                {cell.day}
                            </div>

                            {/* Events — 始终可点查看详情；有关联场次时样式突出 */}
                            <div className="space-y-1 relative z-[1]">
                                {cell.events.slice(0, 3).map((ev) => (
                                    <button
                                        key={ev.id}
                                        type="button"
                                        onClick={() => setSelected(ev)}
                                        className={`
                                            w-full text-left text-xs px-1.5 py-0.5 rounded truncate
                                            transition-colors cursor-pointer
                                            ${ev.linked_race_id != null && Number(ev.linked_race_id) > 0
                                                ? 'bg-red-700/70 text-white hover:bg-red-600'
                                                : 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                                            }
                                        `}
                                        title={ev.title}
                                    >
                                        {ev.title}
                                    </button>
                                ))}
                                {cell.events.length > 3 && (
                                    <div className="text-xs text-slate-500 pl-1">
                                        +{cell.events.length - 3} 项
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {!hasAnyEvents && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-slate-400 text-center">
                    <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    该月暂无赛历安排
                </div>
            )}

            {/* Detail modal */}
            {selected && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setSelected(null)}
                >
                    <div
                        className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 bg-slate-900/60">
                            <div className="flex items-center gap-2 text-white font-bold">
                                <Flag className="w-4 h-4 text-red-400" />
                                {selected.title}
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelected(null)}
                                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal body */}
                        <div className="px-5 py-4 space-y-0">
                            {selected.event_detail && (
                                <div className="mb-3">
                                    <p className="text-slate-300 text-sm leading-relaxed">{selected.event_detail}</p>
                                </div>
                            )}
                            <div className="space-y-0">
                                <FieldRow label="比赛时间" value={selected.event_session_time} />
                                <FieldRow label="正赛时长" value={selected.race_duration} />
                                <FieldRow label="赛道" value={trackDisplay(selected.track_name)} />
                                <FieldRow label="组别" value={selected.car_group} />
                                <FieldRow label="BOP" value={selected.bop} />
                                <FieldRow label="准入要求" value={selected.entry_requirements} />
                                <FieldRow label="进站规则" value={selected.pit_rules} />
                            </div>
                        </div>

                        {/* Modal footer */}
                        <div className="flex gap-3 px-5 py-4 border-t border-slate-700 bg-slate-900/40">
                            <button
                                type="button"
                                onClick={() => setSelected(null)}
                                className="flex-1 px-4 py-2 text-sm text-slate-300 border border-slate-600 rounded-lg hover:bg-slate-700 transition-colors"
                            >
                                关闭
                            </button>
                            {selected.linked_race_id != null && Number(selected.linked_race_id) > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onOpenRace(Number(selected.linked_race_id));
                                        setSelected(null);
                                    }}
                                    className="flex-1 px-4 py-2 text-sm bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors"
                                >
                                    查看成绩
                                </button>
                            ) : (
                                <div className="flex-1 px-4 py-2 text-sm text-slate-500 text-center border border-slate-700 rounded-lg">
                                    暂未关联成绩场次
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CalendarPage;