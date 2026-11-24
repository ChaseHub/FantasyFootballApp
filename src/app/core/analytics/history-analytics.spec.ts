import { describe, expect, it } from 'vitest';
import { HistoricalSeasonSnapshot, computeAllTimeLeagueHistory } from './history-analytics';

describe('computeAllTimeLeagueHistory', () => {
  it('merges multi-season champions, manager careers, records, and H2H matrix by owner_id', () => {
    const snapshots: HistoricalSeasonSnapshot[] = [
      {
        league: {
          league_id: 'lg-2025',
          name: 'Clubhouse Dynasty',
          season: '2025',
          status: 'complete',
          sport: 'nfl',
          total_rosters: 2,
          avatar: null,
          previous_league_id: null,
          roster_positions: ['QB'],
          scoring_settings: { rec: 1 },
          settings: { playoff_teams: 2, playoff_week_start: 15 },
        },
        users: [
          { user_id: 'u1', display_name: 'Chase', avatar: null, metadata: { team_name: 'Old Chase' } },
          { user_id: 'u2', display_name: 'Alex', avatar: null, metadata: { team_name: 'Old Alex' } },
        ],
        rosters: [
          { roster_id: 1, owner_id: 'u1', players: null, starters: null, settings: { wins: 10, losses: 4, ties: 0, fpts: 1650, fpts_against: 1400 } },
          { roster_id: 2, owner_id: 'u2', players: null, starters: null, settings: { wins: 8, losses: 6, ties: 0, fpts: 1520, fpts_against: 1580 } },
        ],
        winnersBracket: [{ r: 1, m: 1, t1: 1, t2: 2, w: 1, l: 2, p: 1 }],
        matchupsByWeek: {
          1: [
            { roster_id: 1, matchup_id: 1, points: 148.5, starters: null, players: null },
            { roster_id: 2, matchup_id: 1, points: 112.0, starters: null, players: null },
          ],
          15: [
            { roster_id: 1, matchup_id: 1, points: 134.2, starters: null, players: null },
            { roster_id: 2, matchup_id: 1, points: 130.1, starters: null, players: null },
          ],
        },
      },
      {
        league: {
          league_id: 'lg-2026',
          name: 'Clubhouse Dynasty',
          season: '2026',
          status: 'complete',
          sport: 'nfl',
          total_rosters: 2,
          avatar: null,
          previous_league_id: 'lg-2025',
          roster_positions: ['QB'],
          scoring_settings: { rec: 1 },
          settings: { playoff_teams: 2, playoff_week_start: 15 },
        },
        users: [
          { user_id: 'u1', display_name: 'Chase', avatar: null, metadata: { team_name: 'New Chase' } },
          { user_id: 'u2', display_name: 'Alex', avatar: null, metadata: { team_name: 'New Alex' } },
        ],
        rosters: [
          { roster_id: 1, owner_id: 'u1', players: null, starters: null, settings: { wins: 7, losses: 7, ties: 0, fpts: 1500, fpts_against: 1510 } },
          { roster_id: 2, owner_id: 'u2', players: null, starters: null, settings: { wins: 11, losses: 3, ties: 0, fpts: 1740, fpts_against: 1390 } },
        ],
        winnersBracket: [{ r: 1, m: 1, t1: 1, t2: 2, w: 2, l: 1, p: 1 }],
        matchupsByWeek: {
          2: [
            { roster_id: 1, matchup_id: 1, points: 101.0, starters: null, players: null },
            { roster_id: 2, matchup_id: 1, points: 140.5, starters: null, players: null },
          ],
        },
      },
    ];

    const history = computeAllTimeLeagueHistory(snapshots);
    expect(history.seasonsCount).toBe(2);
    expect(history.hallOfChampions[0].season).toBe('2026');
    expect(history.hallOfChampions[0].champTeamName).toBe('New Alex');
    expect(history.hallOfChampions[1].champTeamName).toBe('Old Chase');
    expect(history.hallOfChampions[1].titleScore).toBe('134.2–130.1');

    const chase = history.managers.find((m) => m.managerKey === 'u:u1');
    const alex = history.managers.find((m) => m.managerKey === 'u:u2');
    expect(chase?.latestTeamName).toBe('New Chase');
    expect(chase?.titles).toBe(1);
    expect(chase?.wins).toBe(17);
    expect(alex?.titles).toBe(1);

    const h2h = history.h2hMatrix['u:u1']['u:u2'];
    expect(h2h.wins).toBe(2);
    expect(h2h.losses).toBe(1);
    expect(h2h.streak).toBe('L1');

    expect(history.records.find((r) => r.id === 'high-week')?.stat).toBe('148.50 pts');
    expect(history.records.find((r) => r.id === 'top-season')?.stat).toBe('1740.0 PF');
  });
});
