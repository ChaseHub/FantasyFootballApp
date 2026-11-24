import { optimizeTeamLineup } from './lineup-optimizer';
import { RosterPlayerStat, TeamSummary } from '../models/sleeper.models';

export interface TradePosDelta {
  pos: 'QB' | 'RB' | 'WR' | 'TE';
  beforePpg: number;
  afterPpg: number;
  delta: number;
}

export type TradeVerdictKind = 'idle' | 'win-win' | 'even' | 'favors-a' | 'favors-b';

export interface TradeEvaluationResult {
  teamA: TeamSummary;
  teamB: TeamSummary;
  rosterA: RosterPlayerStat[];
  rosterB: RosterPlayerStat[];
  sendingA: RosterPlayerStat[];
  sendingB: RosterPlayerStat[];
  ppgSendA: number;
  ppgSendB: number;
  seasonSendA: number;
  seasonSendB: number;
  packagePpgDiff: number; // positive = Team A receives more raw package PPG
  starterBeforeA: number;
  starterAfterA: number;
  starterDeltaA: number;
  starterBeforeB: number;
  starterAfterB: number;
  starterDeltaB: number;
  deltaA: TradePosDelta[];
  deltaB: TradePosDelta[];
  verdictKind: TradeVerdictKind;
  verdictHeadline: string;
  verdictDetail: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function buildPostTradeTeamAndStats(
  team: TeamSummary,
  rosterStats: RosterPlayerStat[],
  removeIds: Set<string>,
  incoming: RosterPlayerStat[],
): { nextTeam: TeamSummary; nextStats: RosterPlayerStat[] } {
  const remaining = rosterStats.filter((p) => !removeIds.has(p.playerId));
  const incomingAsBench: RosterPlayerStat[] = incoming.map((p) => ({
    ...p,
    role: 'bench',
  }));
  const nextStats = [...remaining, ...incomingAsBench];

  const remainingIds = nextStats.map((p) => p.playerId);
  const reserveSet = new Set(team.rawReserveIds.filter((id) => !removeIds.has(id)));
  const playable = nextStats.filter((p) => !reserveSet.has(p.playerId));
  const bestIds = [...playable]
    .sort((a, b) => b.avgPoints - a.avgPoints)
    .slice(0, Math.max(1, team.rawStarterIds.length))
    .map((p) => p.playerId);

  const nextTeam: TeamSummary = {
    ...team,
    rawPlayerIds: remainingIds,
    rawStarterIds: bestIds,
    rawReserveIds: Array.from(reserveSet),
  };

  return { nextTeam, nextStats };
}

function computePositionalTotals(
  before: RosterPlayerStat[],
  after: RosterPlayerStat[],
  rosterPositions: string[],
): TradePosDelta[] {
  const upperSlots = rosterPositions.map((s) => s.trim().toUpperCase());
  return (['QB', 'RB', 'WR', 'TE'] as const).map((pos) => {
    const exactCount = upperSlots.filter((s) => s === pos).length;
    const slots = exactCount > 0 ? exactCount : pos === 'QB' || pos === 'TE' ? 1 : 2;
    const beforeSum = before
      .filter((p) => p.position === pos)
      .sort((a, b) => b.avgPoints - a.avgPoints)
      .slice(0, slots)
      .reduce((sum, p) => sum + p.avgPoints, 0);
    const afterSum = after
      .filter((p) => p.position === pos)
      .sort((a, b) => b.avgPoints - a.avgPoints)
      .slice(0, slots)
      .reduce((sum, p) => sum + p.avgPoints, 0);

    return {
      pos,
      beforePpg: round1(beforeSum),
      afterPpg: round1(afterSum),
      delta: round1(afterSum - beforeSum),
    };
  });
}

export function evaluateTradePackage(params: {
  teamA: TeamSummary;
  teamB: TeamSummary;
  rosterA: RosterPlayerStat[];
  rosterB: RosterPlayerStat[];
  sendIdsA: string[];
  sendIdsB: string[];
  faabA: number;
  faabB: number;
  rosterPositions: string[];
}): TradeEvaluationResult {
  const {
    teamA,
    teamB,
    rosterA,
    rosterB,
    sendIdsA,
    sendIdsB,
    faabA,
    faabB,
    rosterPositions,
  } = params;

  const sendSetA = new Set(sendIdsA);
  const sendSetB = new Set(sendIdsB);
  const sendingA = rosterA.filter((p) => sendSetA.has(p.playerId));
  const sendingB = rosterB.filter((p) => sendSetB.has(p.playerId));

  const ppgSendA = round1(sendingA.reduce((s, p) => s + p.avgPoints, 0));
  const ppgSendB = round1(sendingB.reduce((s, p) => s + p.avgPoints, 0));
  const seasonSendA = round1(sendingA.reduce((s, p) => s + p.seasonPoints, 0));
  const seasonSendB = round1(sendingB.reduce((s, p) => s + p.seasonPoints, 0));
  const packagePpgDiff = round1(ppgSendB - ppgSendA);

  const runLineup = (tm: TeamSummary, stats: RosterPlayerStat[]) =>
    optimizeTeamLineup({
      team: tm,
      week: 1,
      rosterPositions,
      rosterStats: stats,
      getProjection: () => null,
      isOnBye: () => false,
    }).optimalProjectedTotal;

  const starterBeforeA = round1(runLineup(teamA, rosterA));
  const starterBeforeB = round1(runLineup(teamB, rosterB));

  const postA = buildPostTradeTeamAndStats(teamA, rosterA, sendSetA, sendingB);
  const postB = buildPostTradeTeamAndStats(teamB, rosterB, sendSetB, sendingA);

  const starterAfterA = round1(runLineup(postA.nextTeam, postA.nextStats));
  const starterAfterB = round1(runLineup(postB.nextTeam, postB.nextStats));
  const starterDeltaA = round1(starterAfterA - starterBeforeA);
  const starterDeltaB = round1(starterAfterB - starterBeforeB);

  const deltaA = computePositionalTotals(rosterA, postA.nextStats, rosterPositions);
  const deltaB = computePositionalTotals(rosterB, postB.nextStats, rosterPositions);

  const hasAssets = sendingA.length > 0 || sendingB.length > 0 || faabA > 0 || faabB > 0;
  let verdictKind: TradeVerdictKind = 'idle';
  let verdictHeadline = 'Select Players to Evaluate';
  let verdictDetail = 'Pick players from either roster to see starting-lineup and package impact.';

  if (hasAssets) {
    if (sendingA.length === 0 && sendingB.length === 0) {
      const faabDiff = faabB - faabA;
      verdictKind = Math.abs(faabDiff) <= 5 ? 'even' : faabDiff > 0 ? 'favors-a' : 'favors-b';
      verdictHeadline =
        Math.abs(faabDiff) <= 5
          ? 'FAAB Swap Balanced'
          : faabDiff > 0
            ? `+$${faabDiff} FAAB → ${teamA.teamName}`
            : `+$${-faabDiff} FAAB → ${teamB.teamName}`;
      verdictDetail = 'Add players on either side to project weekly starting lineup impact.';
    } else if (starterDeltaA >= 0.8 && starterDeltaB >= 0.8) {
      verdictKind = 'win-win';
      verdictHeadline = `Win-Win Lineup Fit`;
      verdictDetail = `Both starting lineups improve (${teamA.teamName} +${starterDeltaA.toFixed(1)}, ${teamB.teamName} +${starterDeltaB.toFixed(1)} PPG).`;
    } else {
      const netLineupEdge = round1(starterDeltaA - starterDeltaB);
      if (Math.abs(netLineupEdge) < 1.2 && Math.abs(packagePpgDiff) < 1.5) {
        verdictKind = 'even';
        verdictHeadline = 'Balanced Swap';
        verdictDetail = `Within ${Math.max(Math.abs(netLineupEdge), Math.abs(packagePpgDiff)).toFixed(1)} PPG across optimal lineups & packages.`;
      } else if (netLineupEdge >= 1.2 || (Math.abs(netLineupEdge) < 1.2 && packagePpgDiff >= 1.5)) {
        verdictKind = 'favors-a';
        const metricLabel =
          Math.abs(starterDeltaA) >= 0.5
            ? `${starterDeltaA >= 0 ? '+' : ''}${starterDeltaA.toFixed(1)} Starter PPG`
            : `+${packagePpgDiff.toFixed(1)} Package PPG`;
        verdictHeadline = `Favors ${teamA.teamName} (${metricLabel})`;
        verdictDetail = `${teamA.teamName} optimal lineup: ${starterBeforeA.toFixed(1)} → ${starterAfterA.toFixed(1)} · ${teamB.teamName}: ${starterBeforeB.toFixed(1)} → ${starterAfterB.toFixed(1)} PPG.`;
      } else {
        verdictKind = 'favors-b';
        const metricLabel =
          Math.abs(starterDeltaB) >= 0.5
            ? `${starterDeltaB >= 0 ? '+' : ''}${starterDeltaB.toFixed(1)} Starter PPG`
            : `+${(-packagePpgDiff).toFixed(1)} Package PPG`;
        verdictHeadline = `Favors ${teamB.teamName} (${metricLabel})`;
        verdictDetail = `${teamB.teamName} optimal lineup: ${starterBeforeB.toFixed(1)} → ${starterAfterB.toFixed(1)} · ${teamA.teamName}: ${starterBeforeA.toFixed(1)} → ${starterAfterA.toFixed(1)} PPG.`;
      }
    }
  }

  return {
    teamA,
    teamB,
    rosterA,
    rosterB,
    sendingA,
    sendingB,
    ppgSendA,
    ppgSendB,
    seasonSendA,
    seasonSendB,
    packagePpgDiff,
    starterBeforeA,
    starterAfterA,
    starterDeltaA,
    starterBeforeB,
    starterAfterB,
    starterDeltaB,
    deltaA,
    deltaB,
    verdictKind,
    verdictHeadline,
    verdictDetail,
  };
}
