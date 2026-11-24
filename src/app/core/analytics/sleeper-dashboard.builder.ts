import {
  LeagueDashboardData,
  LeagueMoveItem,
  LeaguePlayerRow,
  LeaguePulseInsight,
  LeagueTradeCard,
  MatchupStatus,
  PlayerMeta,
  RawSleeperStatRow,
  RosterPlayerStat,
  SeasonOption,
  SleeperBracketMatchup,
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperNflState,
  SleeperRoster,
  SleeperTradedPick,
  SleeperTransaction,
  TeamSummary,
  TeamWeeklyScore,
  TradedPickView,
  TradeReceivedPick,
  TradeReceivedPlayer,
  TradeSideSummary,
  WeeklyLineupEntry,
  WeeklyMatchupCard,
  WeeklyMatchupSide,
} from '../models/sleeper.models';

const SLEEPER_AVATAR_BASE = 'https://sleepercdn.com/avatars/thumbs';

export const NFL_TEAMS = new Set([
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
]);

export const POSITION_ORDER: Record<string, number> = {
  QB: 1,
  RB: 2,
  WR: 3,
  TE: 4,
  FLX: 5,
  SFLX: 5,
  RFLX: 5,
  K: 6,
  DEF: 7,
};

export interface SeasonStatEntry {
  seasonPoints: number;
  gamesPlayed: number;
  avgPoints: number;
}

