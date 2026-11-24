import { LeagueDashboardData, LeaguePlayerRow, PlayerMeta } from '../models/sleeper.models';

export type PlayerUsageStatus = 'Started' | 'Bench' | 'Unrostered';

export interface PlayerWeekLogEntry {
  week: number;
  points: number;
  deltaFromAvg: number;
  usage: PlayerUsageStatus;
  fantasyTeamName: string | null;
  fantasyRosterId: number | null;
}

export interface PlayerTransactionEvent {
  transactionId: string;
  week: number;
  kind: 'Trade' | 'Waiver' | 'Free Agent';
  teamName: string;
  rosterId: number | null;
  detail: string;
  dateLabel: string;
}

export interface PlayerDraftPedigree {
  pickLabel: string;
  round: number;
  draftedByTeam: string;
  draftedByRosterId: number;
  auctionAmount: number | null;
  isKeeper: boolean;
  posDraftRank: number | null;
}

export interface PlayerPeerRow {
  player: LeaguePlayerRow;
  posRank: number;
  isCurrent: boolean;
}

export interface PlayerAnalysisReport {
  player: LeaguePlayerRow;
  meta: PlayerMeta;
  posRank: number;
  posTotalCount: number;
  overallRank: number;
  pctOfPosLeader: number;
  currentSlotRole: 'Starter' | 'Bench' | 'IR' | 'Free Agent';
  bestWeek: { week: number; points: number } | null;
  worstWeek: { week: number; points: number } | null;
  medianPoints: number;
  stdDevPoints: number;
  consistencyLabel: 'Rock Solid' | 'Steady' | 'Volatile' | 'Sample';
  recent3Avg: number | null;
  recentDelta: number;
  boomWeeks20: number;
  floorWeeks12: number;
  startedWeeks: number;
  benchedWeeks: number;
  startedPoints: number;
  benchedPoints: number;
  weekLogs: PlayerWeekLogEntry[];
  draftPedigree: PlayerDraftPedigree | null;
  transactions: PlayerTransactionEvent[];
  peers: PlayerPeerRow[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const sq = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  return Math.sqrt(sq / values.length);
}

/**
 * Builds a complete single-player scouting and analysis report from cached league telemetry.
 */
export function buildPlayerAnalysis(
  player: LeaguePlayerRow,
  allPlayers: LeaguePlayerRow[],
  meta: PlayerMeta,
  dashboard: LeagueDashboardData,
): PlayerAnalysisReport {
  const posGroup = allPlayers
    .filter((p) => p.position === player.position)
    .sort((a, b) => b.seasonPoints - a.seasonPoints);
  const posIdx = posGroup.findIndex((p) => p.playerId === player.playerId);
  const posRank = posIdx >= 0 ? posIdx + 1 : 1;
  const posLeaderPts = posGroup[0]?.seasonPoints ?? player.seasonPoints;
  const overallIdx = [...allPlayers]
    .sort((a, b) => b.seasonPoints - a.seasonPoints)
    .findIndex((p) => p.playerId === player.playerId);

  let currentSlotRole: PlayerAnalysisReport['currentSlotRole'] = 'Free Agent';
  if (player.fantasyRosterId !== null) {
    const ownerTeam = dashboard.teams.find((t) => t.rosterId === player.fantasyRosterId);
    if (ownerTeam) {
      if (ownerTeam.rawStarterIds.includes(player.playerId)) currentSlotRole = 'Starter';
      else if (ownerTeam.rawReserveIds.includes(player.playerId)) currentSlotRole = 'IR';
      else currentSlotRole = 'Bench';
    }
  }

  const ptsValues = player.weeklyPoints.map((w) => w.points);
  const bestWeek =
    player.weeklyPoints.length > 0
      ? player.weeklyPoints.reduce((a, b) => (b.points >= a.points ? b : a))
      : null;
  const worstWeek =
    player.weeklyPoints.length > 0
      ? player.weeklyPoints.reduce((a, b) => (b.points <= a.points ? b : a))
      : null;

  const medianPoints = round2(computeMedian(ptsValues));
  const stdDevPoints = round2(computeStdDev(ptsValues, player.avgPoints));
  const cv = player.avgPoints > 0 ? stdDevPoints / player.avgPoints : 1;
  const consistencyLabel: PlayerAnalysisReport['consistencyLabel'] =
    ptsValues.length < 3 ? 'Sample' : cv <= 0.34 ? 'Rock Solid' : cv <= 0.52 ? 'Steady' : 'Volatile';

  const last3 = player.weeklyPoints.slice(-3);
  const recent3Avg =
    last3.length >= 2
      ? round2(last3.reduce((s, w) => s + w.points, 0) / last3.length)
      : null;
  const recentDelta = recent3Avg !== null ? round2(recent3Avg - player.avgPoints) : 0;

  const boomWeeks20 = ptsValues.filter((v) => v >= 20).length;
  const floorWeeks12 = ptsValues.filter((v) => v >= 12).length;

  // Build week-by-week usage logs checking every team's weekly lineups for starter vs bench context
  let startedWeeks = 0;
  let benchedWeeks = 0;
  let startedPoints = 0;
  let benchedPoints = 0;

  const weekLogs: PlayerWeekLogEntry[] = player.weeklyPoints.map((entry) => {
    let usage: PlayerUsageStatus = 'Unrostered';
    let fantasyTeamName: string | null = null;
    let fantasyRosterId: number | null = null;

    for (const team of dashboard.teams) {
      const teamWk = team.weeklyScores.find((w) => w.week === entry.week);
      if (!teamWk) continue;
      if (Object.prototype.hasOwnProperty.call(teamWk.playerPoints, player.playerId)) {
        fantasyTeamName = team.teamName;
        fantasyRosterId = team.rosterId;
        if (teamWk.starterIds.includes(player.playerId)) {
          usage = 'Started';
          startedWeeks += 1;
          startedPoints += entry.points;
        } else {
          usage = 'Bench';
          benchedWeeks += 1;
          benchedPoints += entry.points;
        }
        break;
      }
    }

    return {
      week: entry.week,
      points: entry.points,
      deltaFromAvg: round2(entry.points - player.avgPoints),
      usage,
      fantasyTeamName,
      fantasyRosterId,
    };
  });

  // Draft provenance & positional draft rank
  let draftPedigree: PlayerDraftPedigree | null = null;
  const pick = dashboard.draftPicks.find((dp) => dp.player_id === player.playerId);
  if (pick) {
    const teamCount = Math.max(dashboard.draft?.settings?.teams ?? dashboard.teams.length, 1);
    const inRound = ((pick.pick_no - 1) % teamCount) + 1;
    const owner = dashboard.teams.find((t) => t.rosterId === pick.roster_id);
    const posPicksBefore = dashboard.draftPicks.filter(
      (dp) => dp.metadata?.position === player.position && dp.pick_no <= pick.pick_no,
    ).length;
    const rawAmount = pick.metadata?.amount ? Number(pick.metadata.amount) : null;

    draftPedigree = {
      pickLabel: `${pick.round}.${String(inRound).padStart(2, '0')}`,
      round: pick.round,
      draftedByTeam: owner?.teamName ?? `Team ${pick.roster_id}`,
      draftedByRosterId: pick.roster_id,
      auctionAmount: rawAmount !== null && Number.isFinite(rawAmount) ? rawAmount : null,
      isKeeper: Boolean(pick.is_keeper),
      posDraftRank: posPicksBefore > 0 ? posPicksBefore : null,
    };
  }

  // Transaction trail involving this player (trades + waivers + FA)
  const teamMap = new Map(dashboard.teams.map((t) => [t.rosterId, t]));
  const transactions: PlayerTransactionEvent[] = dashboard.transactions
    .filter(
      (tx) =>
        tx.status === 'complete' &&
        (Object.prototype.hasOwnProperty.call(tx.adds ?? {}, player.playerId) ||
          Object.prototype.hasOwnProperty.call(tx.drops ?? {}, player.playerId)),
    )
    .sort((a, b) => b.created - a.created)
    .map((tx) => {
      const addedToRoster = tx.adds?.[player.playerId] ?? null;
      const droppedByRoster = tx.drops?.[player.playerId] ?? null;
      const targetRoster = addedToRoster ?? droppedByRoster;
      const team = targetRoster !== null ? teamMap.get(targetRoster) : null;
      const bid = tx.settings?.waiver_bid;
      const ts = tx.created;
      const dateLabel = ts
        ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '';

      if (tx.type === 'trade') {
        return {
          transactionId: tx.transaction_id,
          week: tx.leg || 1,
          kind: 'Trade',
          teamName: team?.teamName ?? `Team ${targetRoster}`,
          rosterId: targetRoster,
          detail: addedToRoster !== null ? `Acquired by ${team?.teamName ?? 'team'}` : 'Traded away',
          dateLabel,
        };
      }

      if (tx.type === 'waiver') {
        const bidText = typeof bid === 'number' && bid > 0 ? ` ($${bid} FAAB)` : '';
        return {
          transactionId: tx.transaction_id,
          week: tx.leg || 1,
          kind: 'Waiver',
          teamName: team?.teamName ?? `Team ${targetRoster}`,
          rosterId: targetRoster,
          detail:
            addedToRoster !== null
              ? `Claimed by ${team?.teamName ?? 'team'}${bidText}`
              : `Dropped by ${team?.teamName ?? 'team'}`,
          dateLabel,
        };
      }

      return {
        transactionId: tx.transaction_id,
        week: tx.leg || 1,
        kind: 'Free Agent',
        teamName: team?.teamName ?? `Team ${targetRoster}`,
        rosterId: targetRoster,
        detail:
          addedToRoster !== null
            ? `Added by ${team?.teamName ?? 'team'}`
            : `Released by ${team?.teamName ?? 'team'}`,
        dateLabel,
      };
    });

  // Positional peer slice centered around the player's rank (+/- 2)
  const safeIdx = Math.max(0, posIdx);
  const start = Math.max(0, Math.min(safeIdx - 2, Math.max(0, posGroup.length - 5)));
  const peers: PlayerPeerRow[] = posGroup.slice(start, start + 5).map((peer, offset) => ({
    player: peer,
    posRank: start + offset + 1,
    isCurrent: peer.playerId === player.playerId,
  }));

  return {
    player,
    meta,
    posRank,
    posTotalCount: posGroup.length,
    overallRank: overallIdx >= 0 ? overallIdx + 1 : 1,
    pctOfPosLeader: posLeaderPts > 0 ? Math.min(100, Math.round((player.seasonPoints / posLeaderPts) * 100)) : 0,
    currentSlotRole,
    bestWeek,
    worstWeek,
    medianPoints,
    stdDevPoints,
    consistencyLabel,
    recent3Avg,
    recentDelta,
    boomWeeks20,
    floorWeeks12,
    startedWeeks,
    benchedWeeks,
    startedPoints: round2(startedPoints),
    benchedPoints: round2(benchedPoints),
    weekLogs,
    draftPedigree,
    transactions,
    peers,
  };
}
