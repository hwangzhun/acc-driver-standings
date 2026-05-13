import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { DriverStanding, SortField } from '../db/standingsTypes';
import { VALID_DRIVER_TIERS, type DriverTier } from '../db/standingsTypes';
import DriverTierBadge from './DriverTierBadge';
import { getDrivers, adminImportRace, postDriverLicenseChange, patchDriverTier } from '../services/standingsApi';
import {
    parseJsonToResults, type AccSchema2, type ParsedDriverResult,
} from '../utils/standingsImport';
import { putRaceSessionSnapshot } from '../services/raceSessionSnapshot';
import {
    Upload, Search, ChevronUp, ChevronDown, AlertCircle, CheckCircle2,
    Plus, Minus, Trash2, X,
} from 'lucide-react';

const SORT_OPTIONS: { value: SortField; label: string }[] = [
    { value: 'points', label: '积分' },
    { value: 'license_points', label: '驾照分' },
    { value: 'total_races', label: '场次' },
];

interface ImportFeedback {
    type: 'success' | 'error';
    raceName: string;
    newDrivers: number;
    updatedDrivers: number;
    resultCount: number;
    message?: string;
}

interface PreviewMeta {
    raceName: string;
    trackName: string;
    serverName: string;
    raceDate: string;
    sessionType: string;
}

type PreviewResultItem = ParsedDriverResult & { removed: boolean };

interface Props {
    onOpenDriver: (id: number) => void;
}

