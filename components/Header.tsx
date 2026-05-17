import React from 'react';
import { Trophy } from 'lucide-react';

interface HeaderProps {
    title?: string;
    subtitle?: string;
    /** 顶部主导航（如榜单 / 单场 / 管理） */
    nav?: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({
    title = 'TZCC Racing Results',
    subtitle = 'TZCC 车手榜',
    nav,
}) => {
    return (
        <header className="bg-slate-900 border-b border-slate-800 p-6 sticky top-0 z-20 shadow-xl backdrop-blur-md bg-opacity-90">
            <div className="max-w-[1800px] mx-auto flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-center">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-red-600 to-red-800 rounded-lg shadow-lg">
                        <Trophy className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tighter text-white italic">{title}</h1>
                        <p className="text-xs text-slate-400 font-mono tracking-wider">{subtitle}</p>
                    </div>
                </div>
                {nav ? <div className="flex flex-wrap items-center gap-2 lg:justify-end">{nav}</div> : null}
            </div>
        </header>
    );
};

export default Header;
