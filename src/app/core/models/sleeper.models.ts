export interface SleeperNflState {
  season: string;
  season_type: string;
  week: number;
  display_week: number;
  leg: number;
}

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: 'pre_draft' | 'drafting' | 'in_season' | 'complete' | string;
  sport: string;
  total_rosters: number;
  avatar: string | null;
  previous_league_id?: string | null;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: {
    playoff_week_start?: number;
    num_teams?: number;
    playoff_teams?: number;
    leg?: number;
    last_scored_leg?: number;
    waiver_budget?: number;
    waiver_type?: number;
    [key: string]: number | undefined;
  };
}

export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  is_owner?: boolean;
  metadata?: {
    team_name?: string;
    avatar?: string;
    [key: string]: string | undefined;
  };
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners?: string[] | null;
  players: string[] | null;
  starters: string[] | null;
  reserve?: string[] | null;
  taxi?: string[] | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
    ppts?: number;
    ppts_decimal?: number;
    waiver_position?: number;
    waiver_budget_used?: number;
    total_moves?: number;
    [key: string]: number | undefined;
  };
  metadata?: {
    streak?: string;
    record?: string;
    [key: string]: string | undefined;
  };
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  starters: string[] | null;
  starters_points?: number[];
  players: string[] | null;
  players_points?: Record<string, number>;
  custom_points?: number | null;
}

export interface SleeperTradedPick {
  season: string;
  round: number;
  roster_id: number;
  previous_owner_id: number;
  owner_id: number;
}

export interface SleeperBracketMatchup {
  r: number;
  m: number;
  t1: number | null;
  t2: number | null;
  t1_from?: { w?: number; l?: number } | null;
  t2_from?: { w?: number; l?: number } | null;
  w?: number | null;
  l?: number | null;
  p?: number | null;
}

export interface SleeperDraft {
  draft_id: string;
  league_id: string;
  type: 'snake' | 'linear' | 'auction' | string;
  status: 'pre_draft' | 'drafting' | 'complete' | string;
  season: string;
  start_time?: number;
  draft_order?: Record<string, number> | null;
  slot_to_roster_id?: Record<string, number> | null;
  settings: {
    rounds: number;
    teams: number;
    pick_timer?: number;
    budget?: number;
    [key: string]: number | undefined;
  };
}

export interface SleeperDraftPick {
  round: number;
  roster_id: number;
  player_id: string;
  picked_by: string;
  pick_no: number;
  draft_slot: number;
  is_keeper?: boolean | null;
  metadata?: {
    first_name?: string;
    last_name?: string;
    position?: string;
    team?: string;
    amount?: string;
    [key: string]: string | undefined;
  };
}

export interface SleeperWaiverTransfer {
  sender: number;
  receiver: number;
  amount: number;
}

export interface SleeperTransaction {
  transaction_id: string;
  type: 'trade' | 'waiver' | 'free_agent' | string;
  status: string;
  leg: number;
  created: number;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draft_picks?: SleeperTradedPick[];
  waiver_budget?: SleeperWaiverTransfer[];
  settings?: {
    waiver_bid?: number;
    [key: string]: number | undefined;
  } | null;
}

export interface PlayerMeta {
  id: string;
  name: string;
  position: string;
  nflTeam: string;
  injuryStatus: string | null;
  age?: number | null;
  yearsExp?: number | null;
  jersey?: number | null;
  college?: string | null;
  depthOrder?: number | null;
  injuryBodyPart?: string | null;
}

export interface WeeklyLineupEntry {
  playerId: string;
  slotLabel: string;
  name: string;
  position: string;
  nflTeam: string;
  injuryStatus: string | null;
  points: number;
  projectedPoints: number | null;
  isOnBye: boolean;
  isStarter: boolean;
}

export interface RosterPlayerStat {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string;
  injuryStatus: string | null;
  role: 'starter' | 'bench' | 'ir';
  seasonPoints: number;
  avgPoints: number;
  gamesPlayed: number;
  lastWeekPoints: number | null;
}

export interface LeaguePlayerRow {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string;
  injuryStatus: string | null;
  fantasyTeamName: string | null;
  fantasyRosterId: number | null;
  gamesPlayed: number;
  seasonPoints: number;
  avgPoints: number;
  weeklyPoints: Array<{ week: number; points: number }>;
}

export interface TeamWeeklyScore {
  week: number;
  points: number;
  opponentPoints: number | null;
  opponentName: string | null;
  opponentRosterId: number | null;
  leagueAverage: number;
  leagueRankThatWeek: number;
  leagueSizeThatWeek: number;
  result: 'W' | 'L' | 'T' | 'BYE';
  margin: number;
  benchPoints: number;
  starterIds: string[];
  playerPoints: Record<string, number>;
}

