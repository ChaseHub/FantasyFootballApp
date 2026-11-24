import { describe, expect, it } from 'vitest';
import { buildPlayerAnalysis } from './player-analysis';
import { LeagueDashboardData, LeaguePlayerRow, PlayerMeta } from '../models/sleeper.models';

describe('buildPlayerAnalysis', () => {
  it('computes positional rank, started vs bench split, draft pedigree, transactions, and peers', () => {
    const p1: LeaguePlayerRow = {
      playerId: 'p1',
      name: 'Alpha QB',
      position: 'QB',
      nflTeam: 'BUF',
      injuryStatus: null,
      fantasyTeamName: 'Roster One',
      fantasyRosterId: 1,
      gamesPlayed: 3,
      seasonPoints: 72,
      avgPoints: 24,
      weeklyPoints: [
        { week: 1, points: 28 },
        { week: 2, points: 14 },
        { week: 3, points: 30 },
      ],
    };
    const p2: LeaguePlayerRow = {
      playerId: 'p2',
      name: 'Beta QB',
      position: 'QB',
      nflTeam: 'KC',
      injuryStatus: null,
      fantasyTeamName: 'Roster Two',
      fantasyRosterId: 2,
      gamesPlayed: 3,
      seasonPoints: 60,
      avgPoints: 20,
      weeklyPoints: [
        { week: 1, points: 20 },
        { week: 2, points: 20 },
        { week: 3, points: 20 },
      ],
    };

    const meta: PlayerMeta = {
      id: 'p1',
      name: 'Alpha QB',
      position: 'QB',
      nflTeam: 'BUF',
      injuryStatus: null,
      age: 28,
      yearsExp: 6,
      jersey: 17,
      college: 'Wyoming',
    };

    const dashboard = {
      teams: [
        {
          rosterId: 1,
          teamName: 'Roster One',
          rawStarterIds: ['p1'],
          rawReserveIds: [],
          weeklyScores: [
            { week: 1, starterIds: ['p1'], playerPoints: { p1: 28 } },
            { week: 2, starterIds: [], playerPoints: { p1: 14 } },
            { week: 3, starterIds: ['p1'], playerPoints: { p1: 30 } },
          ],
        },
        {
          rosterId: 2,
          teamName: 'Roster Two',
          rawStarterIds: ['p2'],
          rawReserveIds: [],
          weeklyScores: [],
        },
      ],
      draft: { settings: { rounds: 15, teams: 10 } },
      draftPicks: [
        {
          pick_no: 24,
          round: 3,
          draft_slot: 4,
          roster_id: 1,
          player_id: 'p1',
          picked_by: 'u1',
          is_keeper: false,
          metadata: { position: 'QB' },
        },
      ],
      transactions: [
        {
          transaction_id: 'tx1',
          type: 'trade',
          status: 'complete',
          leg: 2,
          created: 1760000000000,
          roster_ids: [1],
          adds: { p1: 1 },
          drops: null,
        },
      ],
    } as unknown as LeagueDashboardData;

    const report = buildPlayerAnalysis(p1, [p1, p2], meta, dashboard);
    expect(report.posRank).toBe(1);
    expect(report.currentSlotRole).toBe('Starter');
    expect(report.startedWeeks).toBe(2);
    expect(report.benchedWeeks).toBe(1);
    expect(report.startedPoints).toBe(58);
    expect(report.benchedPoints).toBe(14);
    expect(report.boomWeeks20).toBe(2);
    expect(report.medianPoints).toBe(28);
    expect(report.draftPedigree?.pickLabel).toBe('3.04');
    expect(report.draftPedigree?.posDraftRank).toBe(1);
    expect(report.transactions.length).toBe(1);
    expect(report.transactions[0].kind).toBe('Trade');
    expect(report.peers.length).toBe(2);
  });
});
