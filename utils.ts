import {
  getCarClassByModelId,
  type AccResultData,
  type LeaderboardLine,
  type Penalty,
  type ParsedResultCsv,
  type ResultIndexItem,
} from './types';
import type { CosRaceObjectItem } from './services/cosClient';

/** 低于 1 秒的 penaltyValue（如 DriveThrough 导出 +0:00.001）不计入 JSON 罚时汇总，罚则条目仍保留展示。 */
export const JSON_TIME_PENALTY_SUM_MIN_MS = 1000;

/** PostRaceTime、none 等不参与罚时汇总、排行榜徽标、车号高亮与详情罚则列表 */
export function isIgnoredJsonPenaltyType(penalty: string): boolean {
  const key = penalty.trim();
  if (!key) return true;
  const lower = key.toLowerCase();
  if (lower === 'none') return true;
  if (lower === 'postracetime') return true;
  return false;
}

/**
 * 汇总 JSON 中该车非 DSQ 的时间罚（毫秒）；仅计入 penaltyValue >= 1s 的条目。
 */
export function sumJsonTimePenaltyMs(carId: number, penalties: Penalty[]): number {
  return penalties.reduce((acc, p) => {
    if (p.carId !== carId) return acc;
    if (p.penalty === 'Disqualified') return acc;
    if (isIgnoredJsonPenaltyType(p.penalty)) return acc;
    const v = p.penaltyValue;
    if (typeof v !== 'number' || v < JSON_TIME_PENALTY_SUM_MIN_MS) return acc;
    return acc + v;
  }, 0);
}

/** 是否存在任意手动罚时（用于正赛是否按含罚时重排名） */
export function hasAnyManualPenaltyMs(manualPenaltyMsByCarId: Record<number, number>): boolean {
  return Object.values(manualPenaltyMsByCarId).some((ms) => ms > 0);
}

/** 正赛：官方 totalTime + JSON 计入罚时 + 手动罚时；无效完赛或 DSQ 前勿用 null 参与排序比较 */
export function getRaceAdjustedFinishMs(
  line: LeaderboardLine,
  penalties: Penalty[],
  manualPenaltyMsByCarId: Record<number, number>
): number | null {
  const tt = line.timing.totalTime;
  if (!tt || tt === 2147483647) return null;
  const cid = line.car.carId;
  return tt + sumJsonTimePenaltyMs(cid, penalties) + Math.max(0, manualPenaltyMsByCarId[cid] ?? 0);
}

function isCarDisqualified(carId: number, penalties: Penalty[]): boolean {
  return penalties.some((p) => p.carId === carId && p.penalty === 'Disqualified');
}

/**
 * 与排行榜一致：正赛在存在任意手动罚时时，按含罚时完赛升序重排（DSQ 仍置后）；否则保持 JSON 顺序。
 */
export function sortLeaderboardLinesForDisplay(
  lines: LeaderboardLine[],
  sessionType: string,
  penalties: Penalty[],
  manualPenaltyMsByCarId: Record<number, number>
): LeaderboardLine[] {
  if (sessionType !== 'R') {
    return [...lines].sort((a, b) => a.timing.bestLap - b.timing.bestLap);
  }
  if (!hasAnyManualPenaltyMs(manualPenaltyMsByCarId)) {
    return [...lines];
  }

  const indexed = lines.map((line, origIndex) => ({ line, origIndex }));
  indexed.sort((A, B) => {
    const a = A.line;
    const b = B.line;
    const da = isCarDisqualified(a.car.carId, penalties);
    const db = isCarDisqualified(b.car.carId, penalties);
    if (da !== db) return da ? 1 : -1;

    const adjA = getRaceAdjustedFinishMs(a, penalties, manualPenaltyMsByCarId);
    const adjB = getRaceAdjustedFinishMs(b, penalties, manualPenaltyMsByCarId);

    if (!da) {
      if (adjA !== null && adjB !== null && adjA !== adjB) return adjA - adjB;
      if (adjA === null && adjB !== null) return 1;
      if (adjA !== null && adjB === null) return -1;
    }
    return A.origIndex - B.origIndex;
  });

  return indexed.map((x) => x.line);
}

/**
 * 排行榜/徽标用：由 JSON 完整 penalty 字段生成短标签。
 * DriveThrough → DT；StopAndGo_30 → SG30（从完整字符串解析秒数）；其余类型原样返回。
 */