export interface RosterMetaInfo {
  teamName: string;
  managerName: string;
  avatarUrl: string | null;
  initials: string;
  recordLabel: string;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatLoadedAtTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function resolveWeekCount(league: SleeperLeague, nflState: SleeperNflState): number {
  const scoredLeg = league.settings?.last_scored_leg ?? league.settings?.leg ?? 0;
  if (league.status === 'complete') {
    return Math.min(Math.max(scoredLeg || 17, 1), 18);
  }
  if (league.season === nflState.season) {
    const candidate = Math.max(scoredLeg, nflState.display_week || nflState.week || 1);
    return Math.min(Math.max(candidate, 1), 18);
  }
  return Math.min(Math.max(scoredLeg || 17, 1), 18);
}

export function isWeekCompleted(
  league: SleeperLeague,
  nflState: SleeperNflState,
  week: number,
  entries: SleeperMatchup[],
): boolean {
  const anyPoints = entries.some((e) => (e.custom_points ?? e.points ?? 0) > 0);
  if (!anyPoints) return false;

  if (league.status === 'complete' || league.season !== nflState.season) {
    return true;
  }

  const lastScoredLeg = league.settings?.last_scored_leg ?? 0;
  if (lastScoredLeg > 0) {
    return week <= lastScoredLeg;
  }

  return week < (nflState.week || 1);
}

export function resolveMatchupStatus(entries: SleeperMatchup[], isCompleted: boolean): MatchupStatus {
  if (isCompleted) return 'Final';
  const anyPoints = entries.some((e) => (e.custom_points ?? e.points ?? 0) > 0);
  return anyPoints ? 'Live' : 'Upcoming';
}

export function scoreProjectionRow(
  row: RawSleeperStatRow,
  scoring: Record<string, number>,
  recWeight: number,
  resolvePlayerPos: (playerId: string) => string,
): number | null {
  const stats = row.stats;
  const precomputed =
    recWeight >= 1
      ? (stats?.['pts_ppr'] ?? row.pts_ppr)
      : recWeight >= 0.5
        ? (stats?.['pts_half_ppr'] ?? row.pts_half_ppr)
        : (stats?.['pts_std'] ?? row.pts_std);

  const isDefOrK = row.player_id
    ? /^[A-Z]{2,3}$/.test(row.player_id) || ['K', 'DEF'].includes(resolvePlayerPos(row.player_id))
    : false;

  if (isDefOrK && typeof precomputed === 'number') {
    return round2(precomputed);
  }

  if (stats && Object.keys(scoring).length > 0) {
    let sum = 0;
    let usedStat = false;
    for (const [statKey, weight] of Object.entries(scoring)) {
      const statVal = stats[statKey];
      if (typeof statVal === 'number' && typeof weight === 'number') {
        sum += statVal * weight;
        usedStat = true;
      }
    }
    if (usedStat && (sum > 0 || typeof precomputed !== 'number')) {
      return round2(sum);
    }
  }

  return typeof precomputed === 'number' ? round2(precomputed) : null;
}

export function parseWeekProjectionsMap(
  raw: RawSleeperStatRow[] | Record<string, RawSleeperStatRow>,
  scoring: Record<string, number>,
  resolvePlayerPos: (playerId: string) => string,
): { projections: Record<string, number>; activeNflTeams: Set<string> } {
  const recWeight = scoring['rec'] ?? 1;
  const projections: Record<string, number> = {};
  const activeNflTeams = new Set<string>();

  const entries: Array<[string, RawSleeperStatRow]> = Array.isArray(raw)
    ? raw
        .filter(
          (row): row is RawSleeperStatRow & { player_id: string } =>
            Boolean(row && typeof row.player_id === 'string'),
        )
        .map((row) => [row.player_id, row])
    : Object.entries(raw);

  const hasOpponentField = entries.some(([, r]) => r.opponent !== undefined);

  for (const [playerId, row] of entries) {
    const pts = scoreProjectionRow(row, scoring, recWeight, resolvePlayerPos);
    if (pts !== null) {
      projections[playerId] = pts;
    }
    const teamCode = row.team?.toUpperCase();
    if (teamCode && NFL_TEAMS.has(teamCode)) {
      const isPlaying = hasOpponentField ? Boolean(row.opponent) : (pts ?? 0) > 0;
      if (isPlaying) {
        activeNflTeams.add(teamCode);
      }
    }
  }

  return { projections, activeNflTeams };
}

export function parseSeasonNflStatsMap(
  raw: RawSleeperStatRow[] | Record<string, RawSleeperStatRow | Record<string, number>>,
  scoring: Record<string, number>,
  resolvePlayerPos: (playerId: string) => string,
): Record<string, SeasonStatEntry> {
  const recWeight = scoring['rec'] ?? 1;
  const mapped: Record<string, SeasonStatEntry> = {};

  const pairs: Array<[string, Record<string, unknown>]> = Array.isArray(raw)
    ? raw
        .filter(
          (r): r is RawSleeperStatRow & { player_id: string } =>
            Boolean(r && typeof r.player_id === 'string'),
        )
        .map((r) => [r.player_id, r as unknown as Record<string, unknown>])
    : Object.entries(raw).map(([id, val]) => [id, (val ?? {}) as Record<string, unknown>]);

  for (const [playerId, rawObj] of pairs) {
    if (!rawObj || typeof rawObj !== 'object') continue;
    const nestedStats =
      rawObj['stats'] && typeof rawObj['stats'] === 'object'
        ? (rawObj['stats'] as Record<string, number>)
        : (rawObj as Record<string, number>);

    const gpRaw = nestedStats['gp'];
    const gamesPlayed = typeof gpRaw === 'number' && gpRaw > 0 ? Math.round(gpRaw) : 0;
    const isKickerOrDef =
      /^[A-Z]{2,3}$/.test(playerId) ||
      nestedStats['fgm'] !== undefined ||
      nestedStats['fga'] !== undefined ||
      nestedStats['xpm'] !== undefined ||
      nestedStats['pts_allow'] !== undefined;

    const precomputed =
      recWeight >= 1
        ? nestedStats['pts_ppr']
        : recWeight >= 0.5
          ? nestedStats['pts_half_ppr']
          : nestedStats['pts_std'];

    const pts =
      isKickerOrDef && typeof precomputed === 'number'
        ? round2(precomputed)
        : scoreProjectionRow(
            {
              player_id: playerId,
              stats: nestedStats,
              pts_ppr: nestedStats['pts_ppr'],
              pts_half_ppr: nestedStats['pts_half_ppr'],
              pts_std: nestedStats['pts_std'],
            },
            scoring,
            recWeight,
            resolvePlayerPos,
          );

    if (pts === null || (pts === 0 && gamesPlayed === 0)) continue;
    const gp = gamesPlayed > 0 ? gamesPlayed : 1;
    mapped[playerId] = {
      seasonPoints: round2(pts),
      gamesPlayed: gp,
      avgPoints: round2(pts / gp),
    };
  }

  return mapped;
}

export function buildWeekMatchupCards(
  week: number,
  entries: SleeperMatchup[],
  weekStatus: MatchupStatus,
  isCompleted: boolean,
  rosterInfo: Map<number, RosterMetaInfo>,
): WeeklyMatchupCard[] {
  const grouped = new Map<number, SleeperMatchup[]>();
  for (const entry of entries) {
    if (entry.matchup_id == null) continue;
    const bucket = grouped.get(entry.matchup_id) ?? [];
    bucket.push(entry);
    grouped.set(entry.matchup_id, bucket);
  }

  const cards: WeeklyMatchupCard[] = [];
  for (const [matchupId, pair] of grouped.entries()) {
    if (pair.length === 0) continue;
    const first = pair[0];
    const second = pair[1] ?? null;
    const firstInfo = rosterInfo.get(first.roster_id);
    const secondInfo = second ? rosterInfo.get(second.roster_id) : undefined;
    const starterSum1 = (first.starters ?? []).reduce(
      (sum, pid) => sum + ((first.players_points ?? {})[pid] ?? 0),
      0,
    );
    const starterSum2 = second
      ? (second.starters ?? []).reduce(
          (sum, pid) => sum + ((second.players_points ?? {})[pid] ?? 0),
          0,
        )
      : 0;
    const pts1 = round2(
      first.custom_points ??
        (first.points != null && (first.points !== 0 || starterSum1 === 0)
          ? first.points
          : starterSum1),
    );
    const pts2 = second
      ? round2(
          second.custom_points ??
            (second.points != null && (second.points !== 0 || starterSum2 === 0)
              ? second.points
              : starterSum2),
        )
      : 0;
    const margin = second ? round2(Math.abs(pts1 - pts2)) : 0;
    const hasPlayed = pts1 > 0 || pts2 > 0;

    const homeSide: WeeklyMatchupSide = {
      rosterId: first.roster_id,
      teamName: firstInfo?.teamName ?? `Team ${first.roster_id}`,
      managerName: firstInfo?.managerName ?? 'Unknown',
      avatarUrl: firstInfo?.avatarUrl ?? null,
      initials: firstInfo?.initials ?? 'T',
      recordLabel: firstInfo?.recordLabel ?? '0-0',
      points: pts1,
      isWinner: Boolean(second && hasPlayed && pts1 > pts2),
      starterIds: first.starters ?? [],
      playerPoints: first.players_points ?? {},
    };

    const awaySide: WeeklyMatchupSide | null = second
      ? {
          rosterId: second.roster_id,
          teamName: secondInfo?.teamName ?? `Team ${second.roster_id}`,
          managerName: secondInfo?.managerName ?? 'Unknown',
          avatarUrl: secondInfo?.avatarUrl ?? null,
          initials: secondInfo?.initials ?? 'T',
          recordLabel: secondInfo?.recordLabel ?? '0-0',
          points: pts2,
          isWinner: Boolean(hasPlayed && pts2 > pts1),
          starterIds: second.starters ?? [],
          playerPoints: second.players_points ?? {},
        }
      : null;

    cards.push({
      matchupId,
      week,
      status: second ? weekStatus : 'Bye',
      isCompleted,
      home: homeSide,
      away: awaySide,
      margin,
    });
  }

  return cards;
}

export function buildDashboardData(params: {
  league: SleeperLeague;
  nflState: SleeperNflState;
  users: SleeperLeagueUser[];
  rosters: SleeperRoster[];
  matchupsByWeek: Record<number, SleeperMatchup[]>;
  seasons: SeasonOption[];
  transactions: SleeperTransaction[];
  tradedPicks: SleeperTradedPick[];
  winnersBracket: SleeperBracketMatchup[];
  losersBracket: SleeperBracketMatchup[];
  draft: SleeperDraft | null;
  draftPicks: SleeperDraftPick[];
}): LeagueDashboardData {
  const {
    league,
    nflState,
    users,
    rosters,
    matchupsByWeek,
    seasons,
    transactions,
    tradedPicks,
    winnersBracket,
    losersBracket,
    draft,
    draftPicks,
  } = params;

  const userMap = new Map<string, SleeperLeagueUser>();
  for (const user of users) {
    userMap.set(user.user_id, user);
  }

  const baseRosterInfo = new Map<number, RosterMetaInfo>();
  rosters.forEach((roster, index) => {
    const owner = roster.owner_id ? userMap.get(roster.owner_id) : undefined;
    const managerName = owner?.display_name || `Manager ${roster.roster_id}`;
    const teamName = owner?.metadata?.team_name?.trim() || `${managerName}'s Squad`;
    const avatarUrl = resolveAvatarUrl(owner?.metadata?.avatar, owner?.avatar);
    const initials = extractInitials(teamName || managerName, index + 1);
    const w = roster.settings?.wins ?? 0;
    const l = roster.settings?.losses ?? 0;
    const t = roster.settings?.ties ?? 0;
    const recordLabel = t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;

    baseRosterInfo.set(roster.roster_id, {
      teamName,
      managerName,
      avatarUrl,
      initials,
      recordLabel,
    });
  });

  const weeks = Object.keys(matchupsByWeek)
    .map(Number)
    .sort((a, b) => a - b);

  const playoffStart = league.settings?.playoff_week_start ?? 15;
  const weeklyTeamMap = new Map<number, TeamWeeklyScore[]>();
  const allPlayMap = new Map<number, { wins: number; losses: number }>();
  for (const roster of rosters) {
    weeklyTeamMap.set(roster.roster_id, []);
    allPlayMap.set(roster.roster_id, { wins: 0, losses: 0 });
  }

  const weeklyMatchups: Record<number, WeeklyMatchupCard[]> = {};
  const weeklyLeagueAverages: Array<{ week: number; average: number; high: number }> = [];
  const completedWeekNumbers: number[] = [];

  let biggestBlowout: {
    week: number;
    margin: number;
    winnerId: number;
    loserName: string;
  } | null = null;
  let closestMatchup: {
    week: number;
    margin: number;
    winnerId: number;
    loserName: string;
  } | null = null;

  for (const week of weeks) {
    const entries = matchupsByWeek[week] ?? [];
    const completed = isWeekCompleted(league, nflState, week, entries);
    const weekStatus = resolveMatchupStatus(entries, completed);
    const activeEntries = entries.filter((e) => e.matchup_id != null || (e.points ?? 0) > 0);
    const activePoints = activeEntries.map((e) => e.custom_points ?? e.points ?? 0);
    const leagueAverage =
      activePoints.length > 0
        ? activePoints.reduce((acc, val) => acc + val, 0) / activePoints.length
        : 0;
    const weekHigh = activePoints.length > 0 ? Math.max(...activePoints) : 0;

    const rankedWeek = [...activeEntries]
      .map((e) => ({ rosterId: e.roster_id, pts: e.custom_points ?? e.points ?? 0 }))
      .sort((a, b) => b.pts - a.pts);
    const weekRankMap = new Map<number, number>();
    rankedWeek.forEach((item, idx) => weekRankMap.set(item.rosterId, idx + 1));

    if (completed) {
      completedWeekNumbers.push(week);

      if (weekHigh > 0) {
        weeklyLeagueAverages.push({
          week,
          average: round2(leagueAverage),
          high: round2(weekHigh),
        });
      }

      if (week < playoffStart) {
        const regEntries = entries.filter(
          (e) => e.matchup_id != null && (e.custom_points ?? e.points ?? 0) > 0,
        );
        for (const entry of regEntries) {
          const record = allPlayMap.get(entry.roster_id);
          if (!record) continue;
          const entryPts = entry.custom_points ?? entry.points ?? 0;
          for (const other of regEntries) {
            if (other.roster_id === entry.roster_id) continue;
            const otherPts = other.custom_points ?? other.points ?? 0;
            if (entryPts > otherPts) record.wins += 1;
            else if (entryPts < otherPts) record.losses += 1;
          }
        }
      }
    }

    const cards = buildWeekMatchupCards(week, entries, weekStatus, completed, baseRosterInfo);

    const grouped = new Map<number, SleeperMatchup[]>();
    for (const entry of entries) {
      if (entry.matchup_id == null) continue;
      const bucket = grouped.get(entry.matchup_id) ?? [];
      bucket.push(entry);
      grouped.set(entry.matchup_id, bucket);
    }

    for (const pair of grouped.values()) {
      if (pair.length === 0) continue;
      const first = pair[0];
      const second = pair[1] ?? null;
      const secondInfo = second ? baseRosterInfo.get(second.roster_id) : undefined;
      const pts1 = round2(first.custom_points ?? first.points ?? 0);
      const pts2 = second ? round2(second.custom_points ?? second.points ?? 0) : 0;

      if (!completed) continue;

      const firstBench = computeBenchPoints(first);
      const secondBench = second ? computeBenchPoints(second) : 0;

      if (second) {
        const res1: 'W' | 'L' | 'T' = pts1 > pts2 ? 'W' : pts1 < pts2 ? 'L' : 'T';
        const res2: 'W' | 'L' | 'T' = pts2 > pts1 ? 'W' : pts2 < pts1 ? 'L' : 'T';

        weeklyTeamMap.get(first.roster_id)?.push({
          week,
          points: pts1,
          opponentPoints: pts2,
          opponentName: secondInfo?.teamName ?? `Team ${second.roster_id}`,
          opponentRosterId: second.roster_id,
          leagueAverage: round2(leagueAverage),
          leagueRankThatWeek: weekRankMap.get(first.roster_id) ?? 1,
          leagueSizeThatWeek: rankedWeek.length,
          result: res1,
          margin: round2(pts1 - pts2),
          benchPoints: firstBench,
          starterIds: first.starters ?? [],
          playerPoints: first.players_points ?? {},
        });

        const firstInfo = baseRosterInfo.get(first.roster_id);
        weeklyTeamMap.get(second.roster_id)?.push({
          week,
          points: pts2,
          opponentPoints: pts1,
          opponentName: firstInfo?.teamName ?? `Team ${first.roster_id}`,
          opponentRosterId: first.roster_id,
          leagueAverage: round2(leagueAverage),
          leagueRankThatWeek: weekRankMap.get(second.roster_id) ?? 1,
          leagueSizeThatWeek: rankedWeek.length,
          result: res2,
          margin: round2(pts2 - pts1),
          benchPoints: secondBench,
          starterIds: second.starters ?? [],
          playerPoints: second.players_points ?? {},
        });

        if (pts1 !== pts2) {
          const margin = round2(Math.abs(pts1 - pts2));
          const winnerId = pts1 > pts2 ? first.roster_id : second.roster_id;
          const loserId = pts1 > pts2 ? second.roster_id : first.roster_id;
          const loserName = baseRosterInfo.get(loserId)?.teamName ?? `Team ${loserId}`;

          if (!biggestBlowout || margin > biggestBlowout.margin) {
            biggestBlowout = { week, margin, winnerId, loserName };
          }
          if (!closestMatchup || margin < closestMatchup.margin) {
            closestMatchup = { week, margin, winnerId, loserName };
          }
        }
      } else {
        weeklyTeamMap.get(first.roster_id)?.push({
          week,
          points: pts1,
          opponentPoints: null,
          opponentName: null,
          opponentRosterId: null,
          leagueAverage: round2(leagueAverage),
          leagueRankThatWeek: weekRankMap.get(first.roster_id) ?? 1,
          leagueSizeThatWeek: rankedWeek.length,
          result: 'BYE',
          margin: 0,
          benchPoints: firstBench,
          starterIds: first.starters ?? [],
          playerPoints: first.players_points ?? {},
        });
      }
    }

    weeklyMatchups[week] = cards.sort((a, b) => a.matchupId - b.matchupId);
  }

  const totalBudget = league.settings?.waiver_budget ?? 100;
  const usesFaab = (league.settings?.waiver_type ?? 2) === 2 && totalBudget > 0;

  const teams: TeamSummary[] = rosters.map((roster) => {
    const info = baseRosterInfo.get(roster.roster_id)!;
    const wins = roster.settings?.wins ?? 0;
    const losses = roster.settings?.losses ?? 0;
    const ties = roster.settings?.ties ?? 0;
    const games = wins + losses + ties;
    const winPct = games > 0 ? (wins + ties * 0.5) / games : 0;

    const weeklyScores = (weeklyTeamMap.get(roster.roster_id) ?? []).sort((a, b) => a.week - b.week);

    let pointsFor = combinePoints(roster.settings?.fpts, roster.settings?.fpts_decimal);
    if (pointsFor === 0 && weeklyScores.length > 0) {
      pointsFor = round2(weeklyScores.reduce((acc, w) => acc + w.points, 0));
    }

    const pointsAgainst = combinePoints(
      roster.settings?.fpts_against,
      roster.settings?.fpts_against_decimal,
    );
    const maxPointsFor = combinePoints(roster.settings?.ppts, roster.settings?.ppts_decimal);
    const lineupEfficiencyPct = maxPointsFor > 0 ? round2((pointsFor / maxPointsFor) * 100) : 100;

    const allPlay = allPlayMap.get(roster.roster_id) ?? { wins: 0, losses: 0 };
    const allPlayTotal = allPlay.wins + allPlay.losses;
    const expectedWins = allPlayTotal > 0 ? (allPlay.wins / allPlayTotal) * games : wins;
    const luckScore = round2(wins - expectedWins);

    const bestWeek =
      weeklyScores.length > 0
        ? weeklyScores.reduce((best, cur) => (cur.points > best.points ? cur : best))
        : null;
    const worstWeek =
      weeklyScores.length > 0
        ? weeklyScores.reduce((worst, cur) => (cur.points < worst.points ? cur : worst))
        : null;

    const scoreValues = weeklyScores.map((w) => w.points);
    const medianScore = computeMedian(scoreValues);
    const stdDevScore = computeStdDev(scoreValues);
    const boomWeeks = weeklyScores.filter(
      (w) => w.leagueAverage > 0 && w.points >= w.leagueAverage * 1.15,
    ).length;
    const benchPointsTotal = round2(weeklyScores.reduce((sum, w) => sum + w.benchPoints, 0));
    const closeWins = weeklyScores.filter(
      (w) => w.result === 'W' && w.margin > 0 && w.margin < 5,
    ).length;
    const closeLosses = weeklyScores.filter(
      (w) => w.result === 'L' && Math.abs(w.margin) < 5,
    ).length;

    return {
      rosterId: roster.roster_id,
      ownerId: roster.owner_id,
      managerName: info.managerName,
      teamName: info.teamName,
      avatarUrl: info.avatarUrl,
      initials: info.initials,
      wins,
      losses,
      ties,
      winPct,
      recordLabel: info.recordLabel,
      pointsFor,
      pointsAgainst,
      maxPointsFor,
      lineupEfficiencyPct,
      pointDifferential: round2(pointsFor - pointsAgainst),
      streak: roster.metadata?.streak || '—',
      allPlayWins: allPlay.wins,
      allPlayLosses: allPlay.losses,
      luckScore,
      powerScore: 0,
      standingsRank: 0,
      powerRank: 0,
      pointsRank: 0,
      waiverMoves: roster.settings?.total_moves ?? 0,
      usesFaab,
      faabRemaining: Math.max(0, totalBudget - (roster.settings?.waiver_budget_used ?? 0)),
      waiverPriority: roster.settings?.waiver_position ?? 1,
      rosterSize: roster.players?.length ?? 0,
      starterCount: roster.starters?.length ?? 0,
      medianScore,
      stdDevScore,
      boomWeeks,
      benchPointsTotal,
      closeWins,
      closeLosses,
      rawPlayerIds: roster.players ?? [],
      rawStarterIds: roster.starters ?? [],
      rawReserveIds: roster.reserve ?? [],
      weeklyScores,
      bestWeek,
      worstWeek,
    };
  });

  const byStandings = [...teams].sort((a, b) => b.winPct - a.winPct || b.pointsFor - a.pointsFor);
  byStandings.forEach((team, i) => {
    team.standingsRank = i + 1;
  });

  const maxPointsLeader = Math.max(...teams.map((t) => t.pointsFor), 1);
  const byPoints = [...teams].sort((a, b) => b.pointsFor - a.pointsFor);
  byPoints.forEach((team, i) => {
    team.pointsRank = i + 1;
  });

  for (const team of teams) {
    const allPlayTotal = team.allPlayWins + team.allPlayLosses;
    const allPlayPct = allPlayTotal > 0 ? team.allPlayWins / allPlayTotal : team.winPct;
    const scoringRatio = team.pointsFor / maxPointsLeader;
    team.powerScore = round2((team.winPct * 0.35 + allPlayPct * 0.35 + scoringRatio * 0.3) * 100);
  }

  const byPower = [...teams].sort((a, b) => b.powerScore - a.powerScore || b.pointsFor - a.pointsFor);
  byPower.forEach((team, i) => {
    team.powerRank = i + 1;
  });

  const pulseInsights = buildPulseInsights(byStandings, biggestBlowout, closestMatchup);
  const now = new Date();

  return {
    league,
    nflState,
    currentWeek: weeks.length > 0 ? Math.max(...weeks) : nflState.week,
    completedWeek: completedWeekNumbers.length > 0 ? Math.max(...completedWeekNumbers) : 0,
    teams: byStandings,
    weeklyMatchups,
    weeklyLeagueAverages,
    pulseInsights,
    seasons,
    transactions,
    tradedPicks,
    winnersBracket,
    losersBracket,
    draft,
    draftPicks,
    loadedAtIso: now.toISOString(),
    loadedAtTime: formatLoadedAtTime(now),
  };
}

export function buildRosterPlayerStatsView(params: {
  team: TeamSummary;
  dashboard: LeagueDashboardData | null;
  seasonStats: Record<string, SeasonStatEntry> | undefined;
  resolvePlayer: (id: string) => PlayerMeta;
}): RosterPlayerStat[] {
  const { team, dashboard, seasonStats, resolvePlayer } = params;
  const completedWeek = dashboard?.completedWeek ?? 0;
  const allTeams = dashboard?.teams ?? [];
  const sourceTeams = allTeams.length > 0 ? allTeams : [team];

  const leagueTotals = new Map<string, { total: number; games: number }>();
  for (const t of sourceTeams) {
    for (const weekScore of t.weeklyScores) {
      if (weekScore.week > completedWeek && weekScore.points === 0) continue;
      for (const [pid, pts] of Object.entries(weekScore.playerPoints)) {
        if (typeof pts !== 'number' || pts === 0) continue;
        const acc = leagueTotals.get(pid) ?? { total: 0, games: 0 };
        acc.total += pts;
        acc.games += 1;
        leagueTotals.set(pid, acc);
      }
    }
  }

  const starterSet = new Set(team.rawStarterIds);
  const reserveSet = new Set(team.rawReserveIds);
  const orderedIds = Array.from(
    new Set([...team.rawStarterIds, ...team.rawPlayerIds, ...team.rawReserveIds]),
  );

  const lastCompleted =
    [...team.weeklyScores].reverse().find((w) => w.week <= completedWeek || w.points > 0) ?? null;

  const stats: RosterPlayerStat[] = orderedIds.map((playerId) => {
    const meta = resolvePlayer(playerId);
    const agg = leagueTotals.get(playerId);
    const matchupGames = agg?.games ?? 0;
    const matchupTotal = agg ? round2(agg.total) : 0;
    const nflStat = seasonStats?.[playerId];

    const useNfl = Boolean(nflStat && nflStat.gamesPlayed > matchupGames);
    const seasonPoints = useNfl ? nflStat!.seasonPoints : matchupTotal;
    const gamesPlayed = useNfl ? nflStat!.gamesPlayed : matchupGames;
    const avgPoints = useNfl
      ? nflStat!.avgPoints
      : gamesPlayed > 0
        ? round2(seasonPoints / gamesPlayed)
        : 0;

    const role: 'starter' | 'bench' | 'ir' = starterSet.has(playerId)
      ? 'starter'
      : reserveSet.has(playerId)
        ? 'ir'
        : 'bench';

    const lastRaw = lastCompleted?.playerPoints[playerId];

    return {
      playerId,
      name: meta.name,
      position: meta.position,
      nflTeam: meta.nflTeam,
      injuryStatus: meta.injuryStatus,
      role,
      seasonPoints,
      avgPoints,
      gamesPlayed,
      lastWeekPoints: typeof lastRaw === 'number' && lastRaw !== 0 ? round2(lastRaw) : null,
    };
  });

  const roleOrder = { starter: 0, bench: 1, ir: 2 };
  return stats.sort((a, b) => {
    const roleDiff = roleOrder[a.role] - roleOrder[b.role];
    if (roleDiff !== 0) return roleDiff;
    const posDiff = (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99);
    if (posDiff !== 0 && a.role === 'starter') return posDiff;
    return b.avgPoints - a.avgPoints || b.seasonPoints - a.seasonPoints;
  });
}

export function buildWeeklyLineupView(params: {
  weekScore: TeamWeeklyScore;
  dashboard: LeagueDashboardData | null;
  season?: string;
  resolvePlayer: (id: string) => PlayerMeta;
  getPlayerProjection: (playerId: string, season: string, week: number) => number | null;
  isPlayerOnBye: (nflTeam: string, season: string, week: number) => boolean;
}): WeeklyLineupEntry[] {
  const { weekScore, dashboard, season, resolvePlayer, getPlayerProjection, isPlayerOnBye } = params;
  const rosterSlots = (dashboard?.league.roster_positions ?? []).filter(
    (pos) => pos !== 'BN' && pos !== 'IR' && pos !== 'TAXI',
  );

  const starterIndexMap = new Map<string, { index: number; slotLabel: string }>();
  weekScore.starterIds.forEach((id, idx) => {
    const rawSlot = rosterSlots[idx] ?? '';
    starterIndexMap.set(id, {
      index: idx,
      slotLabel: normalizeSlotLabel(rawSlot),
    });
  });

  const allIds = Array.from(
    new Set([...weekScore.starterIds, ...Object.keys(weekScore.playerPoints)]),
  );

  const entries = allIds.map((playerId) => {
    const meta = resolvePlayer(playerId);
    const isOnBye = season ? isPlayerOnBye(meta.nflTeam, season, weekScore.week) : false;
    const projectedPoints =
      season && !isOnBye ? getPlayerProjection(playerId, season, weekScore.week) : null;
    const starterInfo = starterIndexMap.get(playerId);
    const isStarter = Boolean(starterInfo);
    const slotLabel = starterInfo?.slotLabel || meta.position;

    return {
      playerId,
      slotLabel,
      name: meta.name,
      position: meta.position,
      nflTeam: meta.nflTeam,
      injuryStatus: meta.injuryStatus,
      points: round2(weekScore.playerPoints[playerId] ?? 0),
      projectedPoints,
      isOnBye,
      isStarter,
    };
  });

  return entries.sort((a, b) => {
    if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1;
    if (a.isStarter && b.isStarter) {
      const slotDiff = (POSITION_ORDER[a.slotLabel] ?? 99) - (POSITION_ORDER[b.slotLabel] ?? 99);
      if (slotDiff !== 0) return slotDiff;
      return (
        (starterIndexMap.get(a.playerId)?.index ?? 99) -
        (starterIndexMap.get(b.playerId)?.index ?? 99)
      );
    }
    const posDiff = (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99);
    if (posDiff !== 0) return posDiff;
    return b.points - a.points;
  });
}

export function buildLeaguePlayersView(params: {
  dashboard: LeagueDashboardData | null;
  seasonStats: Record<string, SeasonStatEntry> | undefined;
  resolvePlayer: (id: string) => PlayerMeta;
}): LeaguePlayerRow[] {
  const { dashboard, seasonStats, resolvePlayer } = params;
  const teams = dashboard?.teams ?? [];
  if (teams.length === 0) return [];

  const completedWeek = dashboard?.completedWeek ?? 0;
  const rosteredBy = new Map<string, { teamName: string; rosterId: number }>();
  const playerTotals = new Map<
    string,
    { total: number; games: number; weekly: Array<{ week: number; points: number }> }
  >();

  for (const team of teams) {
    for (const pid of team.rawPlayerIds) {
      rosteredBy.set(pid, { teamName: team.teamName, rosterId: team.rosterId });
      if (!playerTotals.has(pid)) {
        playerTotals.set(pid, { total: 0, games: 0, weekly: [] });
      }
    }

    for (const wk of team.weeklyScores) {
      if (wk.week > completedWeek && wk.points === 0) continue;
      for (const [pid, pts] of Object.entries(wk.playerPoints)) {
        if (typeof pts !== 'number' || pts === 0) continue;
        const acc = playerTotals.get(pid) ?? { total: 0, games: 0, weekly: [] };
        acc.total += pts;
        acc.games += 1;
        acc.weekly.push({ week: wk.week, points: round2(pts) });
        playerTotals.set(pid, acc);
      }
    }
  }

  const rows: LeaguePlayerRow[] = [];
  for (const [playerId, acc] of playerTotals.entries()) {
    const meta = resolvePlayer(playerId);
    const owner = rosteredBy.get(playerId) ?? null;
    const nflStat = seasonStats?.[playerId];
    const useNfl = Boolean(nflStat && nflStat.gamesPlayed > acc.games);
    const gamesPlayed = useNfl ? nflStat!.gamesPlayed : acc.games;
    const seasonPoints = useNfl ? nflStat!.seasonPoints : round2(acc.total);
    const avgPoints = useNfl
      ? nflStat!.avgPoints
      : acc.games > 0
        ? round2(acc.total / acc.games)
        : 0;

    rows.push({
      playerId,
      name: meta.name,
      position: meta.position,
      nflTeam: meta.nflTeam,
      injuryStatus: meta.injuryStatus,
      fantasyTeamName: owner?.teamName ?? null,
      fantasyRosterId: owner?.rosterId ?? null,
      gamesPlayed,
      seasonPoints,
      avgPoints,
      weeklyPoints: acc.weekly.sort((a, b) => a.week - b.week),
    });
  }

  return rows.sort((a, b) => b.seasonPoints - a.seasonPoints);
}

export function buildLeagueTradesView(params: {
  dashboard: LeagueDashboardData;
  leaguePlayers: LeaguePlayerRow[];
  resolvePlayer: (id: string) => PlayerMeta;
}): LeagueTradeCard[] {
  const { dashboard, leaguePlayers, resolvePlayer } = params;
  const teamMap = new Map(dashboard.teams.map((t) => [t.rosterId, t]));
  const playerSeasonPts = new Map(leaguePlayers.map((p) => [p.playerId, p.seasonPoints]));

  const trades = dashboard.transactions
    .filter((tx) => tx.type === 'trade' && tx.status === 'complete')
    .sort((a, b) => b.created - a.created);

  return trades.map((tx) => {
    const sidesMap = new Map<number, TradeSideSummary>();
    for (const rid of tx.roster_ids ?? []) {
      const team = teamMap.get(rid);
      sidesMap.set(rid, {
        rosterId: rid,
        teamName: team?.teamName ?? `Team ${rid}`,
        managerName: team?.managerName ?? 'Manager',
        avatarUrl: team?.avatarUrl ?? null,
        initials: team?.initials ?? `T${rid}`,
        playersReceived: [],
        picksReceived: [],
        faabReceived: 0,
      });
    }

    if (tx.adds) {
      for (const [playerId, receivingRosterId] of Object.entries(tx.adds)) {
        const side = sidesMap.get(receivingRosterId);
        if (!side) continue;
        const meta = resolvePlayer(playerId);
        const item: TradeReceivedPlayer = {
          playerId,
          name: meta.name,
          position: meta.position,
          nflTeam: meta.nflTeam,
          seasonPoints: playerSeasonPts.get(playerId) ?? 0,
        };
        side.playersReceived.push(item);
      }
    }

    for (const pick of tx.draft_picks ?? []) {
      const side = sidesMap.get(pick.owner_id);
      if (!side) continue;
      const origTeam = teamMap.get(pick.roster_id);
      const item: TradeReceivedPick = {
        season: pick.season,
        round: pick.round,
        originalTeamName: origTeam?.teamName ?? `Team ${pick.roster_id}`,
      };
      side.picksReceived.push(item);
    }

    for (const faab of tx.waiver_budget ?? []) {
      const side = sidesMap.get(faab.receiver);
      if (side) {
        side.faabReceived += faab.amount;
      }
    }

    return {
      transactionId: tx.transaction_id,
      week: tx.leg,
      createdAt: tx.created,
      dateLabel: new Date(tx.created).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      }),
      sides: Array.from(sidesMap.values()),
    };
  });
}

