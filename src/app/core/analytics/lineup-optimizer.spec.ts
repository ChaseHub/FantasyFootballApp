import { describe, expect, it } from 'vitest';
import { optimizeTeamLineup } from './lineup-optimizer';
import { RosterPlayerStat, TeamSummary } from '../models/sleeper.models';

function makeTeam(starterIds: string[], playerIds: string[]): TeamSummary {
  return {
    rosterId: 1,
    ownerId: 'u1',
    managerName: 'Chase',
    teamName: 'Clubhouse One',
    avatarUrl: null,
    initials: 'CO',
    wins: 5,
    losses: 2,
    ties: 0,
    winPct: 0.714,
    recordLabel: '5-2',
    pointsFor: 850,
    pointsAgainst: 760,
    maxPointsFor: 900,
    lineupEfficiencyPct: 94.4,
    pointDifferential: 90,
    streak: 'W2',
    allPlayWins: 40,
    allPlayLosses: 16,
    luckScore: 0.4,
    powerScore: 76,
    standingsRank: 1,
    powerRank: 1,
    pointsRank: 1,
    waiverMoves: 8,
    usesFaab: true,
    faabRemaining: 80,
    waiverPriority: 1,
    rosterSize: playerIds.length,
    starterCount: starterIds.length,
    medianScore: 120,
    stdDevScore: 14,
    boomWeeks: 3,
    benchPointsTotal: 140,
    closeWins: 1,
    closeLosses: 0,
    rawPlayerIds: playerIds,
    rawStarterIds: starterIds,
    rawReserveIds: [],
    weeklyScores: [],
    bestWeek: null,
    worstWeek: null,
  };
}

function makeStat(playerId: string, name: string, position: string, nflTeam: string, avgPoints: number, injuryStatus: string | null = null, role: 'starter' | 'bench' = 'starter'): RosterPlayerStat {
  return {
    playerId,
    name,
    position,
    nflTeam,
    injuryStatus,
    role,
    seasonPoints: avgPoints * 7,
    avgPoints,
    gamesPlayed: 7,
    lastWeekPoints: avgPoints,
  };
}

describe('optimizeTeamLineup', () => {
  it('flags Bye/Out starters and finds optimal flex swap gain', () => {
    const team = makeTeam(['qb1', 'rb1', 'wr1', 'wr2'], ['qb1', 'rb1', 'wr1', 'wr2', 'rb2', 'wr3']);
    const stats: RosterPlayerStat[] = [
      makeStat('qb1', 'Josh Allen', 'QB', 'BUF', 23.0),
      makeStat('rb1', 'Saquon Barkley', 'RB', 'PHI', 21.0),
      makeStat('wr1', 'Injured WR', 'WR', 'DAL', 16.0, 'Out'),
      makeStat('wr2', 'Bye WR', 'WR', 'KC', 14.0),
      makeStat('rb2', 'Bench RB', 'RB', 'DET', 17.5, null, 'bench'),
      makeStat('wr3', 'Bench WR', 'WR', 'MIN', 15.2, null, 'bench'),
    ];
    const projections: Record<string, number> = {
      qb1: 24.0,
      rb1: 20.5,
      wr1: 0,
      wr2: 14.5,
      rb2: 18.2,
      wr3: 15.6,
    };

    const report = optimizeTeamLineup({
      team,
      week: 8,
      rosterPositions: ['QB', 'RB', 'WR', 'FLEX', 'BN', 'BN'],
      rosterStats: stats,
      getProjection: (id) => projections[id] ?? null,
      isOnBye: (nflTeam) => nflTeam === 'KC',
    });

    expect(report.usingProjectionFeed).toBe(true);
    expect(report.criticalAlerts.map((a) => a.playerId).sort()).toEqual(['wr1', 'wr2']);
    expect(report.optimalProjectedTotal).toBe(24.0 + 20.5 + 15.6 + 18.2);
    expect(report.potentialGain).toBeCloseTo(33.8, 1);
    expect(report.swaps.length).toBe(2);
  });

  it('reports optimal when current starters maximize weekly output', () => {
    const team = makeTeam(['qb1', 'rb1'], ['qb1', 'rb1', 'rb2']);
    const stats: RosterPlayerStat[] = [
      makeStat('qb1', 'Patrick Mahomes', 'QB', 'KC', 22.0),
      makeStat('rb1', 'Jahmyr Gibbs', 'RB', 'DET', 19.0),
      makeStat('rb2', 'Backup RB', 'RB', 'NYG', 8.0, null, 'bench'),
    ];

    const report = optimizeTeamLineup({
      team,
      week: 8,
      rosterPositions: ['QB', 'RB', 'BN'],
      rosterStats: stats,
      getProjection: () => null,
      isOnBye: () => false,
    });

    expect(report.usingProjectionFeed).toBe(false);
    expect(report.isOptimal).toBe(true);
    expect(report.potentialGain).toBe(0);
  });
});
