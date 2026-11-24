import { describe, expect, it } from 'vitest';
import { buildLeagueScheduleMatrix } from './schedule-analytics';
import { TeamSummary, WeeklyMatchupCard } from '../models/sleeper.models';

function team(rosterId: number, name: string, powerScore: number, standingsRank: number): TeamSummary {
  return {
    rosterId,
    ownerId: `u${rosterId}`,
    managerName: `Mgr ${rosterId}`,
    teamName: name,
    avatarUrl: null,
    initials: name.slice(0, 2).toUpperCase(),
    wins: 4 - standingsRank,
    losses: standingsRank,
    ties: 0,
    winPct: 0.5,
    recordLabel: '2-2',
    pointsFor: 500,
    pointsAgainst: 480,
    maxPointsFor: 520,
    lineupEfficiencyPct: 96,
    pointDifferential: 20,
    streak: 'W1',
    allPlayWins: 10,
    allPlayLosses: 6,
    luckScore: 0,
    powerScore,
    standingsRank,
    powerRank: standingsRank,
    pointsRank: standingsRank,
    waiverMoves: 2,
    usesFaab: false,
    faabRemaining: 0,
    waiverPriority: rosterId,
    rosterSize: 10,
    starterCount: 7,
    medianScore: 115,
    stdDevScore: 10,
    boomWeeks: 1,
    benchPointsTotal: 60,
    closeWins: 0,
    closeLosses: 0,
    rawPlayerIds: [],
    rawStarterIds: [],
    rawReserveIds: [],
    weeklyScores: [],
    bestWeek: null,
    worstWeek: null,
  };
}

describe('buildLeagueScheduleMatrix', () => {
  it('computes played, remaining, and playoff window SoS ratings', () => {
    const teams = [
      team(1, 'Juggernaut', 82, 1),
      team(2, 'Contender', 60, 2),
      team(3, 'Underdog', 34, 3),
    ];

    const past: Record<number, WeeklyMatchupCard[]> = {
      1: [
        {
          matchupId: 1,
          week: 1,
          status: 'Final',
          isCompleted: true,
          margin: 15,
          home: {
            rosterId: 1,
            teamName: 'Juggernaut',
            managerName: 'Mgr 1',
            avatarUrl: null,
            initials: 'JU',
            recordLabel: '1-0',
            points: 130,
            isWinner: true,
            starterIds: [],
            playerPoints: {},
          },
          away: {
            rosterId: 3,
            teamName: 'Underdog',
            managerName: 'Mgr 3',
            avatarUrl: null,
            initials: 'UN',
            recordLabel: '0-1',
            points: 115,
            isWinner: false,
            starterIds: [],
            playerPoints: {},
          },
        },
      ],
    };

    const future: Record<number, Array<[number, number]>> = {
      2: [[2, 1]],
      15: [[1, 3]],
    };

    const matrix = buildLeagueScheduleMatrix({
      teams,
      weeklyMatchups: past,
      futureMatchups: future,
      currentWeek: 2,
      playoffStartWeek: 15,
    });

    expect(matrix.weeks).toEqual([1, 2, 15]);
    expect(matrix.toughestRos?.rosterId).toBe(2);
    const juggernaut = matrix.rows.find((r) => r.rosterId === 1)!;
    expect(juggernaut.playedTier).toBe('Easy');
    expect(juggernaut.playoffAvgPower).toBe(34);
  });
});