export function buildRecentMovesView(params: {
  dashboard: LeagueDashboardData;
  leaguePlayers: LeaguePlayerRow[];
  resolvePlayer: (id: string) => PlayerMeta;
}): LeagueMoveItem[] {
  const { dashboard, leaguePlayers, resolvePlayer } = params;
  const teamMap = new Map(dashboard.teams.map((t) => [t.rosterId, t]));
  const playerSeasonPts = new Map(leaguePlayers.map((p) => [p.playerId, p.seasonPoints]));

  return dashboard.transactions
    .filter((tx) => (tx.type === 'waiver' || tx.type === 'free_agent') && tx.status === 'complete')
    .sort((a, b) => b.created - a.created)
    .slice(0, 60)
    .map((tx) => {
      const rid = tx.roster_ids?.[0] ?? 1;
      const team = teamMap.get(rid);
      const addedPlayers: TradeReceivedPlayer[] = [];
      const droppedPlayers: TradeReceivedPlayer[] = [];

      if (tx.adds) {
        for (const pid of Object.keys(tx.adds)) {
          const meta = resolvePlayer(pid);
          addedPlayers.push({
            playerId: pid,
            name: meta.name,
            position: meta.position,
            nflTeam: meta.nflTeam,
            seasonPoints: playerSeasonPts.get(pid) ?? 0,
          });
        }
      }

      if (tx.drops) {
        for (const pid of Object.keys(tx.drops)) {
          const meta = resolvePlayer(pid);
          droppedPlayers.push({
            playerId: pid,
            name: meta.name,
            position: meta.position,
            nflTeam: meta.nflTeam,
            seasonPoints: playerSeasonPts.get(pid) ?? 0,
          });
        }
      }

      return {
        transactionId: tx.transaction_id,
        type: tx.type === 'waiver' ? 'waiver' : 'free_agent',
        week: tx.leg,
        dateLabel: new Date(tx.created).toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
        }),
        rosterId: rid,
        teamName: team?.teamName ?? `Team ${rid}`,
        addedPlayers,
        droppedPlayers,
        waiverBid: tx.settings?.waiver_bid ?? null,
      };
    });
}

