import React from 'react';
import { type ParsedResultCsv, type ResultIndexItem } from '../types';
import { ArrowLeft } from 'lucide-react';

interface ResultTableProps {
  item: ResultIndexItem;
  result: ParsedResultCsv;
  onBack: () => void;
}

const ResultTable: React.FC<ResultTableProps> = ({ item, result, onBack }) => {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
      <div className="p-4 border-b border-slate-700 bg-slate-900/60">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          返回成绩列表
        </button>
        <h2 className="text-xl font-bold text-white">{item.title}</h2>
        <p className="text-sm text-slate-400 mt-1">
          {result.metadata.session || item.sessionType} · {result.metadata.track || item.track}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="bg-slate-900 text-slate-400 font-mono text-xs uppercase">
              {result.headers.map((h) => (
                <th key={h} className="p-3 text-left whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60">
            {result.rows.map((row, idx) => (
              <tr key={`${row[0] ?? 'row'}-${idx}`} className="hover:bg-slate-700/40">
                {result.headers.map((_, col) => (
                  <td key={`${idx}-${col}`} className="p-3 text-slate-200 whitespace-nowrap">
                    {row[col] || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResultTable;
