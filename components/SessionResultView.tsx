import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, List } from 'lucide-react';
import Leaderboard from './Leaderboard';
import DriverDetail from './DriverDetail';
import type { AccResultData } from '../types';
import { trackDisplay } from '../constants/tracks';
import { sessionTypeLabelCn } from '../utils';

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

export interface SessionResultViewProps {
    viewData: AccResultData;
    onBack: () => void;
    /** 返回按钮文案，默认「返回成绩列表」 */
    backButtonLabel?: string;
    /** 为 true 时使用 List 图标（单场成绩）；否则使用 ArrowLeft */
    backUsesListIcon?: boolean;
}

const SessionResultView: React.FC<SessionResultViewProps> = ({
    viewData,
    onBack,
    backButtonLabel = '返回成绩列表',
    backUsesListIcon = true,
}) => {
    const [selectedCarId, setSelectedCarId] = useState<number | null>(null);
    const [manualPenaltyMsByCarId, setManualPenaltyMsByCarId] = useState<Record<number, number>>({});
    const [classFilter, setClassFilter] = useState<'all' | 'GT2' | 'GT3' | 'GT4'>('all');

    useEffect(() => {
        const first = viewData.sessionResult.leaderBoardLines[0];
        setSelectedCarId(first ? first.car.carId : null);
    }, [viewData]);

    const sessionDateLabel = useMemo(
        () => formatSessionDateLabel(viewData.exportedAt),
        [viewData.exportedAt]
    );

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

    const BackIcon = backUsesListIcon ? List : ArrowLeft;

    return (
        <div className="space-y-4">
            <div className="w-full">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800/90 border border-slate-600 text-slate-100 text-sm font-medium shadow-sm hover:bg-slate-700 hover:border-slate-500 active:scale-[0.98] transition-colors"
                >
                    <BackIcon className="w-4 h-4 text-red-400 shrink-0" aria-hidden />
                    {backButtonLabel}
                </button>
            </div>
            <div className="w-full border-b border-slate-700/80 pb-4">
                <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                    {String(viewData.serverName ?? '').trim() || '未命名会话'}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400">
                    {viewData.trackName ? (
                        <span>{trackDisplay(viewData.trackName)}</span>
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
    );
};

export default SessionResultView;