export function buildTradedPicksView(dashboard: LeagueDashboardData): TradedPickView[] {
  const teamMap = new Map(dashboard.teams.map((t) => [t.rosterId, t]));

  return dashboard.tradedPicks
    .filter((p) => p.roster_id !== p.owner_id)
    .sort((a, b) => a.season.localeCompare(b.season) || a.round - b.round)
    .map((p) => ({
      season: p.season,
      round: p.round,
      originalOwnerName: teamMap.get(p.roster_id)?.teamName ?? `Team ${p.roster_id}`,
      currentOwnerName: teamMap.get(p.owner_id)?.teamName ?? `Team ${p.owner_id}`,
      currentOwnerRosterId: p.owner_id,
    }));
}

function normalizeSlotLabel(slot: string): string {
  const upper = slot.toUpperCase();
  if (upper === 'FLEX' || upper === 'WRT' || upper === 'WRT_FLEX' || upper === 'WRRB_FLEX') {
    return 'FLX';
  }
  if (upper === 'SUPER_FLEX') return 'SFLX';
  if (upper === 'REC_FLEX') return 'RFLX';
  return upper;
}

function buildPulseInsights(
  teams: TeamSummary[],
  biggestBlowout: { week: number; margin: number; winnerId: number; loserName: string } | null,
  closestMatchup: { week: number; margin: number; winnerId: number; loserName: string } | null,
): LeaguePulseInsight[] {
  if (teams.length === 0) return [];
  const insights: LeaguePulseInsight[] = [];

  const topScorer = [...teams].sort((a, b) => b.pointsFor - a.pointsFor)[0];
  const completedSum = topScorer.weeklyScores.reduce((sum, w) => sum + w.points, 0);
  const completedAvg =
    topScorer.weeklyScores.length > 0
      ? (completedSum > 0 ? completedSum : topScorer.pointsFor) / topScorer.weeklyScores.length
      : 0;
  insights.push({
    id: 'top-scorer',
    label: 'Highest Scorer',
    stat: `${topScorer.pointsFor.toFixed(2)}`,
    context: `${completedAvg.toFixed(1)} pts/wk average`,
    teamName: topScorer.teamName,
    rosterId: topScorer.rosterId,
  });

  const withMaxPf = teams.filter((t) => t.maxPointsFor > 0);
  if (withMaxPf.length > 0) {
    const sharpest = [...withMaxPf].sort((a, b) => b.lineupEfficiencyPct - a.lineupEfficiencyPct)[0];
    insights.push({
      id: 'efficiency',
      label: 'Lineup Efficiency',
      stat: `${sharpest.lineupEfficiencyPct.toFixed(1)}%`,
      context: `${sharpest.pointsFor.toFixed(1)} of ${sharpest.maxPointsFor.toFixed(1)} max PF`,
      teamName: sharpest.teamName,
      rosterId: sharpest.rosterId,
    });
  }

  if (closestMatchup) {
    const winner = teams.find((t) => t.rosterId === closestMatchup.winnerId);
    if (winner) {
      insights.push({
        id: 'closest',
        label: `Closest Margin · Wk ${closestMatchup.week}`,
        stat: `${closestMatchup.margin.toFixed(2)} pts`,
        context: `Defeated ${closestMatchup.loserName}`,
        teamName: winner.teamName,
        rosterId: winner.rosterId,
      });
    }
  }

  if (biggestBlowout) {
    const winner = teams.find((t) => t.rosterId === biggestBlowout.winnerId);
    if (winner) {
      insights.push({
        id: 'swing',
        label: `Biggest Swing · Wk ${biggestBlowout.week}`,
        stat: `+${biggestBlowout.margin.toFixed(2)}`,
        context: `Over ${biggestBlowout.loserName}`,
        teamName: winner.teamName,
        rosterId: winner.rosterId,
      });
    }
  }

  return insights;
}

