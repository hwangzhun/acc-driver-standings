import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { DriverStanding, SortField } from '../db/standingsTypes';
import { VALID_DRIVER_TIERS, type DriverTier } from '../db/standingsTypes';
import DriverTierBadge from './DriverTierBadge';
import RaceEditModal from './RaceEditModal';
import { getDrivers, adminImportRace, postDriverLicenseChange, patchDriverTier, getAppSettings, updateAppSettings, updatePositionPointsMap, adminRecalculateRank } from '../services/standingsApi';
import {
    parseJsonToResults, type AccSchema2, type ParsedDriverResult,
    recomputeParsedResultsRanks,
} from '../utils/standingsImport';
import {
    Upload, Search, ChevronUp, ChevronDown, AlertCircle, CheckCircle2,
    Plus, Minus, Trash2, X, Settings, RefreshCw,
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
    raceYear: string;
    raceMonth: string;
    raceDay: string;
    sessionType: string;
}

type PreviewResultItem = ParsedDriverResult & { removed: boolean };

interface Props {
    onOpenDriver: (id: number) => void;
    usePoints: boolean;
    onUsePointsChange: (v: boolean) => void;
    autoRookieBronze: boolean;
    onAutoRookieBronzeChange: (v: boolean) => void;
    positionPointsMap: Record<number, number>;
    onPositionPointsMapChange: (map: Record<number, number>) => void;
}