const AdminStandingsPage: React.FC<Props> = ({ onOpenDriver }) => {
    // ── Driver list state ──
    const [sortField, setSortField] = useState<SortField>('points');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [search, setSearch] = useState('');

    // ── License modal state ──
    const [licenseDriver, setLicenseDriver] = useState<DriverStanding | null>(null);
    const [licenseChange, setLicenseChange] = useState(0);
    const [licenseReason, setLicenseReason] = useState('');
    const [tierChange, setTierChange] = useState<DriverTier>('Rookie');
    const [licenseSubmitting, setLicenseSubmitting] = useState(false);
    const [licenseError, setLicenseError] = useState('');

    // ── Import state ──
    const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(null);
    const [importLoading, setImportLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Preview state ──
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewFileName, setPreviewFileName] = useState('');
    const [previewRawText, setPreviewRawText] = useState('');
    const [previewMeta, setPreviewMeta] = useState<PreviewMeta>({
        raceName: '', trackName: '', serverName: '', raceDate: '', sessionType: 'R',
    });
    const [previewResults, setPreviewResults] = useState<PreviewResultItem[]>([]);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const [drivers, setDrivers] = useState<DriverStanding[]>([]);
    const [driversLoading, setDriversLoading] = useState(true);
    const [driversError, setDriversError] = useState<string | null>(null);

    const loadDrivers = useCallback(async () => {
        setDriversLoading(true);
        setDriversError(null);
        try {
            const rows = await getDrivers(sortField, sortOrder, search);
            setDrivers(rows);
        } catch (e) {
            setDrivers([]);
            setDriversError(e instanceof Error ? e.message : String(e));
        } finally {
            setDriversLoading(false);
        }
    }, [sortField, sortOrder, search]);

    useEffect(() => {
        void loadDrivers();
    }, [loadDrivers]);

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return null;
        return sortOrder === 'desc'
            ? <ChevronDown className="w-4 h-4 ml-1 inline" />
            : <ChevronUp className="w-4 h-4 ml-1 inline" />;
    };

    function formatMsToTime(ms: number): string {
        if (ms <= 0) return '-';
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    function formatMsToLap(ms: number): string {
        if (ms <= 0) return '-';
        const totalSeconds = ms / 1000;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = (totalSeconds % 60).toFixed(3);
        if (minutes > 0) {
            return `${minutes}:${String(seconds).padStart(6, '0')}`;
        }
        return `${seconds}s`;
    }

    // ── Import handler ──
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImportLoading(true);
        setImportFeedback(null);

        try {
            const text = await file.text();
            let data: AccSchema2;
            try {
                data = JSON.parse(text) as AccSchema2;
            } catch {
                setImportFeedback({
                    type: 'error', raceName: file.name, newDrivers: 0, updatedDrivers: 0, resultCount: 0,
                    message: 'JSON 解析失败，请检查文件格式',
                });
                setImportLoading(false);
                return;
            }

            const parsed = parseJsonToResults(data);
            parsed.sourceFileName = file.name;

            setPreviewFileName(file.name);
            setPreviewRawText(text);
            setPreviewMeta({
                raceName: parsed.raceName,
                trackName: parsed.trackName,
                serverName: parsed.serverName,
                raceDate: parsed.raceDate,
                sessionType: parsed.sessionType,
            });
            setPreviewResults(parsed.results.map(r => ({ ...r, removed: false })));
            setPreviewOpen(true);
            setPreviewError(null);
        } catch (err) {
            setImportFeedback({
                type: 'error',
                raceName: file.name,
                newDrivers: 0,
                updatedDrivers: 0,
                resultCount: 0,
                message: err instanceof Error ? err.message : String(err),
            });
        } finally {
            setImportLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleConfirmImport = async () => {
        if (previewResults.filter(r => !r.removed).length === 0) {
            setPreviewError('车手列表为空，请至少保留一条记录');
            return;
        }

        setImportLoading(true);
        setPreviewError(null);

        try {
            const body = {
                sourceFileName: previewFileName,
                raceName: previewMeta.raceName,
                trackName: previewMeta.trackName,
                serverName: previewMeta.serverName,
                raceDate: previewMeta.raceDate,
                sessionType: previewMeta.sessionType,
                results: previewResults
                    .filter(r => !r.removed)
                    .map(({ removed: _removed, ...rest }) => rest),
            };

            const { raceId, newDrivers, updatedDrivers, resultCount } = await adminImportRace(body);

            try {
                await putRaceSessionSnapshot(raceId, previewRawText);
            } catch (e) {
                console.warn('race session snapshot (IDB) failed:', e);
            }

            void loadDrivers();

            setImportFeedback({
                type: 'success',
                raceName: previewMeta.raceName,
                newDrivers,
                updatedDrivers,
                resultCount,
            });
            setPreviewOpen(false);
        } catch (err) {
            setPreviewError(err instanceof Error ? err.message : String(err));
        } finally {
            setImportLoading(false);
        }
    };

    const handleCancelPreview = () => {
        setPreviewOpen(false);
        setPreviewFileName('');
        setPreviewRawText('');
        setPreviewMeta({ raceName: '', trackName: '', serverName: '', raceDate: '', sessionType: 'R' });
        setPreviewResults([]);
        setPreviewError(null);
    };

    // ── License point modal ──
    const openLicenseModal = (driver: DriverStanding) => {
        setLicenseDriver(driver);
        setLicenseChange(0);
        setLicenseReason('');
        setTierChange(driver.tier);
        setLicenseError('');
    };

    const submitLicenseChange = async () => {
        if (!licenseDriver) return;
        const onlyTierChanged = tierChange !== licenseDriver.tier;
        const onlyLicenseChanged = licenseChange !== 0;

        if (onlyLicenseChanged && !licenseReason.trim()) {
            setLicenseError('备注不能为空');
            return;
        }
        if (!onlyTierChanged && !onlyLicenseChanged) {
            setLicenseError('没有需要提交的更改');
            return;
        }

        setLicenseSubmitting(true);
        setLicenseError('');

        try {
            if (onlyTierChanged) {
                await patchDriverTier(licenseDriver.id, tierChange);
            }

            if (onlyLicenseChanged) {
                const current = licenseDriver.license_points;
                if (licenseChange < 0 && current + licenseChange < 0) {
                    setLicenseError('驾照分不能低于 0');
                    setLicenseSubmitting(false);
                    return;
                }
                await postDriverLicenseChange(licenseDriver.id, {
                    changeValue: licenseChange,
                    reason: licenseReason.trim(),
                    operator: 'admin',
                });
            }
            setLicenseDriver(null);
            void loadDrivers();
        } catch (err) {
            setLicenseError(err instanceof Error ? err.message : String(err));
        } finally {
            setLicenseSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* JSON Upload */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Upload className="w-5 h-5 text-green-400" />
                    上传比赛结果 JSON
                </h3>
                <div className="flex flex-col sm:flex-row gap-3">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleFileUpload}
                        disabled={importLoading}
                        className="hidden"
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={importLoading}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        <Upload className="w-4 h-4" />
                        {importLoading ? '导入中...' : '选择 JSON 文件'}
                    </button>
                    {importFeedback && (
                        <div className={`flex items-start gap-2 px-4 py-3 rounded-lg border text-sm ${
                            importFeedback.type === 'success'
                                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                                : 'bg-red-950/40 border-red-800 text-red-200'
                        }`}>
                            {importFeedback.type === 'success' ? (
                                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                            ) : (
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                            )}
                            <div>
                                {importFeedback.type === 'success' ? (
                                    <>
                                        <p className="font-semibold">{importFeedback.raceName}</p>
                                        <p className="mt-1">
                                            新增车手 {importFeedback.newDrivers} · 更新车手 {importFeedback.updatedDrivers} · 写入结果 {importFeedback.resultCount} 条
                                        </p>
                                    </>
                                ) : (
                                    <p>{importFeedback.message}</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {driversError && (
                <div className="bg-red-950/40 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-200">
                    {driversError}
                </div>
            )}
            {/* Driver list */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="搜索车手名称或 SteamID..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500"
                        />
                    </div>
                    <div className="flex gap-2">
                        {SORT_OPTIONS.map((opt) => (
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
                                    <th className="p-3 text-left">SteamID</th>
                                    <th className="p-3 text-left">等级</th>
                                    <th className="p-3 text-right">积分</th>
                                    <th className="p-3 text-right">驾照分</th>
                                    <th className="p-3 text-right">场次</th>
                                    <th className="p-3 text-right">领奖台</th>
                                    <th className="p-3 text-center">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/60">
                                {driversLoading ? (
                                    <tr>
                                        <td colSpan={9} className="p-8 text-center text-slate-400">
                                            加载中…
                                        </td>
                                    </tr>
                                ) : drivers.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="p-8 text-center text-slate-400">
                                            暂无数据
                                        </td>
                                    </tr>
                                ) : (
                                    drivers.map((d, idx) => (
                                        <tr key={d.id} className="hover:bg-slate-700/40">
                                            <td className="p-3 text-slate-400 font-mono text-xs">{idx + 1}</td>
                                            <td
                                                className="p-3 text-slate-100 font-medium cursor-pointer hover:text-red-400"
                                                onClick={() => onOpenDriver(d.id)}
                                            >
                                                {d.name}
                                            </td>
                                            <td className="p-3 text-slate-400 font-mono text-xs">{d.steam_id}</td>
                                            <td className="p-3">
                                                <DriverTierBadge tier={d.tier} />
                                            </td>
                                            <td className="p-3 text-right text-amber-400 font-semibold">{d.points}</td>
                                            <td className="p-3 text-right">
                                                <span className={`font-semibold ${d.license_points <= 6 ? 'text-orange-400' : 'text-emerald-400'}`}>
                                                    {d.license_points}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right text-slate-300">{d.total_races}</td>
                                            <td className="p-3 text-right text-slate-300">{d.podium_count}</td>
                                            <td className="p-3 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => openLicenseModal(d)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 border border-slate-600 text-slate-200 hover:bg-slate-600 hover:border-slate-500 transition-colors"
                                                >
                                                    修改评级/驾驶分
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* License point modal */}
            {licenseDriver && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60" onClick={() => setLicenseDriver(null)} />
                    <div className="relative bg-slate-800 border border-slate-600 rounded-xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-1">修改评级/驾驶分</h3>
                        <p className="text-sm text-slate-400 mb-5">
                            {licenseDriver.name} · 当前{' '}
                            <span className="font-bold text-white">{licenseDriver.license_points}</span> 分 · 等级{' '}
                            <span className="font-bold text-white">{licenseDriver.tier}</span>
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-slate-400 mb-2">等级</label>
                                <select
                                    value={tierChange}
                                    onChange={(e) => setTierChange(e.target.value as DriverTier)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-red-500 cursor-pointer"
                                >
                                    {VALID_DRIVER_TIERS.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs text-slate-400 mb-2">变动分值</label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setLicenseChange((c) => c - 1)}
                                        className="p-2 rounded-lg bg-slate-700 border border-slate-600 text-orange-400 hover:bg-slate-600"
                                    >
                                        <Minus className="w-5 h-5" />
                                    </button>
                                    <input
                                        type="number"
                                        value={licenseChange}
                                        onChange={(e) => setLicenseChange(Number(e.target.value))}
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-center text-xl font-bold text-white focus:outline-none focus:border-red-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setLicenseChange((c) => c + 1)}
                                        className="p-2 rounded-lg bg-slate-700 border border-slate-600 text-emerald-400 hover:bg-slate-600"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    调整后：{Math.max(0, Math.min(12, licenseDriver.license_points + licenseChange))} 分
                                    {licenseChange > 0 ? ` (+${licenseChange})` : licenseChange < 0 ? ` (${licenseChange})` : ''}
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs text-slate-400 mb-2">备注（必填）</label>
                                <textarea
                                    value={licenseReason}
                                    onChange={(e) => setLicenseReason(e.target.value)}
                                    placeholder="填写加分/扣分原因..."
                                    rows={3}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500 resize-none"
                                />
                            </div>

                            {licenseError && (
                                <div className="flex items-center gap-2 text-sm text-red-400">
                                    <AlertCircle className="w-4 h-4" />
                                    {licenseError}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                type="button"
                                onClick={() => setLicenseDriver(null)}
                                className="flex-1 px-4 py-2.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 text-sm font-medium hover:bg-slate-600 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={submitLicenseChange}
                                disabled={licenseSubmitting}
                                className="flex-1 px-4 py-2.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                            >
                                {licenseSubmitting ? '提交中...' : '确认提交'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import preview modal */}
            {previewOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70" onClick={handleCancelPreview} />
                    <div className="relative bg-slate-800 border border-slate-600 rounded-xl p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h3 className="text-lg font-bold text-white">预览导入</h3>
                                <p className="text-sm text-slate-400 mt-0.5">{previewFileName}</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleCancelPreview}
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
                                    value={previewMeta.raceName}
                                    onChange={e => setPreviewMeta(m => ({ ...m, raceName: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1.5">赛道</label>
                                <input
                                    type="text"
                                    value={previewMeta.trackName}
                                    onChange={e => setPreviewMeta(m => ({ ...m, trackName: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1.5">服务器</label>
                                <input
                                    type="text"
                                    value={previewMeta.serverName}
                                    onChange={e => setPreviewMeta(m => ({ ...m, serverName: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1.5">比赛日期</label>
                                <input
                                    type="text"
                                    value={previewMeta.raceDate}
                                    onChange={e => setPreviewMeta(m => ({ ...m, raceDate: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1.5">Session 类型</label>
                                <select
                                    value={previewMeta.sessionType}
                                    onChange={e => setPreviewMeta(m => ({ ...m, sessionType: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500 cursor-pointer"
                                >
                                    <option value="R">R - 正赛</option>
                                    <option value="Q">Q - 排位</option>
                                    <option value="P">P - 练习</option>
                                </select>
                            </div>
                        </div>

                        {/* Results table */}
                        <div className="mb-4 flex items-center gap-3 text-sm">
                            <span className="text-emerald-400 font-medium">
                                将导入 {previewResults.filter(r => !r.removed).length} 条
                            </span>
                            <span className="text-red-400 font-medium">
                                已移除 {previewResults.filter(r => r.removed).length} 条
                            </span>
                            <span className="text-slate-500">
                                共 {previewResults.length} 条
                            </span>
                        </div>

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
                                            <th className="p-2.5 text-right">积分</th>
                                            <th className="p-2.5 text-center">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/60">
                                        {previewResults.map((r, idx) => (
                                            <tr
                                                key={idx}
                                                className={`transition-opacity ${r.removed ? 'opacity-40' : 'hover:bg-slate-700/40'}`}
                                            >
                                                <td className="p-2.5 text-slate-400 font-mono text-xs">{idx + 1}</td>
                                                <td className="p-2.5 text-slate-100">{r.driverName}</td>
                                                <td className="p-2.5 text-slate-400 font-mono text-xs">{r.steamId || '-'}</td>
                                                <td className="p-2.5 text-right text-slate-300">{r.laps}</td>
                                                <td className="p-2.5 text-right text-slate-300">{formatMsToTime(r.totalTime)}</td>
                                                <td className="p-2.5 text-right text-slate-300">{formatMsToLap(r.bestLap)}</td>
                                                <td className="p-2.5 text-right text-amber-400 font-semibold">{r.points}</td>
                                                <td className="p-2.5 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const updated = [...previewResults];
                                                            updated[idx] = { ...updated[idx], removed: !updated[idx].removed };
                                                            setPreviewResults(updated);
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
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {previewError && (
                            <div className="flex items-center gap-2 text-sm text-red-400 mb-4">
                                <AlertCircle className="w-4 h-4" />
                                {previewError}
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={handleCancelPreview}
                                className="flex-1 px-4 py-2.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 text-sm font-medium hover:bg-slate-600 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmImport}
                                disabled={importLoading || previewResults.filter(r => !r.removed).length === 0}
                                className="flex-1 px-4 py-2.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                            >
                                {importLoading ? '导入中...' : '确认导入'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminStandingsPage;
