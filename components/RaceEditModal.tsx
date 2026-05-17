import React, { useMemo, useRef } from 'react';
import { X, AlertCircle, Trash2, Upload } from 'lucide-react';
import type { AccSchema2, ParsedDriverResult, EditableDriverResult } from '../utils/standingsImport';
import { parseJsonToResults } from '../utils/standingsImport';

interface PreviewMeta {
    raceName: string;
    trackName: string;
    serverName: string;
    raceYear: string;
    raceMonth: string;
    raceDay: string;
    sessionType: string;
}

type ResultItem = EditableDriverResult;

interface Props {
    open: boolean;
    mode: 'import' | 'edit';
    title: string;
    subtitle?: string;
    meta: PreviewMeta;
    results: ResultItem[];
    usePoints: boolean;
    loading?: boolean;
    error?: string | null;
    onMetaChange: (meta: PreviewMeta) => void;
    onResultsChange: (results: ResultItem[]) => void;
    onConfirm: () => void;
    onClose: () => void;
    onJsonReplaced?: (rawText: string) => void;
}

function formatMsToTime(ms: number): string {
    if (ms <= 0) return '-';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatMsToLap(ms: number): string {
    if (ms <= 0) return '-';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const msPart = ms % 1000;
    return minutes > 0
        ? `${minutes}:${String(seconds).padStart(2, '0')}.${String(msPart).padStart(3, '0')}`
        : `${seconds}.${String(msPart).padStart(3, '0')}`;
}

const RaceEditModal: React.FC<Props> = ({
    open, mode, title, subtitle, meta, results, usePoints,
    loading, error,
    onMetaChange, onResultsChange, onConfirm, onClose,
    onJsonReplaced,
}) => {
    const jsonInputRef = useRef<HTMLInputElement>(null);

    const { duplicateNames, duplicateSteamIds } = useMemo(() => {
        const nameCount = new Map<string, number>();
        const sidCount = new Map<string, number>();
        for (const r of results) {
            if (r.removed) continue;
            const name = r.driverName?.trim();
            if (name) nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
            const sid = r.steamId?.trim();
            if (sid) sidCount.set(sid, (sidCount.get(sid) ?? 0) + 1);
        }
        const dn = new Set<string>(), ds = new Set<string>();
        nameCount.forEach((v, k) => { if (v > 1) dn.add(k); });
        sidCount.forEach((v, k) => { if (v > 1) ds.add(k); });
        return { duplicateNames: dn, duplicateSteamIds: ds };
    }, [results]);

    const handleJsonFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onJsonReplaced) return;
        const text = await file.text();
        let data: AccSchema2;
        try {
            data = JSON.parse(text) as AccSchema2;
        } catch {
            return;
        }
        const parsed = parseJsonToResults(data);
        const datePart = parsed.raceDate.slice(0, 10);
        const [y, m, d] = datePart.split('-');
        onMetaChange({
            raceName: parsed.raceName,
            trackName: parsed.trackName,
            serverName: parsed.serverName,
            raceYear: y ?? '',
            raceMonth: String(Number(m) || ''),
            raceDay: String(Number(d) || ''),
            sessionType: parsed.sessionType,
        });
        onResultsChange(parsed.results.map((r: ParsedDriverResult) => ({ ...r, removed: false })));
        onJsonReplaced(text);
        if (jsonInputRef.current) jsonInputRef.current.value = '';
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={onClose} />
            <div className="relative bg-slate-800 border border-slate-600 rounded-xl p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h3 className="text-lg font-bold text-white">{title}</h3>
                        {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Meta fields */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1.5">比赛名称</label>
                        <input
                            type="text"
                            value={meta.raceName}
                            onChange={e => onMetaChange({ ...meta, raceName: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1.5">赛道</label>
                        <input
                            type="text"
                            value={meta.trackName}
                            onChange={e => onMetaChange({ ...meta, trackName: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1.5">服务器</label>
                        <input
                            type="text"
                            value={meta.serverName}
                            onChange={e => onMetaChange({ ...meta, serverName: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-xs text-slate-400 mb-1.5">比赛日期</label>
                        <div className="flex items-center gap-2">
                            <select
                                value={meta.raceYear}
                                onChange={e => onMetaChange({ ...meta, raceYear: e.target.value })}
                                className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500 cursor-pointer"
                            >
                                <option value="">年</option>
                                {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <span className="text-slate-500">-</span>
                            <select
                                value={meta.raceMonth}
                                onChange={e => onMetaChange({ ...meta, raceMonth: e.target.value })}
                                className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500 cursor-pointer"
                            >
                                <option value="">月</option>
                                {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
                            </select>
                            <span className="text-slate-500">-</span>
                            <select
                                value={meta.raceDay}
                                onChange={e => onMetaChange({ ...meta, raceDay: e.target.value })}
                                className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500 cursor-pointer"
                            >
                                <option value="">日</option>
                                {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1.5">Session 类型</label>
                        <select
                            value={meta.sessionType}
                            onChange={e => onMetaChange({ ...meta, sessionType: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500 cursor-pointer"
                        >
                            <option value="R">R - 正赛</option>
                            <option value="Q">Q - 排位</option>
                            <option value="P">P - 练习</option>
                        </select>
                    </div>
                    {mode === 'edit' && onJsonReplaced && (
                        <div className="col-span-2">
                            <label className="block text-xs text-slate-400 mb-1.5">替换 JSON 文件</label>
                            <div className="flex items-center gap-3">
                                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 text-sm cursor-pointer hover:bg-slate-600 transition-colors">
                                    <Upload className="w-4 h-4" />
                                    选择 JSON
                                    <input
                                        ref={jsonInputRef}
                                        type="file"
                                        accept=".json"
                                        onChange={handleJsonFileChange}
                                        className="hidden"
                                    />
                                </label>
                                <span className="text-xs text-slate-500">重新解析将替换所有成绩数据与快照</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Results table */}
                <div className="mb-4 flex items-center gap-3 text-sm">
                    <span className="text-emerald-400 font-medium">
                        {mode === 'import' ? '将导入' : '有效'} {results.filter(r => !r.removed).length} 条
                    </span>
                    <span className="text-red-400 font-medium">
                        已移除 {results.filter(r => r.removed).length} 条
                    </span>
                    <span className="text-slate-500">
                        共 {results.length} 条
                    </span>
                </div>

                {(duplicateNames.size > 0 || duplicateSteamIds.size > 0) && (
                    <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-lg
                        bg-amber-950/40 border border-amber-800 text-amber-200 text-sm">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
                        <div>
                            检测到
                            {duplicateNames.size > 0 && <> <b>{duplicateNames.size}</b> 个重复车手名称</>}
                            {duplicateNames.size > 0 && duplicateSteamIds.size > 0 && '、'}
                            {duplicateSteamIds.size > 0 && <> <b>{duplicateSteamIds.size}</b> 个重复 SteamID</>}
                            ，请确认是否需要移除重复条目。
                        </div>
                    </div>
                )}

                <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden mb-6">
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                        <table className="w-full min-w-[900px] text-sm">
                            <thead className="stick top-0 bg-slate-800 text-slate-400 text-xs uppercase">
                                <tr>
                                    <th className="p-2.5 text-left w-12">#</th>
                                    <th className="p-2.5 text-left">车手</th>
                                    <th className="p-2.5 text-left">SteamID</th>
                                    <th className="p-2.5 text-right">圈数</th>
                                    <th className="p-2.5 text-right">总时间</th>
                                    <th className="p-2.5 text-right">最快圈</th>
                                    {usePoints && <th className="p-2.5 text-right">积分</th>}
                                    <th className="p-2.5 text-center">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/60">
                                {results.map((r, idx) => {
                                    const nameDup = !r.removed && duplicateNames.has(r.driverName?.trim() ?? '');
                                    const sidDup = !r.removed && !!r.steamId?.trim() && duplicateSteamIds.has(r.steamId.trim());
                                    return (
                                    <tr
                                        key={idx}
                                        className={`transition-opacity ${r.removed ? 'opacity-40' : 'hover:bg-slate-700/40'} ${(nameDup || sidDup) && !r.removed ? 'bg-amber-950/30' : ''}`}
                                    >
                                        <td className="p-2.5 text-slate-400 font-mono text-xs">{idx + 1}</td>
                                        <td className={`p-2.5 ${nameDup ? 'text-amber-300' : 'text-slate-100'}`}>
                                            {r.driverName}
                                            {nameDup && <AlertCircle className="w-3.5 h-3.5 inline ml-1.5 text-amber-400 align-middle" title="列表中存在重复名称" />}
                                        </td>
                                        <td className={`p-2.5 font-mono text-xs ${sidDup ? 'text-amber-300' : 'text-slate-400'}`}>
                                            {r.steamId || '-'}
                                            {sidDup && <AlertCircle className="w-3.5 h-3.5 inline ml-1.5 text-amber-400 align-middle" title="列表中存在重复 SteamID" />}
                                        </td>
                                        <td className="p-2.5 text-right text-slate-300">{r.laps}</td>
                                        <td className="p-2.5 text-right text-slate-300">{formatMsToTime(r.totalTime)}</td>
                                        <td className="p-2.5 text-right text-slate-300">{formatMsToLap(r.bestLap)}</td>
                                        {usePoints ? (
                                            <td className="p-2.5 text-right">
                                                <input
                                                    type="number"
                                                    value={r.points}
                                                    onChange={(e) => {
                                                        const updated = [...results];
                                                        updated[idx] = { ...updated[idx], points: Number(e.target.value) };
                                                        onResultsChange(updated);
                                                    }}
                                                    className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-amber-400 font-semibold text-right focus:outline-none focus:border-red-500"
                                                />
                                            </td>
                                        ) : (
                                            <td className="p-2.5 text-right text-amber-400 font-semibold">{r.points}</td>
                                        )}
                                        <td className="p-2.5 text-center">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const updated = [...results];
                                                    updated[idx] = { ...updated[idx], removed: !updated[idx].removed };
                                                    onResultsChange(updated);
                                                }}
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                                    r.removed
                                                        ? 'border-emerald-700 text-emerald-400 hover:bg-emerald-950/40'
                                                        : 'border-red-700 text-red-400 hover:bg-red-950/40'
                                                }`}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                {r.removed ? '恢复' : '移除'}
                                            </button>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {error && (
                    <div className="flex items-center gap-2 text-sm text-red-400 mb-4">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                    </div>
                )}

                {/* Footer */}
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 px-4 py-2.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 text-sm font-medium hover:bg-slate-600 transition-colors disabled:opacity-50"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={loading || results.filter(r => !r.removed).length === 0}
                        className="flex-1 px-4 py-2.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                        {loading ? '保存中...' : mode === 'import' ? '确认导入' : '保存更改'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RaceEditModal;