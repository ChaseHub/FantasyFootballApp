import { describe, expect, it } from 'vitest';
import { runPlayoffMonteCarlo } from './playoff-simulator';
import { TeamSummary } from '../models/sleeper.models';

function mockTeam(rosterId: number, name: string, wins: number, losses: number, pf: number): TeamSummary {
  const g = Math.max(1, wins + losses);
  return {
    rosterId,
    ownerId: `u${rosterId}`,
    managerName: name,
    teamName: name,
    avatarUrl: null,
    initials: `T${rosterId}`,
    wins,
    losses,
    ties: 0,
    winPct: wins / g,
    recordLabel: `${wins}-${losses}`,
    pointsFor: pf,
    pointsAgainst: 110 * g,
    maxPointsFor: pf + 50,
    lineupEfficiencyPct: 95,
    pointDifferential: pf - 110 * g,
    streak: wins > losses ? 'W2' : 'L1',
    allPlayWins: wins * 3,
    allPlayLosses: losses * 3,
    luckScore: 0,
    powerScore: 80,
    standingsRank: rosterId,
    powerRank: rosterId,
    pointsRank: rosterId,
    waiverMoves: 1,
    usesFaab: false,
    faabRemaining: 100,
    waiverPriority: rosterId,
    rosterSize: 12,
    starterCount: 8,
    medianScore: pf / g,
    stdDevScore: 18,
    boomWeeks: 2,
    benchPointsTotal: 60,
    closeWins: 1,
    closeLosses: 0,
    rawPlayerIds: [],
    rawStarterIds: [],
    rawReserveIds: [],
    weeklyScores: [],
    bestWeek: null,
    worstWeek: null,
  };
}

describe('runPlayoffMonteCarlo', () => {
  it('simulates playoff %, bye %, and title % with stronger teams leading probability', () => {
    const teams: TeamSummary[] = [
      mockTeam(1, 'Juggernaut', 10, 1, 1650),
      mockTeam(2, 'Contender', 8, 3, 1480),
      mockTeam(3, 'Bubble A', 6, 5, 1320),
      mockTeam(4, 'Bubble B', 5, 6, 1260),
      mockTeam(5, 'Chaser', 4, 7, 1180),
      mockTeam(6, 'Basement', 1, 10, 920),
    ];

    const res = runPlayoffMonteCarlo(teams, {}, 4, 15, 11, 800, 1);
    expect(res).not.toBeNull();
    expect(res!.remainingWeeks).toBe(3);
    expect(res!.rows.length).toBe(6);

    const top = res!.rows.find((r) => r.rosterId === 1)!;
    const bottom = res!.rows.find((r) => r.rosterId === 6)!;
    expect(top.playoffPct).toBeGreaterThan(95);
    expect(top.titlePct).toBeGreaterThan(bottom.titlePct);
    expect(bottom.playoffPct).toBeLessThan(10);

    const totalTitlePct = res!.rows.reduce((s, r) => s + r.titlePct, 0);
    expect(totalTitlePct).toBeGreaterThan(99);
    expect(totalTitlePct).toBeLessThan(101);
  });
});
