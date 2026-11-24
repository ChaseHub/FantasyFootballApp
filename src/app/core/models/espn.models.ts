export type GameState = 'pre' | 'in' | 'post';

export interface NflTeamSide {
  id: string;
  abbr: string;
  normalizedAbbr: string;
  name: string;
  displayName: string;
  logo: string | null;
  record: string;
  score: number;
  winner: boolean;
  linescores: number[];
}

export interface NflSituation {
  downDistanceText: string | null;
  possessionText: string | null;
  possessionTeamId: string | null;
  yardLine: number | null;
  isRedZone: boolean;
  lastPlayText: string | null;
}

export interface NflGameCard {
  id: string;
  name: string;
  shortName: string;
  dateIso: string;
  kickoffLabel: string;
  venue: string | null;
  broadcast: string | null;
  state: GameState;
  statusDetail: string;
  period: number;
  clock: string;
  away: NflTeamSide;
  home: NflTeamSide;
  situation: NflSituation | null;
  oddsLine: string | null;
  overUnder: number | null;
}

export interface NflPlayParticipant {
  name: string;
  role: string;
}

export interface NflPlayItem {
  id: string;
  sequenceNumber: number;
  quarter: number;
  clock: string;
  teamId: string | null;
  teamAbbr: string;
  playType: string;
  downDistance: string;
  text: string;
  yards: number | null;
  isScoring: boolean;
  participants: NflPlayParticipant[];
}

export interface NflTimeSlate {
  id: string;
  label: string;
  sortTimeMs: number;
  games: NflGameCard[];
}

export interface NflScoringPlay {
  id: string;
  quarter: number;
  clock: string;
  teamAbbr: string;
  teamLogo: string | null;
  typeText: string;
  text: string;
  awayScore: number;
  homeScore: number;
}

export interface NflTeamStatRow {
  label: string;
  awayValue: string;
  homeValue: string;
}

export interface NflDriveSummary {
  teamAbbr: string;
  description: string;
  yards: number;
  playCount: number;
  plays: NflPlayItem[];
}

export interface NflGameLeader {
  category: string;
  playerName: string;
  teamAbbr: string;
  summary: string;
}

export interface NflGameDetail {
  eventId: string;
  finalized?: boolean;
  hasFullTimeline?: boolean;
  currentDrive: NflDriveSummary | null;
  scoringPlays: NflScoringPlay[];
  recentPlays: NflPlayItem[];
  allPlays: NflPlayItem[];
  teamStats: NflTeamStatRow[];
  leaders: NflGameLeader[];
}

export interface RawEspnScoreboard {
  events?: RawEspnEvent[];
}

export interface RawEspnEvent {
  id?: string;
  name?: string;
  shortName?: string;
  date?: string;
  competitions?: RawEspnCompetition[];
}

export interface RawEspnCompetition {
  venue?: { fullName?: string; address?: { city?: string; state?: string } };
  broadcasts?: Array<{ names?: string[] }>;
  competitors?: RawEspnCompetitor[];
  linescores?: Array<{ value?: number }>;
  status?: {
    clock?: number;
    displayClock?: string;
    period?: number;
    type?: { state?: GameState; shortDetail?: string; detail?: string };
  };
  situation?: {
    downDistanceText?: string;
    shortDownDistanceText?: string;
    possessionText?: string;
    possession?: string;
    yardLine?: number;
    isRedZone?: boolean;
    lastPlay?: { text?: string };
  };
  odds?: Array<{ details?: string; overUnder?: number }>;
}

export interface RawEspnCompetitor {
  id?: string;
  homeAway?: 'home' | 'away';
  winner?: boolean;
  score?: string;
  records?: Array<{ summary?: string; type?: string }>;
  linescores?: Array<{ value?: number }>;
  team?: {
    id?: string;
    abbreviation?: string;
    shortDisplayName?: string;
    displayName?: string;
    logo?: string;
  };
}

export interface RawEspnSummary {
  scoringPlays?: Array<{
    id?: string;
    period?: { number?: number };
    clock?: { displayValue?: string };
    team?: { id?: string; abbreviation?: string; logo?: string };
    type?: { text?: string };
    text?: string;
    awayScore?: number;
    homeScore?: number;
  }>;
  drives?: {
    current?: RawEspnDrive;
    previous?: RawEspnDrive[];
  };
  plays?: RawEspnPlay[];
  boxscore?: {
    teams?: Array<{
      team?: { id?: string; abbreviation?: string };
      statistics?: Array<{ name?: string; label?: string; displayValue?: string }>;
    }>;
  };
  leaders?: Array<{
    team?: { abbreviation?: string };
    leaders?: Array<{
      displayName?: string;
      name?: string;
      leaders?: Array<{
        displayValue?: string;
        athlete?: { displayName?: string; shortName?: string };
      }>;
    }>;
  }>;
}

export interface RawEspnDrive {
  description?: string;
  yards?: number;
  offensivePlays?: number;
  team?: { id?: string; abbreviation?: string };
  plays?: RawEspnPlay[];
}

export interface RawEspnPlay {
  id?: string;
  sequenceNumber?: string | number;
  type?: { text?: string };
  period?: { number?: number };
  clock?: { displayValue?: string };
  team?: { id?: string; abbreviation?: string };
  start?: { downDistanceText?: string; shortDownDistanceText?: string };
  text?: string;
  statYardage?: number;
  scoringPlay?: boolean;
  participants?: Array<{
    type?: string;
    athlete?: { displayName?: string; shortName?: string };
  }>;
}
