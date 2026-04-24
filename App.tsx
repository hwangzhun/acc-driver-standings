import React, { useEffect, useMemo, useState } from 'react';
import { List } from 'lucide-react';
import Header from './components/Header';
import ResultList from './components/ResultList';
import Leaderboard from './components/Leaderboard';
import DriverDetail from './components/DriverDetail';
import { type AccResultData, type ParsedResultCsv, type ResultIndexItem } from './types';
import { getRaceJsonUrl, listRaceJsonObjects } from './services/cosClient';
import {
    fetchCsvText,
    fetchAccResultJson,
    fetchResultsIndex,
    mapCosObjectsToResultIndex,
    parseResultCsv,
} from './utils';

/** 与 JSON `sessionType` 一致：R/Q/P */
function sessionTypeLabelCn(sessionType: string): string {
    switch (sessionType) {
        case 'R':
            return '正赛';
        case 'Q':
            return '排位';
        case 'P':
            return '练习';
        default:
            return sessionType;
    }
}

function formatSessionDateLabel(raw?: string | null): string {
    if (!raw) return '';
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(d);
    }
    return raw;
}

const App: React.FC = () => {
    const resultsSource = (import.meta.env.VITE_RESULTS_SOURCE ?? 'static').toLowerCase();
    const [indexItems, setIndexItems] = useState<ResultIndexItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedResult, setSelectedResult] = useState<ParsedResultCsv | null>(null);
    const [jsonData, setJsonData] = useState<AccResultData | null>(null);
    const [selectedCarId, setSelectedCarId] = useState<number | null>(null);
    const [manualPenaltyMsByCarId, setManualPenaltyMsByCarId] = useState<Record<number, number>>({});
    const [classFilter, setClassFilter] = useState<'all' | 'GT2' | 'GT3' | 'GT4'>('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadIndex = async () => {
            try {
                setLoading(true);
                setError(null);
                let items: ResultIndexItem[] = [];
                if (resultsSource === 'cos') {
                    const prefix = import.meta.env.VITE_COS_PREFIX ?? '';
                    const cosItems = await listRaceJsonObjects(prefix);
                    items = mapCosObjectsToResultIndex(cosItems);
                } else {
                    items = await fetchResultsIndex();
                }
                setIndexItems(items);
            } catch (err) {
                const detail = err instanceof Error ? err.message : String(err);
                setError(
                    resultsSource === 'cos'
                        ? `加载 COS 索引失败：${detail}（请检查 STS 接口、Bucket/Region 与 CORS）`
                        : `加载索引失败：${detail}`
                );
            } finally {
                setLoading(false);
            }
        };
        void loadIndex();
    }, [resultsSource]);

    useEffect(() => {
        const parseHash = () => {
            const hash = window.location.hash.replace(/^#/, '');
            if (!hash.startsWith('/result/')) {
                setSelectedId(null);
                return;
            }
            const id = decodeURIComponent(hash.slice('/result/'.length));
            setSelectedId(id || null);
        };

        parseHash();
        window.addEventListener('hashchange', parseHash);
        return () => window.removeEventListener('hashchange', parseHash);
    }, []);

    const selectedItem = useMemo(
        () => indexItems.find((i) => i.id === selectedId) ?? null,
        [indexItems, selectedId]
    );

    useEffect(() => {
        const loadResult = async () => {
            if (!selectedItem) {
                setSelectedResult(null);
                setJsonData(null);
                setSelectedCarId(null);
                setManualPenaltyMsByCarId({});
                setClassFilter('all');
                return;
            }
            try {
                setLoading(true);
                setError(null);
                const rawPath = selectedItem.dataPath ?? selectedItem.csvPath;
                const path =
                    resultsSource === 'cos' && !/^https?:\/\//i.test(rawPath)
                        ? await getRaceJsonUrl(rawPath)
                        : rawPath;
                const isJsonSource = /\.json$/i.test(rawPath) || /\.json(?:[?#].*)?$/i.test(path);
                if (isJsonSource) {
                    const data = await fetchAccResultJson(path);
                    setJsonData(data);
                    setSelectedResult(null);
                } else {
                    const text = await fetchCsvText(path);
                    setSelectedResult(parseResultCsv(text));
                    setJsonData(null);
                }
                setManualPenaltyMsByCarId({});
                setClassFilter('all');
            } catch (err) {
                const detail = err instanceof Error ? err.message : String(err);
                setError(
                    resultsSource === 'cos'
                        ? `加载成绩失败：${detail}（可能是 STS 过期、对象权限或 CORS 限制）`
                        : `加载成绩失败：${detail}`
                );
                setSelectedResult(null);
                setJsonData(null);
            } finally {
                setLoading(false);
            }
        };
        void loadResult();
    }, [resultsSource, selectedItem]);

    const openResult = (id: string) => {
        window.location.hash = `/result/${encodeURIComponent(id)}`;
    };

    const backToList = () => {
        window.location.hash = '/';
    };

    const viewData = useMemo<AccResultData | null>(() => {
        if (jsonData) return jsonData;
        if (!selectedItem || !selectedResult || selectedResult.headers.length === 0) return null;

        const headers = selectedResult.headers;
        const col = (name: string) => headers.findIndex((h) => h.trim() === name);
        const iRank = col('排名');
        const iRaceNumber = col('车号');
        const iDriver = col('主车手');
        const iCarModelName = col('车型');
        const iTotalTime = col('完赛时间');
        const iLapCount = col('圈数');
        const iDsqReason = col('取消资格原因');

        const parseTimeToMs = (value: string): number => {
            const v = (value || '').trim();
            if (!v || v === '-:--.---' || v === '-') return 2147483647;
            const m = /^(\d+):(\d{2})\.(\d{3})$/.exec(v);
            if (!m) return 2147483647;
            return Number(m[1]) * 60000 + Number(m[2]) * 1000 + Number(m[3]);
        };

        const lines = selectedResult.rows.map((row, idx) => {
            const raceNumberRaw = iRaceNumber >= 0 ? row[iRaceNumber] : '';
            const raceNumber = Number.parseInt(raceNumberRaw || '', 10);
            const driverName = (iDriver >= 0 ? row[iDriver] : '').trim() || `Driver ${idx + 1}`;
            const [firstName, ...rest] = driverName.split(' ');
            const lastName = rest.join(' ');
            const totalTime = parseTimeToMs(iTotalTime >= 0 ? row[iTotalTime] : '');
            const lapCount = Number.parseInt((iLapCount >= 0 ? row[iLapCount] : '') || '0', 10) || 0;
            const carName = iCarModelName >= 0 ? row[iCarModelName] : '';
            const dsq = (iRank >= 0 ? row[iRank] : '').trim().toUpperCase() === 'DSQ';

            return {
                car: {
                    carId: idx + 1,
                    raceNumber: Number.isFinite(raceNumber) ? raceNumber : idx + 1,
                    carModel: 32,
                    cupCategory: 0,
                    carGroup: 'GT3',
                    teamName: carName || '',
                    nationality: 0,
                    drivers: [
                        {
                            firstName: firstName || '',
                            lastName: lastName || driverName,
                            shortName: driverName.slice(0, 3).toUpperCase(),
                            playerId: `csv-${idx + 1}`,
                        },
                    ],
                },
                currentDriver: {
                    firstName: firstName || '',
                    lastName: lastName || driverName,
                    shortName: driverName.slice(0, 3).toUpperCase(),
                    playerId: `csv-${idx + 1}`,
                },
                currentDriverIndex: 0,
                timing: {
                    lastLap: totalTime,
                    lastSplits: [],
                    bestLap: totalTime,
                    bestSplits: [2147483647, 2147483647, 2147483647],
                    totalTime,
                    lapCount,
                    lastSplitId: 0,
                },
                missingMandatoryPitstop: -1,
                driverTotalTimes: [],
            };
        });

        const penalties = lines.reduce<Array<{
            carId: number;
            driverIndex: number;
            reason: string;
            penalty: string;
            penaltyValue: number;
            violationInLap: number;
            clearedInLap: number;
        }>>((acc, line, idx) => {
            const isDsq = (iRank >= 0 ? selectedResult.rows[idx][iRank] : '').trim().toUpperCase() === 'DSQ';
            if (!isDsq) return acc;
            acc.push({
                carId: line.car.carId,
                driverIndex: 0,
                reason:
                    (iDsqReason >= 0 ? selectedResult.rows[idx][iDsqReason] : '').trim() || 'Disqualified',
                penalty: 'Disqualified',
                penaltyValue: 0,
                violationInLap: -1,
                clearedInLap: -1,
            });
            return acc;
        }, []);

        return {
            sessionType: selectedItem.sessionType.includes('正赛') ? 'R' : 'Q',
            trackName: selectedItem.track,
            sessionIndex: 0,
            raceWeekendIndex: 0,
            metaData: selectedResult.metadataLine,
            serverName: selectedResult.metadata.session || selectedItem.title,
            sessionResult: {
                bestlap: 2147483647,
                bestSplits: [2147483647, 2147483647, 2147483647],
                isWetSession: 0,
                type: 0,
                leaderBoardLines: lines,
            },
            laps: [],
            penalties,
            post_race_penalties: [],
        };
    }, [jsonData, selectedItem, selectedResult]);

    useEffect(() => {
        const first = viewData?.sessionResult.leaderBoardLines[0];
        setSelectedCarId(first ? first.car.carId : null);
    }, [viewData]);

    const sessionDateLabel = useMemo(() => {
        const fromJson = formatSessionDateLabel(viewData?.exportedAt);
        if (fromJson) return fromJson;
        return formatSessionDateLabel(selectedItem?.date);
    }, [selectedItem?.date, viewData?.exportedAt]);

    const setManualPenaltyForCar = (carId: number, ms: number) => {
        const clamped = Math.min(9999_000, Math.max(0, Math.round(ms)));
        setManualPenaltyMsByCarId((prev) => {
            if (clamped === 0) {
                const next = { ...prev };
                delete next[carId];
                return next;
            }
            return { ...prev, [carId]: clamped };
        });
    };

    return (
        <div className="min-h-screen flex flex-col bg-slate-900 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
            <Header />

            <main className="flex-grow p-4 md:p-6 max-w-[1800px] mx-auto w-full space-y-6">
                {loading && (
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-slate-300">
                        正在加载数据...
                    </div>
                )}
                {!loading && error && (
                    <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-red-200">
                        {error}
                    </div>
                )}
                {!loading && !error && !selectedItem && (
                    <ResultList items={indexItems} onOpenResult={openResult} />
                )}
                {!loading && !error && selectedItem && viewData && (
                    <div className="space-y-4">
                        <div className="w-full">
                            <button
                                type="button"
                                onClick={backToList}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800/90 border border-slate-600 text-slate-100 text-sm font-medium shadow-sm hover:bg-slate-700 hover:border-slate-500 active:scale-[0.98] transition-colors"
                            >
                                <List className="w-4 h-4 text-red-400 shrink-0" aria-hidden />
                                返回成绩列表
                            </button>
                        </div>
                        <div className="w-full border-b border-slate-700/80 pb-4">
                            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                                {String(viewData.serverName ?? '').trim() || '未命名会话'}
                            </h2>
                            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400">
                                {viewData.trackName ? (
                                    <span className="font-mono capitalize">{viewData.trackName}</span>
                                ) : null}
                                {viewData.trackName && (viewData.sessionType || sessionDateLabel) ? (
                                    <span className="text-slate-600" aria-hidden>
                                        ·
                                    </span>
                                ) : null}
                                {viewData.sessionType ? (
                                    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold bg-slate-700/80 text-slate-200 border border-slate-600">
                                        {sessionTypeLabelCn(viewData.sessionType)}
                                    </span>
                                ) : null}
                                {sessionDateLabel ? (
                                    <>
                                        {viewData.sessionType ? (
                                            <span className="text-slate-600" aria-hidden>
                                                ·
                                            </span>
                                        ) : null}
                                        <span className="font-mono text-xs text-slate-300">{sessionDateLabel}</span>
                                    </>
                                ) : null}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                            <div className="lg:col-span-8 xl:col-span-9 min-w-0">
                                <Leaderboard
                                    lines={viewData.sessionResult.leaderBoardLines}
                                    sessionType={viewData.sessionType}
                                    onSelectDriver={setSelectedCarId}
                                    selectedCarId={selectedCarId}
                                    penalties={[...(viewData.penalties ?? []), ...(viewData.post_race_penalties ?? [])]}
                                    manualPenaltyMsByCarId={manualPenaltyMsByCarId}
                                    trackName={viewData.trackName}
                                    sessionName={viewData.serverName ?? ''}
                                    classFilter={classFilter}
                                    onClassFilterChange={setClassFilter}
                                />
                            </div>
                            <div className="lg:col-span-4 xl:col-span-3 min-w-0">
                                <div className="sticky top-24 h-[calc(100vh-8rem)]">
                                    <DriverDetail
                                        carId={selectedCarId}
                                        leaderboard={viewData.sessionResult.leaderBoardLines}
                                        laps={viewData.laps}
                                        sessionBestSplits={viewData.sessionResult.bestSplits}
                                        sessionType={viewData.sessionType}
                                        sessionTitle={String(viewData.serverName ?? '').trim() || undefined}
                                        trackName={viewData.trackName || undefined}
                                        penalties={[...(viewData.penalties ?? []), ...(viewData.post_race_penalties ?? [])]}
                                        manualPenaltyMsByCarId={manualPenaltyMsByCarId}
                                        onManualPenaltyChange={setManualPenaltyForCar}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <footer className="bg-slate-950 text-slate-600 text-center p-4 text-xs border-t border-slate-900 mt-auto">
                ACC 成绩展示站 By Hwangzhun &copy; {new Date().getFullYear()}
            </footer>
        </div>
    );
};

export default App;