export function formatPenaltyTypeLabel(penalty: string): string {
  if (penalty === 'DriveThrough') return 'DT';
  const sg = /^StopAndGo_(\d+)$/i.exec(penalty);
  if (sg) return `SG${sg[1]}`;
  if (penalty === 'StopAndGo') return 'SG';
  return penalty;
}

/** 该车在会话中的非 DSQ 罚则（用于高亮与排名格展示），标签已去重且保持首次出现顺序 */
export function getCarSessionPenaltyBadgeLabels(carId: number, penalties: Penalty[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const p of penalties) {
    if (p.carId !== carId) continue;
    if (p.penalty === 'Disqualified') continue;
    if (isIgnoredJsonPenaltyType(p.penalty)) continue;
    const label = formatPenaltyTypeLabel(p.penalty);
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

/** 是否存在至少一条非 DSQ 的 JSON 罚则（含 DriveThrough 等） */
export function carHasNonDsqJsonPenalties(carId: number, penalties: Penalty[]): boolean {
  return penalties.some(
    (p) =>
      p.carId === carId &&
      p.penalty !== 'Disqualified' &&
      !isIgnoredJsonPenaltyType(p.penalty)
  );
}

/** 罚时展示：无罚时为 —，否则为 +m:ss.SSS（与圈速风格一致） */
export function formatPenaltyDelta(ms: number): string {
  if (!ms || ms <= 0) return '—';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `+${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Formats milliseconds into m:ss.SSS
 * e.g., 138217 -> 2:18.217
 */
export const formatTime = (ms: number): string => {
  if (ms === 2147483647 || !ms) return "-:--.---";
  
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
};

/**
 * Formats milliseconds into a short string for charts (e.g. 2:18.2)
 */
export const formatTimeShort = (ms: number): string => {
    if (!ms || ms > 1000000) return "";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor((ms % 1000) / 100); 
  
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds}`;
};

/**
 * Calculates the gap between two times in format +s.SSS
 */
export const formatGap = (currentMs: number, leaderMs: number): string => {
    if(currentMs === leaderMs) return "-";
    if(currentMs === 2147483647 || !currentMs || !leaderMs) return "";
    
    const diff = currentMs - leaderMs;
    const seconds = Math.floor(diff / 1000);
    const milliseconds = diff % 1000;
    
    return `+${seconds}.${milliseconds.toString().padStart(3, '0')}`;
}

export const getSectorColor = (sectorTime: number, bestSectorTime: number, sessionBestSectorTime: number) => {
    if (sectorTime <= sessionBestSectorTime) return "text-purple-400 font-bold";
    if (sectorTime <= bestSectorTime) return "text-green-400 font-bold";
    return "text-slate-300";
}

/**
 * ACC 部分结果 JSON 为 UTF-16 LE（无 BOM 或带 FF FE），按 UTF-8 读取会导致 JSON.parse 失败。
 */
export function decodeAccResultFileText(arrayBuffer: ArrayBuffer): string {
  const u8 = new Uint8Array(arrayBuffer);
  if (u8.length === 0) return '';

  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(arrayBuffer.slice(3));
  }
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(arrayBuffer.slice(2));
  }
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(arrayBuffer.slice(2));
  }
  if (u8.length >= 4 && u8[0] === 0x7b && u8[1] === 0x00) {
    return new TextDecoder('utf-16le').decode(arrayBuffer);
  }
  if (u8.length >= 4 && u8[0] === 0x00 && u8[1] === 0x7b) {
    return new TextDecoder('utf-16be').decode(arrayBuffer);
  }
  return new TextDecoder('utf-8').decode(arrayBuffer);
}

/** 去掉 UTF-8 BOM、首尾空白，避免合法 JSON 因 BOM 导致 parse 失败 */
export function normalizeJsonText(raw: string): string {
  return raw.replace(/^\uFEFF/, '').trim();
}

function isAccResultDataLike(obj: unknown): obj is AccResultData {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  const sr = o.sessionResult;
  if (!sr || typeof sr !== 'object') return false;
  return Array.isArray((sr as Record<string, unknown>).leaderBoardLines);
}

/**
 * 解析成绩 JSON：支持原生 ACC 结果，或带 rawData 的分析导出包（如 schemaVersion 2.0）。
 */
