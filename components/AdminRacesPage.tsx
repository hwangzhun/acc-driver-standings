import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Pencil, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { RaceRow } from '../db/standingsTypes';
import { getRaces, adminDeleteRace, adminUpdateRace, getRaceById, getRaceResultsWithDrivers, getAppSettings } from '../services/standingsApi';
import { deleteRaceSessionSnapshot, putRaceSessionSnapshot } from '../services/raceSessionSnapshot';
import RaceEditModal from './RaceEditModal';
import { dbResultsToParsed, type EditableDriverResult } from '../utils/standingsImport';

const SESSION_LABEL: Record<string, string> = { R: '正赛', Q: '排位', P: '练习' };

interface PreviewMeta {
    raceName: string;
    trackName: string;
    serverName: string;
    raceYear: string;
    raceMonth: string;
    raceDay: string;
    sessionType: string;
}

interface DeleteFeedback {
    type: 'success' | 'error';
    message: string;
}

interface Props {
    onOpenRace?: (id: number) => void;
}

const AdminRacesPage: React.FC<Props> = ({ onOpenRace }) => {
    const [races, setRaces] = useState<RaceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deletingRaceId, setDeletingRaceId] = useState<number | null>(null);
    const [feedback, setFeedback] = useState<DeleteFeedback | null>(null);

    // Edit state
    const [editingRaceId, setEditingRaceId] = useState<number | null>(null);
    const [editingMeta, setEditingMeta] = useState<PreviewMeta>({
        raceName: '', trackName: '', serverName: '',
        raceYear: '', raceMonth: '', raceDay: '', sessionType: 'R',
    });
    const [editingResults, setEditingResults] = useState<EditableDriverResult[]>([]);
    const [editingRawText, setEditingRawText] = useState('');
    const [editingLoading, setEditingLoading] = useState(false);
    const [editingError, setEditingError] = useState<string | null>(null);
    const [usePoints, setUsePoints] = useState(false);

    const loadRaces = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const rows = await getRaces();
            setRaces(rows);
            const settings = await getAppSettings();
            setUsePoints(settings.usePoints);
        } catch (e) {
            setRaces([]);
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadRaces();
    }, [loadRaces]);

    const handleDeleteRace = async (race: RaceRow) => {
        const label = race.race_name || race.source_file_name || `#${race.id}`;
        if (!window.confirm(`确定删除「${label}」？\n将移除该场所有成绩并回算车手统计，赛历中的关联也会被清除。`)) return;

        setDeletingRaceId(race.id);
        setFeedback(null);
        try {
            const result = await adminDeleteRace(race.id);
            try {
                await deleteRaceSessionSnapshot(race.id);
            } catch {
                /* ignore */
            }
            setRaces((prev) => prev.filter((r) => r.id !== race.id));
            setFeedback({
                type: 'success',
                message: `已删除「${result.raceName}」，共移除 ${result.resultCount} 条成绩`,
            });
        } catch (err) {
            setFeedback({
                type: 'error',
                message: err instanceof Error ? err.message : String(err),
            });
        } finally {
            setDeletingRaceId(null);
        }
    };

    const handleEditRace = async (race: RaceRow) => {
        try {
            const [raceRow, results] = await Promise.all([
                getRaceById(race.id),
                getRaceResultsWithDrivers(race.id),
            ]);
            if (!raceRow) return;

            const dateStr = (raceRow.race_date || '').slice(0, 10);
            const [y, m, d] = dateStr.split('-');

            setEditingMeta({
                raceName: raceRow.race_name || '',
                trackName: raceRow.track_name || '',
                serverName: raceRow.server_name || '',
                raceYear: y ?? '',
                raceMonth: String(Number(m) || ''),
                raceDay: String(Number(d) || ''),
                sessionType: raceRow.session_type || 'R',
            });
            setEditingResults(dbResultsToParsed(results));
            setEditingRawText('');
            setEditingError(null);
            setEditingLoading(false);
            setEditingRaceId(race.id);
        } catch (e) {
            setFeedback({
                type: 'error',
                message: e instanceof Error ? e.message : String(e),
            });
        }
    };

    const handleConfirmEdit = async () => {
        if (!editingRaceId) return;
        if (!editingMeta.raceYear || !editingMeta.raceMonth || !editingMeta.raceDay) {
            setEditingError('请完整填写比赛日期');
            return;
        }
        if (editingResults.filter(r => !r.removed).length === 0) {
            setEditingError('车手列表为空，请至少保留一条记录');
            return;
        }

        setEditingLoading(true);
        setEditingError(null);

        try {
            const raceDate = `${editingMeta.raceYear}-${editingMeta.raceMonth.padStart(2, '0')}-${editingMeta.raceDay.padStart(2, '0')}`;
            const body = {
                raceName: editingMeta.raceName,
                trackName: editingMeta.trackName,
                serverName: editingMeta.serverName,
                raceDate,
                sessionType: editingMeta.sessionType,
                results: editingResults
                    .filter(r => !r.removed)
                    .map(({ removed: _removed, ...rest }) => rest),
            };

            await adminUpdateRace(editingRaceId, body);

            if (editingRawText) {
                try {
                    await putRaceSessionSnapshot(editingRaceId, editingRawText);
                } catch (e) {
                    console.warn('race session snapshot update failed:', e);
                }
            }

            setEditingRaceId(null);
            void loadRaces();
            setFeedback({
                type: 'success',
                message: `已保存「${editingMeta.raceName}」的更改`,
            });
        } catch (err) {
            setEditingError(err instanceof Error ? err.message : String(err));
        } finally {
            setEditingLoading(false);
        }
    };

    const handleCloseEdit = () => {
        if (editingLoading) return;
        setEditingRaceId(null);
        setEditingRawText('');
        setEditingError(null);
    };

    const editingRaceLabel = editingRaceId
        ? races.find(r => r.id === editingRaceId)?.race_name || `#${editingRaceId}`
        : '';

    return (
        <div className="space-y-6">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-red-400" />
                    已上传比赛
                </h2>
                <p className="text-sm text-slate-400 mb-4">管理已导入的比赛结果，删除后将回算车手榜单统计</p>

                {feedback && (
                    <div className={`flex items-start gap-2 px-4 py-3 rounded-lg border text-sm mb-4 ${
                        feedback.type === 'success'
                            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                            : 'bg-red-950/40 border-red-800 text-red-200'
                    }`}>
                        {feedback.type === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                        ) : (
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                        )}
                        <p>{feedback.message}</p>
                    </div>
                )}

                {error && (
                    <div className="mb-4 text-sm text-red-400">{error}</div>
                )}

                <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[800px] text-sm">
                            <thead>
                                <tr className="bg-slate-800 text-slate-400 text-xs uppercase">
                                    <th className="p-3 text-left">比赛</th>
                                    <th className="p-3 text-left">赛道</th>
                                    <th className="p-3 text-left">日期</th>
                                    <th className="p-3 text-left">类型</th>
                                    <th className="p-3 text-left">源文件</th>
                                    <th className="p-3 text-center">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/60">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-400">加载中…</td>
                                    </tr>
                                ) : races.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-400">暂无已上传比赛</td>
                                    </tr>
                                ) : (
                                    races.map((race) => (
                                        <tr key={race.id} className="hover:bg-slate-700/40">
                                            <td className="p-3">
                                                {onOpenRace ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => onOpenRace(race.id)}
                                                        className="text-slate-100 font-medium hover:text-red-400 transition-colors text-left"
                                                    >
                                                        {race.race_name || '-'}
                                                    </button>
                                                ) : (
                                                    <span className="text-slate-100 font-medium">{race.race_name || '-'}</span>
                                                )}
                                            </td>
                                            <td className="p-3 text-slate-300">{race.track_name || '-'}</td>
                                            <td className="p-3 text-slate-400 font-mono text-xs">
                                                {(race.race_date || '').slice(0, 10) || '-'}
                                            </td>
                                            <td className="p-3 text-slate-400">
                                                {SESSION_LABEL[race.session_type] ?? race.session_type}
                                            </td>
                                            <td
                                                className="p-3 text-slate-500 font-mono text-xs truncate max-w-[220px]"
                                                title={race.source_file_name}
                                            >
                                                {race.source_file_name || '-'}
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleEditRace(race)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500 transition-colors"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                        编辑
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleDeleteRace(race)}
                                                        disabled={deletingRaceId === race.id}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-red-700 text-red-400 hover:bg-red-950/40 transition-colors disabled:opacity-50"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        {deletingRaceId === race.id ? '删除中' : '删除'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Edit modal */}
            {editingRaceId !== null && (
                <RaceEditModal
                    open={editingRaceId !== null}
                    mode="edit"
                    title={`编辑比赛 — ${editingRaceLabel}`}
                    meta={editingMeta}
                    results={editingResults}
                    usePoints={usePoints}
                    loading={editingLoading}
                    error={editingError}
                    onMetaChange={setEditingMeta}
                    onResultsChange={setEditingResults}
                    onConfirm={handleConfirmEdit}
                    onClose={handleCloseEdit}
                    onJsonReplaced={(rawText: string) => setEditingRawText(rawText)}
                />
            )}
        </div>
    );
};

export default AdminRacesPage;