const AdminStandingsPage: React.FC<Props> = ({ onOpenDriver, usePoints: externalUsePoints, onUsePointsChange, autoRookieBronze: externalAutoRookieBronze, onAutoRookieBronzeChange, positionPointsMap, onPositionPointsMapChange }) => {
    // ── Driver list state ──
    const [sortField, setSortField] = useState<SortField>('points');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [search, setSearch] = useState('');

    // ── Tab navigation state ──
    type AdminTab = 'drivers' | 'system' | 'points';
    const [activeTab, setActiveTab] = useState<AdminTab>('drivers');

    // ── Settings state ──
    const [usePoints, setUsePoints] = useState(externalUsePoints);
    const [autoRookieBronze, setAutoRookieBronze] = useState(externalAutoRookieBronze);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [promoteSuccess, setPromoteSuccess] = useState('');
    const [rankRecalcLoading, setRankRecalcLoading] = useState(false);
    const [rankRecalcMessage, setRankRecalcMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        setUsePoints(externalUsePoints);
    }, [externalUsePoints]);

    useEffect(() => {
        setAutoRookieBronze(externalAutoRookieBronze);
    }, [externalAutoRookieBronze]);

    const handleUsePointsToggle = async () => {
        const next = !usePoints;
        setUsePoints(next);
        setSettingsSaving(true);
        try {
            await updateAppSettings({ usePoints: next });
            onUsePointsChange(next);
        } catch {
            setUsePoints(!next);
        } finally {
            setSettingsSaving(false);
        }
    };

    const handleRecalculateRank = async () => {
        setRankRecalcLoading(true);
        setRankRecalcMessage(null);
        try {
            const { raceResultsUpdated } = await adminRecalculateRank();
            setRankRecalcMessage({
                type: 'success',
                text: `已重算 ${raceResultsUpdated} 条单场 Rank，并更新所有车手总 Rank 与段位`,
            });
            void loadDrivers();
        } catch (err) {
            setRankRecalcMessage({
                type: 'error',
                text: err instanceof Error ? err.message : String(err),
            });
        } finally {
            setRankRecalcLoading(false);
        }
    };

    const handleAutoRookieBronzeToggle = async () => {
        const next = !autoRookieBronze;
        setAutoRookieBronze(next);
        setSettingsSaving(true);
        setPromoteSuccess('');
        try {
            const result = await updateAppSettings({ autoRookieBronze: next });
            onAutoRookieBronzeChange(next);
            if (result.promotedCount) {
                setPromoteSuccess(`已升级 ${result.promotedCount} 名车手为 Bronze`);
            }
        } catch {
            setAutoRookieBronze(!next);
        } finally {
            setSettingsSaving(false);
        }
    };

    // ── Position points editor state ──
    type PointsRow = { position: number; points: number };
    const DEFAULT_MAP: Record<number, number> = {
        1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
        6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
    };

    const [pointsRows, setPointsRows] = useState<PointsRow[]>(() => {
        const entries = Object.entries(positionPointsMap).map(([p, pts]) => ({
            position: Number(p),
            points: Number(pts),
        }));
        entries.sort((a, b) => a.position - b.position);
        return entries;
    });
    const [pointsSaving, setPointsSaving] = useState(false);
    const [pointsError, setPointsError] = useState('');
    const [pointsSuccess, setPointsSuccess] = useState('');

    useEffect(() => {
        const entries = Object.entries(positionPointsMap).map(([p, pts]) => ({
            position: Number(p),
            points: Number(pts),
        }));
        entries.sort((a, b) => a.position - b.position);
        setPointsRows(entries);
    }, [positionPointsMap]);

    const addPointsRow = () => {
        const used = new Set(pointsRows.map(r => r.position));
        let next = 1;
        while (used.has(next)) next++;
        setPointsRows(prev => [...prev, { position: next, points: 0 }].sort((a, b) => a.position - b.position));
    };

    const removePointsRow = (pos: number) => {
        setPointsRows(prev => prev.filter(r => r.position !== pos));
    };

    const updatePointsRow = (pos: number, field: 'position' | 'points', value: number) => {
        setPointsRows(prev => prev.map(r => r.position === pos ? { ...r, [field]: value } : r));
    };

    const resetPointsRows = () => {
        const entries = Object.entries(DEFAULT_MAP).map(([p, pts]) => ({
            position: Number(p),
            points: Number(pts),
        }));
        setPointsRows(entries);
    };

    const validatePointsRows = (): string => {
        const posSeen = new Set<number>();
        for (const r of pointsRows) {
            if (!Number.isInteger(r.position) || r.position < 1) {
                return `名次 ${r.position} 无效，必须是 >= 1 的整数`;
            }
            if (posSeen.has(r.position)) return `名次 ${r.position} 出现重复`;
            posSeen.add(r.position);
            if (!Number.isFinite(r.points)) return `名次 ${r.position} 的积分无效`;
        }
        return '';
    };

    const handleSavePointsMap = async () => {
        const err = validatePointsRows();
        if (err) { setPointsError(err); return; }
        if (!window.confirm('将立即按新规则回算所有历史比赛积分，确认继续？')) return;
        setPointsError('');
        setPointsSuccess('');
        setPointsSaving(true);
        try {
            const map: Record<number, number> = {};
            for (const r of pointsRows) map[r.position] = r.points;
            const result = await updatePositionPointsMap(map);
            onPositionPointsMapChange(result.positionPointsMap);
            setPointsSuccess(`已回算 ${result.recalculatedRaceResults} 条成绩`);
        } catch (e) {
            setPointsError(e instanceof Error ? e.message : String(e));
        } finally {
            setPointsSaving(false);
        }
    };

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
    const [previewMeta, setPreviewMeta] = useState<PreviewMeta>({
        raceName: '', trackName: '', serverName: '', raceYear: '', raceMonth: '', raceDay: '', sessionType: 'R',
    });
    const [previewResults, setPreviewResults] = useState<PreviewResultItem[]>([]);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const { duplicateNames, duplicateSteamIds } = useMemo(() => {
        const nameCount = new Map<string, number>();
        const sidCount = new Map<string, number>();
        for (const r of previewResults) {
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
    }, [previewResults]);

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
            if (field === 'points' && !usePoints) return;
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const activeSortOptions = SORT_OPTIONS.filter(opt => opt.value !== 'points' || usePoints);

    if (!usePoints && sortField === 'points') {
        setSortField('license_points');
    }

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

            const parsed = parseJsonToResults(data, positionPointsMap);
            parsed.sourceFileName = file.name;

            setPreviewFileName(file.name);
            const datePart = parsed.raceDate.slice(0, 10);
            const [y, m, d] = datePart.split('-');
            setPreviewMeta({
                raceName: parsed.raceName,
                trackName: parsed.trackName,
                serverName: parsed.serverName,
                raceYear: y ?? '',
                raceMonth: String(Number(m) || ''),
                raceDay: String(Number(d) || ''),
                sessionType: parsed.sessionType,
            });
            setPreviewResults(recomputeParsedResultsRanks(
                parsed.results.map(r => ({ ...r, removed: (r.laps ?? 0) === 0 })),
                parsed.sessionType
            ));
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
            const raceDate = previewMeta.raceYear && previewMeta.raceMonth && previewMeta.raceDay
                ? `${previewMeta.raceYear}-${previewMeta.raceMonth.padStart(2, '0')}-${previewMeta.raceDay.padStart(2, '0')}`
                : '';
            if (!raceDate) {
                setPreviewError('请完整填写比赛日期');
                setImportLoading(false);
                return;
            }

            const body = {
                sourceFileName: previewFileName,
                raceName: previewMeta.raceName,
                trackName: previewMeta.trackName,
                serverName: previewMeta.serverName,
                raceDate,
                sessionType: previewMeta.sessionType,
                results: previewResults
                    .filter(r => !r.removed)
                    .map(({ removed: _removed, ...rest }) => rest),
            };

            const { raceId, newDrivers, updatedDrivers, resultCount } = await adminImportRace(body);

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
        setPreviewMeta({ raceName: '', trackName: '', serverName: '', raceYear: '', raceMonth: '', raceDay: '', sessionType: 'R' });
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
            {/* Tab navigation */}
            <div className="flex flex-wrap gap-2">
                {([
                    { key: 'drivers', label: '车手管理' },
                    { key: 'system', label: '系统设置' },
                    { key: 'points', label: '名次积分设置' },
                ] as { key: AdminTab; label: string }[]).map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                            activeTab === tab.key
                                ? 'bg-slate-700 border-slate-500 text-white'
                                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* System Settings */}
            {activeTab === 'system' && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Settings className="w-5 h-5 text-slate-400" />
                        <div>
                            <h3 className="text-base font-semibold text-white">系统设置</h3>
                            <p className="text-sm text-slate-400 mt-0.5">启用积分后，管理员可在导入时手动设置积分值</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleUsePointsToggle}
                        disabled={settingsSaving}
                        className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${
                            usePoints ? 'bg-green-600' : 'bg-slate-600'
                        }`}
                    >
                        <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                usePoints ? 'translate-x-8' : 'translate-x-1'
                            }`}
                        />
                    </button>
                </div>
                <div className="flex items-center justify-between mt-5">
                    <div className="flex items-center gap-3">
                        <Settings className="w-5 h-5 text-slate-400" />
                        <div>
                            <h3 className="text-base font-semibold text-white">Rookie 自动升 Bronze</h3>
                            <p className="text-sm text-slate-400 mt-0.5">开启后，参赛满 10 场且当前为 Rookie 的车手将自动升级为 Bronze；开启时会对现有符合条件的车手立即生效</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleAutoRookieBronzeToggle}
                        disabled={settingsSaving}
                        className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${
                            autoRookieBronze ? 'bg-green-600' : 'bg-slate-600'
                        }`}
                    >
                        <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                autoRookieBronze ? 'translate-x-8' : 'translate-x-1'
                            }`}
                        />
                    </button>
                </div>
                {promoteSuccess && (
                    <div className="mt-3 text-sm text-green-400 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        {promoteSuccess}
                    </div>
                )}
                <div className="mt-5 pt-5 border-t border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <RefreshCw className="w-5 h-5 text-slate-400" />
                        <div>
                            <h3 className="text-base font-semibold text-white">重算 Rank 分</h3>
                            <p className="text-sm text-slate-400 mt-0.5">
                                按当前数据库中的名次、圈数重算所有正赛单场 Rank，并更新车手总 Rank 与段位。无有效圈率的历史记录按中性系数 1.00 处理；建议重新导入 JSON 以获得准确有效圈率。
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleRecalculateRank}
                        disabled={rankRecalcLoading || settingsSaving}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium disabled:opacity-50 shrink-0"
                    >
                        <RefreshCw className={`w-4 h-4 ${rankRecalcLoading ? 'animate-spin' : ''}`} />
                        {rankRecalcLoading ? '计算中…' : '重算 Rank'}
                    </button>
                </div>
                {rankRecalcMessage && (
                    <div
                        className={`mt-3 text-sm flex items-center gap-2 ${
                            rankRecalcMessage.type === 'success' ? 'text-green-400' : 'text-red-400'
                        }`}
                    >
                        {rankRecalcMessage.type === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : (
                            <AlertCircle className="w-4 h-4 shrink-0" />
                        )}
                        {rankRecalcMessage.text}
                    </div>
                )}
            </div>
            )}

            {/* Position Points Config */}
            {activeTab === 'points' && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Settings className="w-5 h-5 text-slate-400" />
                        <div>
                            <h3 className="text-base font-semibold text-white">名次积分设置</h3>
                            <p className="text-sm text-slate-400 mt-0.5">配置每名次的积分值，保存后将回算所有历史成绩</p>
                        </div>
                    </div>
                </div>

                <div className="mb-4">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-slate-400 text-xs uppercase">
                                <th className="p-2 text-left w-24">名次</th>
                                <th className="p-2 text-left">积分</th>
                                <th className="p-2 w-16"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/60">
                            {pointsRows.map((row) => (
                                <tr key={row.position}>
                                    <td className="p-2">
                                        <input
                                            type="number"
                                            min={1}
                                            value={row.position}
                                            onChange={(e) => updatePointsRow(row.position, 'position', Number(e.target.value))}
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input
                                            type="number"
                                            value={row.points}
                                            onChange={(e) => updatePointsRow(row.position, 'points', Number(e.target.value))}
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
                                        />
                                    </td>
                                    <td className="p-2 text-center">
                                        <button
                                            type="button"
                                            onClick={() => removePointsRow(row.position)}
                                            className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={addPointsRow}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 text-sm font-medium hover:bg-slate-600 hover:border-slate-500 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        新增名次
                    </button>
                    <button
                        type="button"
                        onClick={resetPointsRows}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 text-sm font-medium hover:bg-slate-600 hover:border-slate-500 transition-colors"
                    >
                        重置为默认
                    </button>
                    <button
                        type="button"
                        onClick={handleSavePointsMap}
                        disabled={pointsSaving}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                        {pointsSaving ? '保存中...' : '保存并回算'}
                    </button>
                </div>

                {pointsError && (
                    <div className="flex items-center gap-2 text-sm text-red-400 mt-3">
                        <AlertCircle className="w-4 h-4" />
                        {pointsError}
                    </div>
                )}
                {pointsSuccess && (
                    <div className="flex items-center gap-2 text-sm text-emerald-400 mt-3">
                        <CheckCircle2 className="w-4 h-4" />
                        {pointsSuccess}
                    </div>
                )}
            </div>
            )}

            {/* JSON Upload */}
            {activeTab === 'drivers' && (
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
            )}

            {driversError && (
                <div className="bg-red-950/40 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-200">
                    {driversError}
                </div>
            )}
            {/* Driver list */}
            {activeTab === 'drivers' && (
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
                                    <th className="p-3 text-left">SteamID</th>
                                    <th className="p-3 text-left">等级</th>
                                    {usePoints && <th className="p-3 text-right">积分</th>}
                                    <th className="p-3 text-right">驾照分</th>
                                    <th className="p-3 text-right">场次</th>
                                    <th className="p-3 text-right">领奖台</th>
                                    <th className="p-3 text-center">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/60">
                                {driversLoading ? (
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
                                            {usePoints && <td className="p-3 text-right text-amber-400 font-semibold">{d.points}</td>}
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
            )}

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
                <RaceEditModal
                    open={previewOpen}
                    mode="import"
                    title="预览导入"
                    subtitle={previewFileName}
                    meta={previewMeta}
                    results={previewResults}
                    usePoints={usePoints}
                    loading={importLoading}
                    error={previewError}
                    onMetaChange={setPreviewMeta}
                    onResultsChange={setPreviewResults}
                    onConfirm={handleConfirmImport}
                    onClose={handleCancelPreview}
                />
            )}
        </div>
    );
};

export default AdminStandingsPage;
