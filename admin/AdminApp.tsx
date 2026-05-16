import React, { useEffect, useState, useCallback } from 'react';
import Header from '../components/Header';
import AdminStandingsPage from '../components/AdminStandingsPage';
import AdminCalendarPage from '../components/AdminCalendarPage';
import DbDriverDetailPage from '../components/DbDriverDetailPage';
import DbRaceDetailPage from '../components/DbRaceDetailPage';
import { adminMe, adminLogout, clearAdminToken, getAppSettings } from '../services/standingsApi';
import { LogOut } from 'lucide-react';
import LoginPage from './LoginPage';

type AdminRoute =
    | { type: 'home' }
    | { type: 'driver'; id: number }
    | { type: 'race'; id: number }
    | { type: 'calendar' };

function parseRoute(): AdminRoute {
    const raw = window.location.hash.replace(/^#/, '').replace(/^\//, '') || '';
    if (raw === 'calendar') return { type: 'calendar' };
    if (raw.startsWith('driver/')) {
        const n = Number(raw.slice('driver/'.length));
        return Number.isFinite(n) ? { type: 'driver', id: n } : { type: 'home' };
    }
    if (raw.startsWith('race/')) {
        const n = Number(raw.slice('race/'.length));
        return Number.isFinite(n) ? { type: 'race', id: n } : { type: 'home' };
    }
    return { type: 'home' };
}

const AdminApp: React.FC = () => {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [route, setRoute] = useState<AdminRoute>(() => parseRoute());
  const [usePoints, setUsePoints] = useState(false);
  const [positionPointsMap, setPositionPointsMap] = useState<Record<number, number>>({});

  useEffect(() => {
    const sync = () => setRoute(parseRoute());
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await adminMe();
        setAuthenticated(true);
        try {
          const s = await getAppSettings();
          setUsePoints(s.usePoints);
          setPositionPointsMap(s.positionPointsMap);
        } catch {
          /* ignore */
        }
      } catch {
        clearAdminToken();
        setAuthenticated(false);
      } finally {
        setAuthChecked(true);
      }
    };
    void checkAuth();
  }, []);

  useEffect(() => {
    const handler = () => {
      clearAdminToken();
      setAuthenticated(false);
    };
    window.addEventListener('acc:admin-unauthorized', handler);
    return () => window.removeEventListener('acc:admin-unauthorized', handler);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await adminLogout();
    } catch {
      /* ignore */
    }
    clearAdminToken();
    setAuthenticated(false);
  }, []);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-900 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
        <div className="flex-grow flex items-center justify-center">
          <div className="text-slate-400 text-sm">正在验证身份...</div>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <LoginPage onSuccess={() => setAuthenticated(true)} />;
  }

const navActive = {
        home: route.type === 'home',
        driver: route.type === 'driver',
        race: route.type === 'race',
        calendar: route.type === 'calendar',
    };

    const headerNav = (
        <>
            <button
                type="button"
                onClick={() => { window.location.hash = '/'; }}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    navActive.home
                        ? 'bg-red-700 border-red-600 text-white'
                        : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'
                }`}
            >
                榜单管理
            </button>
            <button
                type="button"
                onClick={() => { window.location.hash = '/calendar'; }}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    navActive.calendar
                        ? 'bg-red-700 border-red-600 text-white'
                        : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'
                }`}
            >
                赛历管理
            </button>
            <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
            >
                <LogOut className="w-4 h-4" />
                退出登录
            </button>
        </>
    );

  const openDriver = (id: number) => {
    window.location.hash = `/driver/${id}`;
  };

  const openRace = (id: number) => {
    window.location.hash = `/race/${id}`;
  };

  const openRaceFromDriver = (info: number | { raceId: number; resultIndexId?: string | null }) => {
    const raceId = typeof info === 'number' ? info : info.raceId;
    window.location.hash = `/race/${raceId}`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
      <Header
        title="ACC 管理后台"
        subtitle="Admin Panel"
        nav={headerNav}
      />

      <main className="flex-grow p-4 md:p-6 max-w-[1800px] mx-auto w-full space-y-6">
        {route.type === 'home' && (
          <AdminStandingsPage
            onOpenDriver={openDriver}
            usePoints={usePoints}
            onUsePointsChange={setUsePoints}
            positionPointsMap={positionPointsMap}
            onPositionPointsMapChange={setPositionPointsMap}
          />
        )}
        {route.type === 'driver' && (
          <DbDriverDetailPage
            driverId={route.id}
            showSteamId
            usePoints={usePoints}
            allowTierEdit
            onTierChange={(tier) => { void tier; }}
            onBack={() => { window.location.hash = '/'; }}
            onOpenRace={openRaceFromDriver}
          />
        )}
        {route.type === 'race' && (
          <DbRaceDetailPage
            raceId={route.id}
            showSteamId
            usePoints={usePoints}
            onBack={() => { window.location.hash = '/'; }}
          />
        )}
        {route.type === 'calendar' && (
          <AdminCalendarPage onBack={() => { window.location.hash = '/'; }} />
        )}
      </main>

      <footer className="bg-slate-950 text-slate-600 text-center p-4 text-xs border-t border-slate-900 mt-auto">
        ACC 成绩展示站 By Hwangzhun &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default AdminApp;