export function parseAccResultsPayload(buf: ArrayBuffer): AccResultData {
  const text = normalizeJsonText(decodeAccResultFileText(buf));
  if (!text) {
    throw new Error('EMPTY_FILE');
  }
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('INVALID_JSON');
  }
  const root = parsed as Record<string, unknown>;
  if (root.rawData !== undefined && isAccResultDataLike(root.rawData)) {
    const raw = root.rawData as AccResultData;
    const exportedAt = typeof root.exportedAt === 'string' ? root.exportedAt : undefined;
    return exportedAt ? { ...raw, exportedAt } : raw;
  }
  if (isAccResultDataLike(parsed)) {
    const data = parsed as AccResultData;
    const exportedAt =
      typeof (root as Record<string, unknown>).exportedAt === 'string'
        ? ((root as Record<string, unknown>).exportedAt as string)
        : undefined;
    return exportedAt ? { ...data, exportedAt } : data;
  }
  throw new Error('UNSUPPORTED_RESULT_JSON');
}

export function parseAccResultArrayBuffer(buf: ArrayBuffer): AccResultData {
  return parseAccResultsPayload(buf);
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (r instanceof ArrayBuffer) resolve(r);
      else reject(new Error('READ_FAILED'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('READ_FAILED'));
    reader.readAsArrayBuffer(file);
  });
}

/** 读取本地 .json（含 UTF-16 LE 等）并解析为 ACC 结果对象 */
export async function readAccResultJsonFile(file: File): Promise<AccResultData> {
  const buf = await readFileAsArrayBuffer(file);
  return parseAccResultsPayload(buf);
}

/**
 * 对相对路径做 encodeURI；完整 http(s) URL（尤其 COS 签名 URL）必须原样使用。
 * encodeURI 会把查询串里的 `%` 编成 `%25`，会破坏签名并导致返回 HTML 错误页。
 */
