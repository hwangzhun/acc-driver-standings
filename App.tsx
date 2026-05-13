import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import ResultList from './components/ResultList';
import DriverStandingsPage from './components/DriverStandingsPage';
import DbDriverDetailPage from './components/DbDriverDetailPage';
import DbRaceDetailPage from './components/DbRaceDetailPage';
import type { ResultIndexItem } from './types';
import { sessionTypeLabelCn } from './utils';
import { initStandingsApi, getRaces } from './services/standingsApi';

export type AppRoute =
    | { type: 'home' }
    | { type: 'drivers' }
    | { type: 'driver'; id: number }
    | { type: 'race'; id: number };

function parseRoute(): AppRoute {
    const raw = window.location.hash.replace(/^#/, '').replace(/^\//, '') || '';
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
    const [route, setRoute] = useState<AppRoute>(() => parseRoute());
    const [races, setRaces] = useState<ResultIndexItem[]>([]);
    const [racesLoading, setRacesLoading] = useState(true);
    const [racesError, setRacesError] = useState<string | null>(null);
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
        if (!sqliteReady) return;

        const loadRaces = async () => {
            try {
                setRacesLoading(true);
                setRacesError(null);
                const rows = await getRaces();
                const items: ResultIndexItem[] = rows.map((row) => ({
                    id: String(row.id),
                    title: row.race_name,
                    track: row.track_name || '',
                    sessionType: sessionTypeLabelCn(row.session_type),
                    date: (row.race_date || '').slice(0, 10),
                    csvPath: '',
                }));
                setRaces(items);
            } catch (err) {
                const detail = err instanceof Error ? err.message : String(err);
                setRacesError(`加载比赛列表失败：${detail}`);
            } finally {
                setRacesLoading(false);
            }
        };
        void loadRaces();
    }, [sqliteReady]);

    const openRace = (raceId: number) => {
        try {
            sessionStorage.setItem(RACE_BACK_KEY, window.location.hash.replace(/^#/, ''));
        } catch {
            /* ignore */
        }
        window.location.hash = `/race/${raceId}`;
    };

    const raceDetailBack = () => {
        let h = '/';
        try {
            h = sessionStorage.getItem(RACE_BACK_KEY) || '/';
            sessionStorage.removeItem(RACE_BACK_KEY);
        } catch {
            /* ignore */
        }
        window.location.hash = h.startsWith('/') ? h : `/${h}`;
    };

    const isStandingsSection =
        route.type === 'drivers' ||
        route.type === 'driver' ||
        route.type === 'race';

    const navActive = {
        sessions: route.type === 'home',
        drivers: route.type === 'drivers' || route.type === 'driver' || route.type === 'race',
    };

    const headerNav = (
        <>
            <NavLink href="#/" label="单场成绩" active={navActive.sessions} />
            <NavLink href="#/drivers" label="车手榜单" active={navActive.drivers} />
        </>
    );

    const openDriverPublic = (id: number) => {
        window.location.hash = `/driver/${id}`;
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
                                onOpenRace={() => {}}
                            />
                        )}
                        {sqliteReady && route.type === 'race' && (
                            <DbRaceDetailPage
                                raceId={route.id}
                                showSteamId={false}
                                onBack={raceDetailBack}
                            />
                        )}
                    </>
                )}

                {!isStandingsSection && racesLoading && (
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-slate-300">
                        正在加载数据...
                    </div>
                )}
                {!isStandingsSection && !racesLoading && racesError && (
                    <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-red-200">{racesError}</div>
                )}
                {!isStandingsSection && !racesLoading && !racesError && races.length === 0 && (
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-slate-400 text-center">
                        暂无导入的比赛，请联系管理员上传 JSON
                    </div>
                )}
                {!isStandingsSection && !racesLoading && !racesError && races.length > 0 && (
                    <ResultList
                        items={races}
                        onOpenResult={(id) => openRace(Number(id))}
                    />
                )}
            </main>

            <footer className="bg-slate-950 text-slate-600 text-center p-4 text-xs border-t border-slate-900 mt-auto">
                ACC 成绩展示站 By Hwangzhun &copy; {new Date().getFullYear()}
            </footer>
        </div>
    );
};

export default App;