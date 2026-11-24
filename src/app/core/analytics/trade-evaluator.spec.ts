import { describe, expect, it } from 'vitest';
import { RosterPlayerStat, TeamSummary } from '../models/sleeper.models';
import { evaluateTradePackage } from './trade-evaluator';

function makeTeam(rosterId: number, name: string, starterIds: string[], playerIds: string[]): TeamSummary {
  return {
    rosterId,
    ownerId: `u${rosterId}`,
    managerName: `Mgr ${rosterId}`,
    teamName: name,
    avatarUrl: null,
    initials: name.slice(0, 2).toUpperCase(),
    wins: 4,
    losses: 2,
    ties: 0,
    winPct: 0.667,
    recordLabel: '4-2',
    pointsFor: 700,
    pointsAgainst: 650,
    maxPointsFor: 730,
    lineupEfficiencyPct: 95.8,
    pointDifferential: 50,
    streak: 'W1',
    allPlayWins: 20,
    allPlayLosses: 10,
    luckScore: 0,
    powerScore: 70,
    standingsRank: rosterId,
    powerRank: rosterId,
    pointsRank: rosterId,
    waiverMoves: 4,
    usesFaab: true,
    faabRemaining: 75,
    waiverPriority: rosterId,
    rosterSize: playerIds.length,
    starterCount: starterIds.length,
    medianScore: 115,
    stdDevScore: 10,
    boomWeeks: 2,
    benchPointsTotal: 80,
    closeWins: 0,
    closeLosses: 0,
    rawPlayerIds: playerIds,
    rawStarterIds: starterIds,
    rawReserveIds: [],
    weeklyScores: [],
    bestWeek: null,
    worstWeek: null,
  };
}

function stat(playerId: string, name: string, position: string, avgPoints: number, role: 'starter' | 'bench' = 'starter'): RosterPlayerStat {
  return {
    playerId,
    name,
    position,
    nflTeam: 'NFL',
    injuryStatus: null,
    role,
    seasonPoints: avgPoints * 6,
    avgPoints,
    gamesPlayed: 6,
    lastWeekPoints: avgPoints,
  };
}

describe('evaluateTradePackage', () => {
  it('captures true win-win lineup gains and avoids 2-for-1 bench distortion', () => {
    const teamA = makeTeam(1, 'Alpha', ['qbA', 'rbA1', 'wrA1'], ['qbA', 'rbA1', 'rbA2', 'wrA1']);
    const teamB = makeTeam(2, 'Beta', ['qbB', 'rbB1', 'wrB1'], ['qbB', 'rbB1', 'wrB1', 'wrB2']);

    const rosterA: RosterPlayerStat[] = [
      stat('qbA', 'QB A', 'QB', 20),
      stat('rbA1', 'RB Star A', 'RB', 21),
      stat('rbA2', 'RB Depth A', 'RB', 17, 'bench'),
      stat('wrA1', 'WR Weak A', 'WR', 9),
    ];
    const rosterB: RosterPlayerStat[] = [
      stat('qbB', 'QB B', 'QB', 19),
      stat('rbB1', 'RB Weak B', 'RB', 9),
      stat('wrB1', 'WR Star B', 'WR', 20),
      stat('wrB2', 'WR Depth B', 'WR', 16, 'bench'),
    ];

    const res = evaluateTradePackage({
      teamA,
      teamB,
      rosterA,
      rosterB,
      sendIdsA: ['rbA2'],
      sendIdsB: ['wrB2'],
      faabA: 0,
      faabB: 0,
      rosterPositions: ['QB', 'RB', 'WR'],
    });

    expect(res.starterDeltaA).toBe(7); // Alpha swaps WR 9 -> WR 16 (+7.0)
    expect(res.starterDeltaB).toBe(8); // Beta swaps RB 9 -> RB 17 (+8.0)
    expect(res.verdictKind).toBe('win-win');
    expect(res.deltaA.find((d) => d.pos === 'WR')?.delta).toBe(7);
  });

  it('evaluates 2-for-1 consolidation by true optimal starting lineup improvement', () => {
    const teamA = makeTeam(1, 'Alpha', ['qbA', 'rbA1', 'wrA1'], ['qbA', 'rbA1', 'rbA2', 'wrA1', 'wrA2']);
    const teamB = makeTeam(2, 'Beta', ['qbB', 'rbB1', 'wrB1'], ['qbB', 'rbB1', 'wrB1', 'wrB2']);

    const rosterA: RosterPlayerStat[] = [
      stat('qbA', 'QB A', 'QB', 20),
      stat('rbA1', 'RB Star A', 'RB', 20),
      stat('rbA2', 'RB Depth A', 'RB', 11, 'bench'),
      stat('wrA1', 'WR Flex A1', 'WR', 11),
      stat('wrA2', 'WR Flex A2', 'WR', 10, 'bench'),
    ];
    const rosterB: RosterPlayerStat[] = [
      stat('qbB', 'QB B', 'QB', 20),
      stat('rbB1', 'RB Weak B', 'RB', 7),
      stat('wrB1', 'WR Stud B', 'WR', 19),
      stat('wrB2', 'WR Bench B', 'WR', 6, 'bench'),
    ];

    // Alpha sends 2 bench flexes (21.0 PPG total) to Beta for 1 stud WR (19.0 PPG)
    const res = evaluateTradePackage({
      teamA,
      teamB,
      rosterA,
      rosterB,
      sendIdsA: ['rbA2', 'wrA2'],
      sendIdsB: ['wrB1'],
      faabA: 0,
      faabB: 0,
      rosterPositions: ['QB', 'RB', 'WR'],
    });

    expect(res.packagePpgDiff).toBe(-2); // Raw package shows -2 PPG against Alpha
    expect(res.starterDeltaA).toBe(8); // Yet Alpha's actual starters jump +8.0 PPG (11 -> 19)
    expect(res.starterDeltaB).toBe(-5); // Beta's starters drop -5.0 PPG (19+7 -> 11+10)
    expect(res.verdictKind).toBe('favors-a');
  });
});