function resolveFetchUrl(pathOrUrl: string | undefined | null): string {
  const s = String(pathOrUrl ?? '').trim();
  if (!s) {
    throw new Error('FETCH_URL_EMPTY:缺少成绩文件路径');
  }
  if (/^https?:\/\//i.test(s)) return s;
  return encodeURI(s);
}

/** 通过网络加载成绩 JSON（路径可为原生 ACC 或带 rawData 的导出包） */
export async function fetchAccResultJson(jsonPath: string | undefined | null): Promise<AccResultData> {
  const resp = await fetch(resolveFetchUrl(jsonPath), { cache: 'no-store' });
  if (!resp.ok) {
    throw new Error(`JSON_FETCH_FAILED:${resp.status}`);
  }
  const buf = await resp.arrayBuffer();
  const head = new TextDecoder().decode(buf.byteLength > 200 ? buf.slice(0, 200) : buf);
  if (head.trimStart().startsWith('<')) {
    throw new Error(
      'JSON_FETCH_HTML:响应为HTML而非JSON（多为签名URL被破坏；请勿对完整COS签名链接再encode）'
    );
  }
  return parseAccResultsPayload(buf);
}

export function dragEventHasFiles(e: { dataTransfer: DataTransfer | null }): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

export function alertAccResultFileError(err: unknown): void {
  console.error('ACC result file error', err);
  const detail = err instanceof Error ? err.message : String(err);
  if (detail === 'EMPTY_FILE') {
    alert('文件为空，请选择有效的 ACC 结果 JSON。');
    return;
  }
  if (detail === 'READ_FAILED') {
    alert('读取文件失败，请重试或检查文件是否被其他程序占用。');
    return;
  }
  if (detail === 'UNSUPPORTED_RESULT_JSON') {
    alert('无法识别该 JSON：需要 ACC 原始结果文件，或带 rawData 的分析导出包。');
    return;
  }
  alert(
    `解析 JSON 失败（不是合法 JSON 语法）。\n\n常见原因：选错文件、文件损坏；若用记事本「另存为 Unicode」保存过，多为 UTF-16，本应用已尝试自动识别。\n\n请尽量使用服务器生成的原始 *_R.json 等文件。\n\n技术详情：${detail}`
  );
}

/** UI 标签样式（组别来自 getCarClassByModelId，与 JSON carGroup 无关） */
export function carClassBadgeClass(cls: string | null | undefined): string {
  if (!cls) return 'bg-slate-800 text-slate-400 border-slate-600';
  const g = cls.trim().toUpperCase();
  if (g === 'GT3') return 'bg-red-950/60 text-red-300 border-red-800/60';
  if (g === 'GT4') return 'bg-amber-950/50 text-amber-200 border-amber-800/50';
  if (g === 'GT2') return 'bg-blue-950/50 text-blue-200 border-blue-800/50';
  return 'bg-slate-800 text-slate-400 border-slate-600';
}

/**
 * 导出排行榜数据为 CSV 格式
 */
export const exportLeaderboardToCSV = (
    lines: any[],
    sessionType: string,
    penalties: Penalty[] = [],
    trackName: string = '',
    sessionName: string = '',
    carModels: Record<number, string> = {},
    manualPenaltyMsByCarId: Record<number, number> = {}
) => {
    const sortedLines = sortLeaderboardLinesForDisplay(
        lines,
        sessionType,
        penalties,
        manualPenaltyMsByCarId
    );

    const isDisqualified = (carId: number): boolean => {
        return penalties.some(p => p.carId === carId && p.penalty === 'Disqualified');
    };

    const getDSQReason = (carId: number): string | null => {
        const dsqPenalty = penalties.find(p => p.carId === carId && p.penalty === 'Disqualified');
        return dsqPenalty?.reason || null;
    };

    const isRace = sessionType === 'R';
    const anyManual = hasAnyManualPenaltyMs(manualPenaltyMsByCarId);
    const leaderLine =
        sortedLines.find((l) => !isDisqualified(l.car.carId)) ?? sortedLines[0];
    const referenceOfficialRace = leaderLine?.timing.totalTime ?? 0;
    const referenceBest = leaderLine?.timing.bestLap ?? 0;
    const referenceAdjusted =
        isRace && anyManual && leaderLine && !isDisqualified(leaderLine.car.carId)
            ? getRaceAdjustedFinishMs(leaderLine, penalties, manualPenaltyMsByCarId)
            : null;

    // CSV 表头
    const headers = [
        '排名',
        '车号',
        '主车手',
        '其他车手',
        '车型',
        '组别',
        sessionType === 'R' ? '完赛时间' : '最快圈',
        '差距',
        'JSON罚时(ms)',
        '手动罚时(ms)',
        '罚时合计(ms)',
        ...(isRace ? [anyManual ? '含罚时完赛' : '含罚时完赛(参考)'] : []),
        '圈数',
        '状态',
        '取消资格原因'
    ];

    // 构建 CSV 数据行
    const rows = sortedLines.map((line, index) => {
        const isDSQ = isDisqualified(line.car.carId);
        const dsqReason = getDSQReason(line.car.carId);
        const driverName = `${line.currentDriver.firstName} ${line.currentDriver.lastName}`.trim() || line.currentDriver.shortName;
        const otherDrivers = line.car.drivers
            .filter((d: any) => d.playerId !== line.currentDriver.playerId)
            .map((d: any) => `${d.firstName} ${d.lastName}`.trim() || d.shortName)
            .join(', ');
        const carName = carModels[line.car.carModel] || `车型 ${line.car.carModel}`;
        
        const timeValue = sessionType === 'R' ? line.timing.totalTime : line.timing.bestLap;
        let gap: string;
        if (isDSQ) {
            gap = '-';
        } else if (isRace && anyManual) {
            const curAdj = getRaceAdjustedFinishMs(line, penalties, manualPenaltyMsByCarId);
            if (curAdj != null && referenceAdjusted != null) {
                gap = formatGap(curAdj, referenceAdjusted);
            } else {
                gap = formatGap(timeValue, referenceOfficialRace);
            }
        } else {
            gap = formatGap(timeValue, isRace ? referenceOfficialRace : referenceBest);
        }
        const timeStr = formatTime(timeValue);
        const rank = isDSQ ? 'DSQ' : (index + 1).toString();
        const status = isDSQ ? '取消资格' : (index === 0 ? '冠军' : '');

        const cid = line.car.carId;
        const jsonPenaltyMs = sumJsonTimePenaltyMs(cid, penalties);
        const manualMs = Math.max(0, manualPenaltyMsByCarId[cid] ?? 0);
        const totalPenaltyMs = jsonPenaltyMs + manualMs;
        const totalTimeRaw = line.timing.totalTime;
        const withPenaltyStr =
            isRace && !isDSQ && totalTimeRaw && totalTimeRaw !== 2147483647
                ? formatTime(totalTimeRaw + totalPenaltyMs)
                : '-';

        return [
            rank,
            line.car.raceNumber.toString(),
            driverName,
            otherDrivers || '-',
            carName,
            getCarClassByModelId(line.car.carModel) ?? '-',
            timeStr,
            gap,
            String(jsonPenaltyMs),
            String(manualMs),
            String(totalPenaltyMs),
            ...(isRace ? [withPenaltyStr] : []),
            line.timing.lapCount.toString(),
            status,
            dsqReason || '-'
        ];
    });

    // 构建完整的 CSV 内容
    const csvContent = [
        // 元数据行（可选）
        ...(trackName || sessionName ? [`赛道: ${trackName || ''}, 会话: ${sessionName || ''}`] : []),
        // 表头
        headers.join(','),
        // 数据行
        ...rows.map(row => row.map(cell => {
            // 处理包含逗号、引号或换行符的单元格
            const cellStr = String(cell || '');
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
        }).join(','))
    ].join('\n');

    // 添加 BOM 以支持中文 Excel 正确显示
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // 生成文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const sessionTypeName = sessionType === 'R' ? '正赛' : sessionType === 'Q' ? '排位' : '练习';
    link.download = `排行榜_${trackName || '未知赛道'}_${sessionTypeName}_${timestamp}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  values.push(current);
  return values;
}

function stripUtf8Bom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

function guessSessionTypeFromName(name: string): string {
  const upper = name.toUpperCase();
  if (/-R-/.test(upper) || /_R\./.test(upper)) return '正赛';
  if (/-Q-/.test(upper) || /_Q\./.test(upper)) return '排位';
  if (/-P-/.test(upper) || /_P\./.test(upper)) return '练习';
  return '未知';
}

function guessTrackFromName(name: string): string {
  const m = /-([a-z0-9_]+)-(?:r|q|p)-\d{4}-\d{2}-\d{2}/i.exec(name);
  if (m?.[1]) return m[1].replace(/_/g, '-');
  return 'unknown';
}

function normalizeDateLabel(raw?: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 把 COS 对象列表映射为前端结果索引结构，兼容旧字段 csvPath。
 */
export function mapCosObjectsToResultIndex(items: CosRaceObjectItem[]): ResultIndexItem[] {
  return [...items]
    .sort((a, b) => {
      const ta = new Date(a.lastModified).getTime() || 0;
      const tb = new Date(b.lastModified).getTime() || 0;
      return tb - ta;
    })
    .map((item) => {
      const fileName = item.key.split('/').pop() || item.key;
      const title = fileName.replace(/\.json$/i, '');
      return {
        id: item.key,
        title,
        track: guessTrackFromName(fileName),
        sessionType: guessSessionTypeFromName(fileName),
        date: normalizeDateLabel(item.lastModified),
        dataPath: item.key,
        csvPath: item.key,
      };
    });
}

/** 本地静态索引读取（`VITE_RESULTS_SOURCE=static` 使用） */
export async function fetchResultsIndex(): Promise<ResultIndexItem[]> {
  const resp = await fetch('/results-index.json', { cache: 'no-store' });
  if (!resp.ok) {
    throw new Error(`INDEX_FETCH_FAILED:${resp.status}`);
  }
  const data = (await resp.json()) as ResultIndexItem[];
  return Array.isArray(data) ? data : [];
}

/** 读取成绩 CSV 文本 */
export async function fetchCsvText(csvPath: string): Promise<string> {
  const resp = await fetch(resolveFetchUrl(csvPath), { cache: 'no-store' });
  if (!resp.ok) {
    throw new Error(`CSV_FETCH_FAILED:${resp.status}`);
  }
  const text = await resp.text();
  return stripUtf8Bom(text);
}

/** 解析成绩 CSV（支持首行元信息、引号转义、空值） */
export function parseResultCsv(text: string): ParsedResultCsv {
  const normalized = stripUtf8Bom(text).replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { metadataLine: '', metadata: {}, headers: [], rows: [] };
  }

  let metadataLine = '';
  let headerLineIndex = 0;
  if (!lines[0].startsWith('排名,')) {
    metadataLine = lines[0];
    headerLineIndex = 1;
  }
  if (headerLineIndex >= lines.length) {
    return { metadataLine, metadata: {}, headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[headerLineIndex]);
  const rows = lines.slice(headerLineIndex + 1).map(parseCsvLine);

  const metadata: { track?: string; session?: string } = {};
  const metaMatch = /^赛道:\s*([^,]+),\s*会话:\s*(.+)$/.exec(metadataLine);
  if (metaMatch) {
    metadata.track = metaMatch[1].trim();
    metadata.session = metaMatch[2].trim();
  }

  const normalizedRows = rows.map((r) => {
    if (r.length >= headers.length) return r;
    return [...r, ...Array.from({ length: headers.length - r.length }, () => '')];
  });

  return {
    metadataLine,
    metadata,
    headers,
    rows: normalizedRows,
  };
}