export interface TeamSummary {
  rosterId: number;
  ownerId: string | null;
  managerName: string;
  teamName: string;
  avatarUrl: string | null;
  initials: string;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  recordLabel: string;
  pointsFor: number;
  pointsAgainst: number;
  maxPointsFor: number;
  lineupEfficiencyPct: number;
  pointDifferential: number;
  streak: string;
  allPlayWins: number;
  allPlayLosses: number;
  luckScore: number;
  powerScore: number;
  standingsRank: number;
  powerRank: number;
  pointsRank: number;
  waiverMoves: number;
  usesFaab: boolean;
  faabRemaining: number;
  waiverPriority: number;
  rosterSize: number;
  starterCount: number;
  medianScore: number;
  stdDevScore: number;
  boomWeeks: number;
  benchPointsTotal: number;
  closeWins: number;
  closeLosses: number;
  rawPlayerIds: string[];
  rawStarterIds: string[];
  rawReserveIds: string[];
  weeklyScores: TeamWeeklyScore[];
  bestWeek: TeamWeeklyScore | null;
  worstWeek: TeamWeeklyScore | null;
}

export type MatchupStatus = 'Live' | 'Final' | 'Upcoming' | 'Bye';

export interface WeeklyMatchupSide {
  rosterId: number;
  teamName: string;
  managerName: string;
  avatarUrl: string | null;
  initials: string;
  recordLabel: string;
  points: number;
  isWinner: boolean;
  starterIds: string[];
  playerPoints: Record<string, number>;
}

export interface WeeklyMatchupCard {
  matchupId: number;
  week: number;
  status: MatchupStatus;
  isCompleted: boolean;
  home: WeeklyMatchupSide;
  away: WeeklyMatchupSide | null;
  margin: number;
}

export interface LeaguePulseInsight {
  id: string;
  label: string;
  stat: string;
  context: string;
  teamName: string;
  rosterId: number;
}

export interface SeasonOption {
  leagueId: string;
  season: string;
  name: string;
}

export interface TradeReceivedPlayer {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string;
  seasonPoints: number;
}

export interface TradeReceivedPick {
  season: string;
  round: number;
  originalTeamName: string;
}

export interface TradeSideSummary {
  rosterId: number;
  teamName: string;
  managerName: string;
  avatarUrl: string | null;
  initials: string;
  playersReceived: TradeReceivedPlayer[];
  picksReceived: TradeReceivedPick[];
  faabReceived: number;
}

export interface LeagueTradeCard {
  transactionId: string;
  week: number;
  createdAt: number;
  dateLabel: string;
  sides: TradeSideSummary[];
}

export interface LeagueMoveItem {
  transactionId: string;
  type: 'waiver' | 'free_agent';
  week: number;
  dateLabel: string;
  rosterId: number;
  teamName: string;
  addedPlayers: TradeReceivedPlayer[];
  droppedPlayers: TradeReceivedPlayer[];
  waiverBid: number | null;
}

export interface TradedPickView {
  season: string;
  round: number;
  originalOwnerName: string;
  currentOwnerName: string;
  currentOwnerRosterId: number;
}

export interface ScheduleSwapCell {
  scheduleOwnerId: number;
  scheduleOwnerName: string;
  wins: number;
  losses: number;
  ties: number;
  winDelta: number;
  isActual: boolean;
}

export interface TeamScheduleSwapRow {
  teamRosterId: number;
  teamName: string;
  actualWins: number;
  actualLosses: number;
  bestScenario: ScheduleSwapCell;
  worstScenario: ScheduleSwapCell;
  cells: ScheduleSwapCell[];
}

export interface WeirdWeeklyMoment {
  id: string;
  kind: 'robbery' | 'heist' | 'shootout' | 'snoozer';
  title: string;
  week: number;
  headline: string;
  detail: string;
  rosterId: number;
}

export interface LeagueAward {
  id: string;
  badge: string;
  title: string;
  teamName: string;
  rosterId: number;
  stat: string;
  explanation: string;
}

export interface DraftPickView {
  pickNo: number;
  round: number;
  draftSlot: number;
  pickLabel: string;
  rosterId: number;
  teamName: string;
  managerName: string;
  playerId: string;
  playerName: string;
  position: string;
  nflTeam: string;
  isKeeper: boolean;
  auctionAmount: number | null;
  seasonPoints: number;
}

export interface BracketSideView {
  rosterId: number | null;
  teamName: string;
  seed: number | null;
  score: number | null;
  isWinner: boolean;
  placeholder: string;
}

export interface BracketMatchupView {
  matchId: number;
  round: number;
  week: number | null;
  placeGame: number | null;
  label: string;
  top: BracketSideView;
  bottom: BracketSideView;
}

export interface BracketRoundView {
  round: number;
  title: string;
  week: number | null;
  matchups: BracketMatchupView[];
}

export interface RawSleeperStatRow {
  player_id?: string;
  team?: string | null;
  opponent?: string | null;
  pts_ppr?: number;
  pts_half_ppr?: number;
  pts_std?: number;
  stats?: Record<string, number>;
}

export interface LeagueDashboardData {
  league: SleeperLeague;
  nflState: SleeperNflState;
  currentWeek: number;
  completedWeek: number;
  teams: TeamSummary[];
  weeklyMatchups: Record<number, WeeklyMatchupCard[]>;
  weeklyLeagueAverages: Array<{ week: number; average: number; high: number }>;
  pulseInsights: LeaguePulseInsight[];
  seasons: SeasonOption[];
  transactions: SleeperTransaction[];
  tradedPicks: SleeperTradedPick[];
  winnersBracket: SleeperBracketMatchup[];
  losersBracket: SleeperBracketMatchup[];
  draft: SleeperDraft | null;
  draftPicks: SleeperDraftPick[];
  loadedAtIso: string;
  loadedAtTime: string;
}
