import React from 'react';
import { type ResultIndexItem } from '../types';
import { Calendar, MapPin, ChevronRight } from 'lucide-react';

interface ResultListProps {
  items: ResultIndexItem[];
  onOpenResult: (id: string) => void;
}

const ResultList: React.FC<ResultListProps> = ({ items, onOpenResult }) => {
  if (items.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center text-slate-400">
        暂无成绩数据，请检查索引文件或 COS 目录是否有可用 JSON。
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpenResult(item.id)}
          className="text-left bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-xl p-4 transition-colors"
        >
          <h3 className="text-lg font-bold text-white">{item.title}</h3>
          <div className="mt-3 space-y-2 text-sm text-slate-400">
            <p className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-red-400" />
              <span className="capitalize">{item.track}</span>
            </p>
            <p className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span>{item.date}</span>
            </p>
            <p className="text-xs inline-block px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300">
              {item.sessionType}
            </p>
          </div>
          <div className="mt-4 text-slate-300 text-sm flex items-center gap-2">
            查看成绩表 <ChevronRight className="w-4 h-4" />
          </div>
        </button>
      ))}
    </div>
  );
};

export default ResultList;
