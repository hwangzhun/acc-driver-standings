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
  /** 正赛名次（来自 finalRanking.position，schema 2.0 导入时有值） */
  finishPosition?: number;
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
}