function computeBenchPoints(matchup: SleeperMatchup): number {
  if (!matchup.players_points) return 0;
  const starters = new Set(matchup.starters ?? []);
  let bench = 0;
  for (const [playerId, pts] of Object.entries(matchup.players_points)) {
    if (!starters.has(playerId)) {
      bench += pts ?? 0;
    }
  }
  return round2(bench);
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? round2((sorted[mid - 1] + sorted[mid]) / 2) : round2(sorted[mid]);
}

function computeStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return round2(Math.sqrt(variance));
}

function resolveAvatarUrl(metaAvatar?: string, userAvatar?: string | null): string | null {
  const trimmedMeta = metaAvatar?.trim();
  if (trimmedMeta) {
    return trimmedMeta.startsWith('http') ? trimmedMeta : `${SLEEPER_AVATAR_BASE}/${trimmedMeta}`;
  }
  if (userAvatar) {
    return `${SLEEPER_AVATAR_BASE}/${userAvatar}`;
  }
  return null;
}

function combinePoints(whole?: number, decimal?: number): number {
  const base = whole ?? 0;
  const dec = (decimal ?? 0) / 100;
  return round2(base + dec);
}

function extractInitials(name: string, fallbackNumber: number): string {
  const parts = name
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `T${fallbackNumber}`;
}
