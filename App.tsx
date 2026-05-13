import React, { useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import ResultList from './components/ResultList';
import SessionResultView from './components/SessionResultView';
import DriverStandingsPage from './components/DriverStandingsPage';
import DbDriverDetailPage from './components/DbDriverDetailPage';
import DbRaceDetailPage from './components/DbRaceDetailPage';
import AdminStandingsPage from './components/AdminStandingsPage';
import { type AccResultData, type ParsedResultCsv, type ResultIndexItem } from './types';
import { getRaceJsonUrl, listRaceJsonObjects } from './services/cosClient';
import {
    fetchCsvText,
    fetchAccResultJson,
    fetchResultsIndex,
    mapCosObjectsToResultIndex,
    parseResultCsv,
} from './utils';
import { initStandingsApi } from './services/standingsApi';

export type AppRoute =
    | { type: 'home' }
    | { type: 'result'; id: string }
    | { type: 'drivers' }
    | { type: 'driver'; id: number }
    | { type: 'race'; id: number }
    | { type: 'admin' }
    | { type: 'adminDriver'; id: number };

function parseRoute(): AppRoute {
    const raw = window.location.hash.replace(/^#/, '').replace(/^\//, '') || '';
    if (raw.startsWith('result/')) {
        const id = decodeURIComponent(raw.slice('result/'.length));
        return id ? { type: 'result', id } : { type: 'home' };
    }
    if (raw.startsWith('admin/driver/')) {
        const n = Number(raw.slice('admin/driver/'.length));
        return Number.isFinite(n) ? { type: 'adminDriver', id: n } : { type: 'admin' };
    }
    if (raw === 'admin' || raw.startsWith('admin/')) return { type: 'admin' };
    if (raw === 'drivers') return { type: 'drivers' };
    if (raw.startsWith('driver/')) {
        const n = Number(raw.slice('driver/'.length));
        return Number.isFinite(n) ? { type: 'driver', id: n } : { type: 'drivers' };
    }
    if (raw.startsWith('race/')) {
        const n = Number(raw.slice('race/'.length));
        return Number.isFinite(n) ? { type: 'race', id: n } : { type: 'home' };
    }
    return { type: 'home' };
}

const RACE_BACK_KEY = 'acc-race-detail-back-hash';

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
    return (
        <a
            href={href}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                active
                    ? 'bg-slate-700 border-slate-500 text-white'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'
            }`}
        >
            {label}
        </a>
    );
}

const App: React.FC = () => {
    const resultsSource = (import.meta.env.VITE_RESULTS_SOURCE ?? 'static').toLowerCase();
    const [route, setRoute] = useState<AppRoute>(() => parseRoute());
    const [indexItems, setIndexItems] = useState<ResultIndexItem[]>([]);
    const [indexLoading, setIndexLoading] = useState(true);
    const [indexError, setIndexError] = useState<string | null>(null);
    const [selectedResult, setSelectedResult] = useState<ParsedResultCsv | null>(null);
    const [jsonData, setJsonData] = useState<AccResultData | null>(null);
    const [resultLoading, setResultLoading] = useState(false);
    const [resultError, setResultError] = useState<string | null>(null);
    const [sqliteReady, setSqliteReady] = useState(false);
    const [sqliteError, setSqliteError] = useState<string | null>(null);

    useEffect(() => {
        const sync = () => setRoute(parseRoute());
        sync();
        window.addEventListener('hashchange', sync);
        return () => window.removeEventListener('hashchange', sync);
    }, []);

    useEffect(() => {
        void initStandingsApi()
            .then(() => {
                setSqliteReady(true);
                setSqliteError(null);
            })
            .catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                setSqliteError(`榜单服务不可用：${msg}（请先运行 npm run dev:server 或 npm run dev:all）`);
            });
    }, []);

    useEffect(() => {
        const loadIndex = async () => {
            try {
                setIndexLoading(true);
                setIndexError(null);
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
                setIndexError(
                    resultsSource === 'cos'
                        ? `加载 COS 索引失败：${detail}（请检查 STS 接口、Bucket/Region 与 CORS）`
                        : `加载索引失败：${detail}`
                );
            } finally {
                setIndexLoading(false);
            }
        };
        void loadIndex();
    }, [resultsSource]);

    const selectedId = route.type === 'result' ? route.id : null;
    const selectedItem = useMemo(
        () => (selectedId ? indexItems.find((i) => i.id === selectedId) ?? null : null),
        [indexItems, selectedId]
    );

    useEffect(() => {
        const loadResult = async () => {
            if (!selectedItem) {
                setSelectedResult(null);
                setJsonData(null);
                setResultLoading(false);
                setResultError(null);
                return;
            }
            try {
                setResultLoading(true);
                setResultError(null);
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
            } catch (err) {
                const detail = err instanceof Error ? err.message : String(err);
                setResultError(
                    resultsSource === 'cos'
                        ? `加载成绩失败：${detail}（可能是 STS 过期、对象权限或 CORS 限制）`
                        : `加载成绩失败：${detail}`
                );
                setSelectedResult(null);
                setJsonData(null);
            } finally {
                setResultLoading(false);
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

    const [raceShowSteam, setRaceShowSteam] = useState(false);

    useEffect(() => {
        if (route.type !== 'race') return;
        try {
            setRaceShowSteam(sessionStorage.getItem('acc-race-show-steam') === '1');
            sessionStorage.removeItem('acc-race-show-steam');
        } catch {
            setRaceShowSteam(false);
        }
    }, [route]);

    const isStandingsSection =
        route.type === 'drivers' ||
        route.type === 'driver' ||
        route.type === 'race' ||
        route.type === 'admin' ||
        route.type === 'adminDriver';

    const navActive = {
        sessions: route.type === 'home' || route.type === 'result',
        drivers: route.type === 'drivers' || route.type === 'driver' || route.type === 'race',
        admin: route.type === 'admin' || route.type === 'adminDriver',
    };

    const headerNav = (
        <>
            <NavLink href="#/" label="单场成绩" active={navActive.sessions} />
            <NavLink href="#/drivers" label="车手榜单" active={navActive.drivers} />
            <NavLink href="#/admin" label="管理" active={navActive.admin} />
        </>
    );

    const openDriverPublic = (id: number) => {
        window.location.hash = `/driver/${id}`;
    };

    const openRaceFromDriver = (info: number | { raceId: number; resultIndexId?: string | null }) => {
        const raceId = typeof info === 'number' ? info : info.raceId;
        const resultIndexId = typeof info === 'number' ? undefined : info.resultIndexId;
        try {
            sessionStorage.setItem(RACE_BACK_KEY, window.location.hash.replace(/^#/, ''));
            const adminFlow = /admin\/driver\//.test(window.location.hash);
            sessionStorage.setItem('acc-race-show-steam', adminFlow ? '1' : '0');
        } catch {
            /* ignore */
        }
        if (resultIndexId) {
            window.location.hash = `/result/${encodeURIComponent(resultIndexId)}`;
        } else {
            window.location.hash = `/race/${raceId}`;
        }
    };

    const raceDetailBack = () => {
        let h = '/drivers';
        try {
            h = sessionStorage.getItem(RACE_BACK_KEY) || '/drivers';
            sessionStorage.removeItem(RACE_BACK_KEY);
        } catch {
            /* ignore */
        }
        window.location.hash = h.startsWith('/') ? h : `/${h}`;
    };

    return (
        <div className="min-h-screen flex flex-col bg-slate-900 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
            <Header nav={headerNav} />

            <main className="flex-grow p-4 md:p-6 max-w-[1800px] mx-auto w-full space-y-6">
                {isStandingsSection && (
                    <>
                        {sqliteError && (
                            <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-red-200">
                                {sqliteError}
                            </div>
                        )}
                        {!sqliteReady && !sqliteError && (
                            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-slate-300">
                                正在初始化车手榜单数据库…
                            </div>
                        )}
                        {sqliteReady && route.type === 'drivers' && (
                            <DriverStandingsPage onOpenDriver={openDriverPublic} />
                        )}
                        {sqliteReady && route.type === 'driver' && (
                            <DbDriverDetailPage
                                driverId={route.id}
                                showSteamId={false}
                                onBack={() => {
                                    window.location.hash = '/drivers';
                                }}
                                onOpenRace={openRaceFromDriver}
                            />
                        )}
                        {sqliteReady && route.type === 'race' && (
                            <DbRaceDetailPage
                                raceId={route.id}
                                showSteamId={raceShowSteam}
                                onBack={raceDetailBack}
                            />
                        )}
                        {sqliteReady && route.type === 'admin' && (
                            <AdminStandingsPage
                                onOpenDriver={(id) => {
                                    window.location.hash = `/admin/driver/${id}`;
                                }}
                            />
                        )}
                        {sqliteReady && route.type === 'adminDriver' && (
                            <DbDriverDetailPage
                                driverId={route.id}
                                showSteamId
                                allowTierEdit
                                onTierChange={(tier) => {
                                    // tier edit is handled inline via patchDriverTier inside DbDriverDetailPage
                                    void tier;
                                }}
                                onBack={() => {
                                    window.location.hash = '/admin';
                                }}
                                onOpenRace={openRaceFromDriver}
                            />
                        )}
                    </>
                )}

                {!isStandingsSection && indexLoading && (
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-slate-300">
                        正在加载数据...
                    </div>
                )}
                {!isStandingsSection && !indexLoading && indexError && (
                    <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-red-200">{indexError}</div>
                )}
                {!isStandingsSection && !indexLoading && !indexError && !selectedItem && (
                    <ResultList items={indexItems} onOpenResult={openResult} />
                )}
                {!isStandingsSection && !indexLoading && !indexError && selectedItem && resultLoading && (
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-slate-300">
                        正在加载本场成绩…
                    </div>
                )}
                {!isStandingsSection && !indexLoading && !indexError && selectedItem && !resultLoading && resultError && (
                    <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-red-200">{resultError}</div>
                )}
                {!isStandingsSection &&
                    !indexLoading &&
                    !indexError &&
                    selectedItem &&
                    !resultLoading &&
                    !resultError &&
                    viewData && <SessionResultView viewData={viewData} onBack={backToList} />}
                {!isStandingsSection &&
                    !indexLoading &&
                    !indexError &&
                    selectedItem &&
                    !resultLoading &&
                    !resultError &&
                    !viewData && (
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-slate-400">
                            无法解析本场成绩数据。
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
