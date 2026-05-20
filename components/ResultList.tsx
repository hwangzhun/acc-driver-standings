import React from 'react';
import { type ResultIndexItem } from '../types';
import { ChevronRight } from 'lucide-react';
import { trackDisplay } from '../constants/tracks';

interface ResultListProps {
  items: ResultIndexItem[];
  onOpenResult: (id: string) => void;
}

const ResultList: React.FC<ResultListProps> = ({ items, onOpenResult }) => {
  if (items.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center text-slate-400">
        暂无导入的比赛，请联系管理员上传。
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wide">
              <th className="p-3 text-left font-medium">比赛名称</th>
              <th className="p-3 text-left font-medium w-[min(28%,220px)]">赛道</th>
              <th className="p-3 text-left font-medium whitespace-nowrap w-[140px]">时间</th>
              <th className="p-3 text-center font-medium w-[100px]">类型</th>
              <th className="p-3 w-12" aria-hidden />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60">
            {items.map((item) => (
              <tr
                key={item.id}
                className="hover:bg-slate-700/40 cursor-pointer transition-colors group"
                onClick={() => onOpenResult(item.id)}
              >
                <td className="p-3 text-slate-100 font-semibold group-hover:text-red-100">
                  {item.title}
                </td>
                <td className="p-3 text-slate-300 text-xs sm:text-sm">
                  {trackDisplay(item.track)}
                </td>
                <td className="p-3 text-slate-400 font-mono text-xs sm:text-sm whitespace-nowrap">
                  {item.date || '—'}
                </td>
                <td className="p-3 text-center">
                  <span className="inline-block text-xs font-medium px-2 py-1 rounded-md bg-slate-900 border border-slate-600 text-slate-300">
                    {item.sessionType}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <span className="inline-flex items-center gap-0.5 text-xs text-slate-500 group-hover:text-slate-200">
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-red-400 transition-colors" aria-hidden />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResultList;
