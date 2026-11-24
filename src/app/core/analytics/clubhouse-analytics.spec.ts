import { describe, expect, it } from 'vitest';
import { computeTeamWeeklyAllPlay } from '../analytics/clubhouse-analytics';
import { TeamSummary, TeamWeeklyScore } from '../models/sleeper.models';

function makeWeek(
  week: number,
  points: number,
  oppId: number,
  oppName: string,
  oppPts: number,
  avg: number,
  rank: number,
): TeamWeeklyScore {
  return {
    week,
    points,
    opponentPoints: oppPts,
    opponentName: oppName,
    opponentRosterId: oppId,
    leagueAverage: avg,
    leagueRankThatWeek: rank,
    leagueSizeThatWeek: 4,
    result: points > oppPts ? 'W' : points < oppPts ? 'L' : 'T',
    margin: Math.round(Math.abs(points - oppPts) * 100) / 100,
    benchPoints: 0,
    starterIds: [],
    playerPoints: {},
  };
}

function makeTeam(
  rosterId: number,
  teamName: string,
  wins: number,
  losses: number,
  weeklyScores: TeamWeeklyScore[],
): TeamSummary {
  return {
    rosterId,
    ownerId: `u${rosterId}`,
    managerName: teamName,
    teamName,
    avatarUrl: null,
    initials: `T${rosterId}`,
    wins,
    losses,
    ties: 0,
    winPct: wins / Math.max(1, wins + losses),
    recordLabel: `${wins}-${losses}`,
    pointsFor: weeklyScores.reduce((s, w) => s + w.points, 0),
    pointsAgainst: weeklyScores.reduce((s, w) => s + (w.opponentPoints ?? 0), 0),
    maxPointsFor: 0,
    lineupEfficiencyPct: 95,
    pointDifferential: 0,
    streak: 'W1',
    allPlayWins: 0,
    allPlayLosses: 0,
    luckScore: 0,
    powerScore: 80,
    standingsRank: rosterId,
    powerRank: rosterId,
    pointsRank: rosterId,
    waiverMoves: 0,
    usesFaab: false,
    faabRemaining: 100,
    waiverPriority: rosterId,
    rosterSize: 10,
    starterCount: 8,
    medianScore: 110,
    stdDevScore: 10,
    boomWeeks: 0,
    benchPointsTotal: 0,
    closeWins: 0,
    closeLosses: 0,
    rawPlayerIds: [],
    rawStarterIds: [],
    rawReserveIds: [],
    weeklyScores,
    bestWeek: null,
    worstWeek: null,
  };
}

describe('computeTeamWeeklyAllPlay', () => {
  it('calculates weekly league placement, all-play W-L, expected wins, and robbed/heist verdicts', () => {
    const teams: TeamSummary[] = [
      // Week 1: A=140 (#2, loses to B=150 -> Robbed), Week 2: A=95 (#3, beats D=80 -> Stolen W), Week 3: A=160 (#1, beats C=100 -> Crown)
      makeTeam(1, 'Alpha', 2, 1, [
        makeWeek(1, 140, 2, 'Bravo', 150, 120, 2),
        makeWeek(2, 95, 4, 'Delta', 80, 105, 3),
        makeWeek(3, 160, 3, 'Charlie', 100, 115, 1),
      ]),
      makeTeam(2, 'Bravo', 2, 1, [
        makeWeek(1, 150, 1, 'Alpha', 140, 120, 1),
        makeWeek(2, 130, 3, 'Charlie', 115, 105, 1),
        makeWeek(3, 90, 4, 'Delta', 110, 115, 4),
      ]),
      makeTeam(3, 'Charlie', 1, 2, [
        makeWeek(1, 100, 4, 'Delta', 90, 120, 3),
        makeWeek(2, 115, 2, 'Bravo', 130, 105, 2),
        makeWeek(3, 100, 1, 'Alpha', 160, 115, 3),
      ]),
      makeTeam(4, 'Delta', 1, 2, [
        makeWeek(1, 90, 3, 'Charlie', 100, 120, 4),
        makeWeek(2, 80, 1, 'Alpha', 95, 105, 4),
        makeWeek(3, 110, 2, 'Bravo', 90, 115, 2),
      ]),
    ];

    const report = computeTeamWeeklyAllPlay(teams, 1);
    expect(report).not.toBeNull();
    expect(report!.totalAllPlayWins).toBe(6); // W1: 2-1, W2: 1-2, W3: 3-0 => 6-3
    expect(report!.totalAllPlayLosses).toBe(3);
    expect(report!.expectedWins).toBe(2); // (2/3 + 1/3 + 3/3) = 2.0
    expect(report!.luckDeltaWins).toBe(0); // 2 actual - 2.0 xW
    expect(report!.avgRank).toBe(2); // (2 + 3 + 1) / 3 = 2.0
    expect(report!.crownWeeks).toBe(1);
    expect(report!.robbedWeeks).toBe(1);
    expect(report!.heistWeeks).toBe(1);

    expect(report!.weeks[0].placementRank).toBe(2);
    expect(report!.weeks[0].verdict).toBe('robbed');
    expect(report!.weeks[1].placementRank).toBe(3);
    expect(report!.weeks[1].verdict).toBe('heist');
    expect(report!.weeks[2].placementRank).toBe(1);
    expect(report!.weeks[2].verdict).toBe('crown');
  });
});
