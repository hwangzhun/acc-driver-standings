export interface Driver {
  firstName: string;
  lastName: string;
  shortName: string;
  playerId: string;
}

export interface CarInfo {
  carId: number;
  raceNumber: number;
  carModel: number;
  cupCategory: number;
  carGroup: string;
  teamName: string;
  nationality: number;
  drivers: Driver[];
}

export interface Timing {
  lastLap: number;
  lastSplits: number[];
  bestLap: number;
  bestSplits: number[];
  totalTime: number;
  lapCount: number;
  lastSplitId: number;
}

export interface LeaderboardLine {
  car: CarInfo;
  currentDriver: Driver;
  currentDriverIndex: number;
  timing: Timing;
  missingMandatoryPitstop: number;
  driverTotalTimes: number[];
}

export interface Lap {
  carId: number;
  driverIndex: number;
  laptime: number;
  isValidForBest: boolean;
  splits: number[];
}

export interface Penalty {
  carId: number;
  driverIndex: number;
  reason: string;
  penalty: string;
  penaltyValue: number;
  violationInLap: number;
  clearedInLap: number;
}

export interface SessionResult {
  bestlap: number;
  bestSplits: number[];
  isWetSession: number;
  type: number;
  leaderBoardLines: LeaderboardLine[];
}

export interface AccResultData {
  sessionType: string;
  trackName: string;
  sessionIndex: number;
  raceWeekendIndex: number;
  metaData: string;
  serverName: string;
  exportedAt?: string;
  sessionResult: SessionResult;
  laps: Lap[];
  penalties?: Penalty[];
  post_race_penalties?: Penalty[];
}

export interface ResultIndexItem {
  id: string;
  title: string;
  track: string;
  sessionType: string;
  date: string;
  dataPath?: string;
  csvPath: string;
}

export interface ParsedResultCsv {
  metadataLine: string;
  metadata: {
    track?: string;
    session?: string;
  };
  headers: string[];
  rows: string[][];
}

// Map ACC Car Model IDs to human readable names
// 基于 car_model.list 映射表
export const CAR_MODELS: Record<number, string> = {
  0: '保时捷 991 GT3 R',
  1: '梅赛德斯-AMG GT3',
  2: '法拉利 488 GT3',
  3: '奥迪 R8 LMS',
  4: '兰博基尼 Huracan GT3',
  5: '迈凯伦 650S GT3',
  6: '日产 GT-R Nismo GT3 2018',
  7: '宝马 M6 GT3',
  8: '宾利 Continental GT3 2018',
  9: '保时捷 991II GT3 Cup',
  10: '日产 GT-R Nismo GT3 2017',
  11: '宾利 Continental GT3 2016',
  12: '阿斯顿·马丁 V12 Vantage GT3',
  13: '兰博基尼 Gallardo R-EX',
  14: '捷豹 G3',
  15: '雷克萨斯 RC F GT3',
  16: '兰博基尼 Huracan Evo (2019)',
  17: '本田 NSX GT3',
  18: '兰博基尼 Huracan SuperTrofeo',
  19: '奥迪 R8 LMS Evo (2019)',
  20: '阿斯顿·马丁 V8 Vantage (2019)',
  21: '本田 NSX Evo (2019)',
  22: '迈凯伦 720S GT3 (2019)',
  23: '保时捷 911II GT3 R (2019)',
  24: '法拉利 488 GT3 Evo 2020',
  25: '梅赛德斯-AMG GT3 2020',
  26: '法拉利 488 Challenge Evo',
  27: '宝马 M2 CS Racing',
  28: '保时捷 911 GT3 Cup (Type 992)',
  29: '兰博基尼 Huracán Super Trofeo EVO2',
  30: '宝马 M4 GT3',
  31: '奥迪 R8 LMS GT3 evo II',
  32: '法拉利 296 GT3',
  33: '兰博基尼 Huracan Evo2',
  34: '保时捷 992 GT3 R',
  35: '迈凯伦 720S GT3 Evo 2023',
  36: '福特 Mustang GT3',
  50: '阿尔卑斯 A110 GT4',
  51: '阿斯顿·马丁 V8 Vantage GT4',
  52: '奥迪 R8 LMS GT4',
  53: '宝马 M4 GT4',
  55: '雪佛兰 Camaro GT4',
  56: '吉内塔 G55 GT4',
  57: 'KTM X-Bow GT4',
  58: '玛莎拉蒂 MC GT4',
  59: '迈凯伦 570S GT4',
  60: '梅赛德斯-AMG GT4',
  61: '保时捷 718 Cayman GT4',
  80: '奥迪 R8 LMS GT2',
  82: 'KTM XBOW GT2',
  83: '玛莎拉蒂 MC20 GT2',
  84: '梅赛德斯 AMG GT2',
  85: '保时捷 911 GT2 RS CS Evo',
  86: '保时捷 935',
};

/** 与 CAR_MODELS 同步维护：表内这些车型 ID 为 GT4 */
const CAR_MODEL_IDS_GT4 = new Set<number>([50, 51, 52, 53, 55, 56, 57, 58, 59, 60, 61]);

/** 与 CAR_MODELS 同步维护：表内这些车型 ID 为 GT2 */
const CAR_MODEL_IDS_GT2 = new Set<number>([80, 82, 83, 84, 85, 86]);

export type CarPerformanceClass = 'GT2' | 'GT3' | 'GT4';

/** 排行榜组别筛选：全部 或 单一性能组 */
export type LeaderboardClassFilter = 'all' | CarPerformanceClass;

/**
 * 根据 carModel 推断 GT2 / GT3 / GT4，以本文件 CAR_MODELS 为准，不读 JSON 的 carGroup。
 * 新增车型：先补 CAR_MODELS，再把 ID 加入 GT2 或 GT4 集合（未列入则视为 GT3）。
 */
export function getCarClassByModelId(carModel: number): CarPerformanceClass | null {
  if (!(carModel in CAR_MODELS)) return null;
  if (CAR_MODEL_IDS_GT2.has(carModel)) return 'GT2';
  if (CAR_MODEL_IDS_GT4.has(carModel)) return 'GT4';
  return 'GT3';
}