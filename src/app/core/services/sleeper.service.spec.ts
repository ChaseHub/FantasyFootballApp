import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  computeLeagueAwards,
  computeMedianStandings,
  computeOptimalLineupRankings,
} from '../analytics/clubhouse-analytics';
import { TeamSummary } from '../models/sleeper.models';
import { SleeperService } from './sleeper.service';

describe('SleeperService', () => {
  let service: SleeperService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SleeperService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('starts unconfigured when no saved league exists', () => {
    service.initialize();
    expect(service.dashboard()).toBeNull();
    expect(service.loading()).toBe(false);
  });

  it('fetches live league, trades, draft picks, schedule swap matrix, and preserves season history', async () => {
    const load2026 = service.loadLeague('2026_id', 'u1');

    httpMock.expectOne('https://api.sleeper.app/v1/league/2026_id').flush({
      league_id: '2026_id',
      name: 'Sunday Hustle',
      season: '2026',
      status: 'in_season',
      sport: 'nfl',
      total_rosters: 2,
      avatar: null,
      previous_league_id: '2025_id',
      roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN'],
      scoring_settings: { rec: 1 },
      settings: { leg: 1, last_scored_leg: 1, playoff_teams: 2, waiver_budget: 100, waiver_type: 2 },
    });

    httpMock.expectOne('https://api.sleeper.app/v1/league/2026_id/users').flush([
      { user_id: 'u1', display_name: 'Alice', avatar: null, metadata: { team_name: 'Alpha' } },
      { user_id: 'u2', display_name: 'Bob', avatar: null, metadata: { team_name: 'Bravo' } },
    ]);

    httpMock.expectOne('https://api.sleeper.app/v1/league/2026_id/rosters').flush([
      {
        roster_id: 1,
        owner_id: 'u1',
        players: ['p1', 'p3'],
        starters: ['p1'],
        settings: {
          wins: 1,
          losses: 0,
          ties: 0,
          fpts: 120,
          fpts_decimal: 50,
          fpts_against: 99,
          fpts_against_decimal: 25,
          ppts: 130,
          ppts_decimal: 0,
        },
      },
      {
        roster_id: 2,
        owner_id: 'u2',
        players: ['p2', 'p4'],
        starters: ['p2'],
        settings: {
          wins: 0,
          losses: 1,
          ties: 0,
          fpts: 99,
          fpts_decimal: 25,
          fpts_against: 120,
          fpts_against_decimal: 50,
          ppts: 115,
          ppts_decimal: 0,
        },
      },
    ]);

    httpMock.expectOne('https://api.sleeper.app/v1/state/nfl').flush({
      season: '2026',
      season_type: 'regular',
      week: 1,
      display_week: 1,
      leg: 1,
    });

    httpMock.expectOne('https://api.sleeper.app/v1/league/2026_id/traded_picks').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/2026_id/winners_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/2026_id/losers_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/2026_id/drafts').flush([
      {
        draft_id: 'dr_2026',
        league_id: '2026_id',
        type: 'snake',
        status: 'complete',
        season: '2026',
        settings: { rounds: 1, teams: 2 },
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 0));

    httpMock.expectOne('https://api.sleeper.app/v1/league/2026_id/matchups/1').flush([
      {
        roster_id: 1,
        matchup_id: 1,
        points: 120.5,
        starters: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
        players: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
        players_points: {
          p1: 18,
          p2: 12,
          p3: 28,
          p4: 9,
          p5: 15,
          p6: 11,
          p7: 14,
          p8: 25,
        },
      },
      {
        roster_id: 2,
        matchup_id: 1,
        points: 99.25,
        starters: ['p2'],
        players: ['p2', 'p4'],
        players_points: { p2: 99.25, p4: 8.5 },
      },
    ]);

    httpMock.expectOne('https://api.sleeper.app/v1/league/2026_id/transactions/1').flush([
      {
        transaction_id: 'tx1',
        type: 'trade',
        status: 'complete',
        leg: 1,
        created: 1700000000000,
        roster_ids: [1, 2],
        adds: { p1: 2, p2: 1 },
        drops: null,
        draft_picks: [],
        waiver_budget: [{ sender: 1, receiver: 2, amount: 15 }],
      },
    ]);

    httpMock.expectOne('https://api.sleeper.app/v1/draft/dr_2026/picks').flush([
      {
        round: 1,
        roster_id: 1,
        player_id: 'p1',
        picked_by: 'u1',
        pick_no: 1,
        draft_slot: 1,
        metadata: { first_name: 'Josh', last_name: 'Allen', position: 'QB', team: 'BUF' },
      },
    ]);

    await load2026;

    // Background previous_league_id lookup
    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock.expectOne('https://api.sleeper.app/v1/league/2025_id').flush({
      league_id: '2025_id',
      name: 'Sunday Hustle',
      season: '2025',
      status: 'complete',
      sport: 'nfl',
      total_rosters: 2,
      avatar: null,
      previous_league_id: null,
      roster_positions: ['QB', 'RB'],
      scoring_settings: { rec: 1 },
      settings: {},
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.seasons().map((s) => s.season)).toEqual(['2026', '2025']);
    expect(service.buildLeagueTrades().length).toBe(1);
    expect(service.buildLeagueTrades()[0].sides[1].faabReceived).toBe(15);
    expect(service.draftPicksView().length).toBe(1);
    expect(service.draftPicksView()[0].playerName).toBe('Josh Allen');

    // Verify starter lineup is ordered QB -> RB -> WR -> TE -> FLX -> K -> DEF, not by points!
    const lineup = service.buildWeeklyLineup(service.teams()[0].weeklyScores[0]);
    const starterSlots = lineup.filter((e) => e.isStarter).map((e) => e.slotLabel);
    expect(starterSlots).toEqual(['QB', 'RB', 'WR', 'TE', 'FLX', 'K', 'DEF']);

    // Verify array-formatted Sleeper projections parse properly + bye team detection
    service.ensureWeekProjections('2026', 1);
    const projReq = httpMock.expectOne(
      (r) => r.url.includes('sleeper-projections') || r.url.includes('projections/nfl'),
    );
    projReq.flush([
      { player_id: 'p1', team: 'BUF', opponent: 'KC', stats: { pts_ppr: 22.4 } },
      { player_id: 'p2', team: 'KC', opponent: 'BUF', stats: { pts_ppr: 16.8 } },
      { player_id: 'x1', team: 'DET', opponent: 'GB', stats: { pts_ppr: 10 } },
      { player_id: 'x2', team: 'GB', opponent: 'DET', stats: { pts_ppr: 10 } },
      { player_id: 'x3', team: 'SF', opponent: 'LAR', stats: { pts_ppr: 10 } },
      { player_id: 'x4', team: 'LAR', opponent: 'SF', stats: { pts_ppr: 10 } },
      { player_id: 'x5', team: 'PHI', opponent: 'DAL', stats: { pts_ppr: 10 } },
      { player_id: 'x6', team: 'DAL', opponent: 'PHI', stats: { pts_ppr: 10 } },
      { player_id: 'x7', team: 'BAL', opponent: 'CIN', stats: { pts_ppr: 10 } },
      { player_id: 'x8', team: 'CIN', opponent: 'BAL', stats: { pts_ppr: 10 } },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(service.getPlayerProjection('p1', '2026', 1)).toBe(22.4);
    expect(service.getSideProjectedTotal(['p1', 'p2'], '2026', 1)).toBe(39.2);
    expect(service.isPlayerOnBye('MIN', '2026', 1)).toBe(true);
    expect(service.isPlayerOnBye('BUF', '2026', 1)).toBe(false);

    // Switch back to 2025 and verify 2026 option stays in seasons()!
    const load2025 = service.loadLeague('2025_id');
    httpMock.expectOne('https://api.sleeper.app/v1/league/2025_id').flush({
      league_id: '2025_id',
      name: 'Sunday Hustle',
      season: '2025',
      status: 'complete',
      sport: 'nfl',
      total_rosters: 2,
      avatar: null,
      previous_league_id: null,
      roster_positions: ['QB', 'RB'],
      scoring_settings: { rec: 1 },
      settings: { last_scored_leg: 1 },
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/2025_id/users').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/2025_id/rosters').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/state/nfl').flush({
      season: '2026',
      season_type: 'regular',
      week: 1,
      display_week: 1,
      leg: 1,
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/2025_id/traded_picks').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/2025_id/winners_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/2025_id/losers_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/2025_id/drafts').flush([]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock.expectOne('https://api.sleeper.app/v1/league/2025_id/matchups/1').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/2025_id/transactions/1').flush([]);

    await load2025;
    expect(service.seasons().map((s) => s.season)).toEqual(['2026', '2025']);
  });

  it('excludes in-progress or upcoming weeks from completed-week stats and schedule swaps', async () => {
    const loadPromise = service.loadLeague('555');

    httpMock.expectOne('https://api.sleeper.app/v1/league/555').flush({
      league_id: '555',
      name: 'Live Week Test',
      season: '2026',
      status: 'in_season',
      sport: 'nfl',
      total_rosters: 2,
      avatar: null,
      roster_positions: ['QB'],
      scoring_settings: { rec: 1 },
      settings: { leg: 2, last_scored_leg: 1, playoff_teams: 2 },
    });

    httpMock.expectOne('https://api.sleeper.app/v1/league/555/users').flush([
      { user_id: 'u1', display_name: 'Alice', avatar: null, metadata: { team_name: 'Alpha' } },
      { user_id: 'u2', display_name: 'Bob', avatar: null, metadata: { team_name: 'Bravo' } },
    ]);

    httpMock.expectOne('https://api.sleeper.app/v1/league/555/rosters').flush([
      {
        roster_id: 1,
        owner_id: 'u1',
        players: ['p1'],
        starters: ['p1'],
        settings: { wins: 1, losses: 0, ties: 0, fpts: 140, fpts_decimal: 0, fpts_against: 110, fpts_against_decimal: 0 },
      },
      {
        roster_id: 2,
        owner_id: 'u2',
        players: ['p2'],
        starters: ['p2'],
        settings: { wins: 0, losses: 1, ties: 0, fpts: 110, fpts_decimal: 0, fpts_against: 140, fpts_against_decimal: 0 },
      },
    ]);

    httpMock.expectOne('https://api.sleeper.app/v1/state/nfl').flush({
      season: '2026',
      season_type: 'regular',
      week: 2,
      display_week: 2,
      leg: 2,
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/555/traded_picks').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/555/winners_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/555/losers_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/555/drafts').flush([]);

    await new Promise((resolve) => setTimeout(resolve, 0));

    httpMock.expectOne('https://api.sleeper.app/v1/league/555/matchups/1').flush([
      { roster_id: 1, matchup_id: 1, points: 140.0, starters: ['p1'], players: ['p1'], players_points: { p1: 140 } },
      { roster_id: 2, matchup_id: 1, points: 110.0, starters: ['p2'], players: ['p2'], players_points: { p2: 110 } },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/555/matchups/2').flush([
      { roster_id: 1, matchup_id: 1, points: 14.5, starters: ['p1'], players: ['p1'], players_points: { p1: 14.5 } },
      { roster_id: 2, matchup_id: 1, points: 0, starters: ['p2'], players: ['p2'], players_points: { p2: 0 } },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/555/transactions/1').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/555/transactions/2').flush([]);

    await loadPromise;

    const data = service.dashboard()!;
    expect(data.currentWeek).toBe(2);
    expect(data.completedWeek).toBe(1);
    expect(data.weeklyMatchups[2]?.[0].status).toBe('Live');
    expect(data.weeklyMatchups[2]?.[0].isCompleted).toBe(false);

    expect(data.weeklyLeagueAverages.length).toBe(1);
    expect(data.teams[0].weeklyScores.length).toBe(1);
    expect(data.teams[0].worstWeek?.points).toBe(140);
    expect(data.teams[1].worstWeek?.points).toBe(110);
  });

  it('tiebreaks Heartbreak Award by tightest loss margin and surfaces closest week details', () => {
    const makeTeam = (
      rosterId: number,
      teamName: string,
      closeLosses: number,
      scores: Array<{ week: number; margin: number; points: number; opp: number }>,
    ): TeamSummary => ({
      rosterId,
      ownerId: `u${rosterId}`,
      managerName: teamName,
      teamName,
      avatarUrl: null,
      initials: 'T',
      wins: 3,
      losses: 3,
      ties: 0,
      winPct: 0.5,
      recordLabel: '3-3',
      pointsFor: 500,
      pointsAgainst: 500,
      maxPointsFor: 550,
      lineupEfficiencyPct: 90,
      pointDifferential: 0,
      streak: '1L',
      allPlayWins: 10,
      allPlayLosses: 10,
      luckScore: 0,
      powerScore: 50,
      standingsRank: rosterId,
      powerRank: rosterId,
      pointsRank: rosterId,
      waiverMoves: 5,
      usesFaab: true,
      faabRemaining: 80,
      waiverPriority: 1,
      rosterSize: 10,
      starterCount: 8,
      medianScore: 110,
      stdDevScore: 10,
      boomWeeks: 1,
      benchPointsTotal: 40,
      closeWins: 0,
      closeLosses,
      rawPlayerIds: [],
      rawStarterIds: [],
      rawReserveIds: [],
      bestWeek: null,
      worstWeek: null,
      weeklyScores: scores.map((s) => ({
        week: s.week,
        points: s.points,
        opponentPoints: s.opp,
        opponentName: 'Rival',
        opponentRosterId: 9,
        leagueAverage: 110,
        leagueRankThatWeek: 4,
        leagueSizeThatWeek: 8,
        result: 'L' as const,
        margin: s.margin,
        benchPoints: 10,
        starterIds: [],
        playerPoints: {},
      })),
    });

    const awards = computeLeagueAwards([
      makeTeam(1, 'Alpha', 2, [
        { week: 1, margin: -3.2, points: 110, opp: 113.2 },
        { week: 3, margin: -4.1, points: 105, opp: 109.1 },
      ]),
      makeTeam(2, 'Bravo', 2, [
        { week: 5, margin: -0.42, points: 118.2, opp: 118.62 },
        { week: 6, margin: -3.9, points: 101, opp: 104.9 },
      ]),
      makeTeam(3, 'Charlie', 1, [{ week: 2, margin: -0.12, points: 121.04, opp: 121.16 }]),
    ]);

    const heartbreak = awards.find((a) => a.id === 'heartbreak');
    expect(heartbreak?.teamName).toBe('Bravo');
    expect(heartbreak?.stat).toBe('2 close losses');
    expect(heartbreak?.explanation).toContain('-0.42 pts in Week 5');

    const tightest = awards.find((a) => a.id === 'tightest-loss');
    expect(tightest?.teamName).toBe('Charlie');
    expect(tightest?.stat).toBe('-0.12 pts');
    expect(tightest?.explanation).toContain('Week 2');
  });

  it('refreshWeek updates live week scores and timestamp without resetting selectedWeek', async () => {
    const loadPromise = service.loadLeague('lg_live', 'u1');

    httpMock.expectOne('https://api.sleeper.app/v1/league/lg_live').flush({
      league_id: 'lg_live',
      name: 'Live Test',
      season: '2026',
      status: 'in_season',
      sport: 'nfl',
      total_rosters: 2,
      avatar: null,
      previous_league_id: null,
      roster_positions: ['QB', 'BN'],
      scoring_settings: { rec: 1 },
      settings: { leg: 2, last_scored_leg: 1, playoff_teams: 2 },
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/lg_live/users').flush([
      { user_id: 'u1', display_name: 'Alice', avatar: null, metadata: { team_name: 'Alpha' } },
      { user_id: 'u2', display_name: 'Bob', avatar: null, metadata: { team_name: 'Bravo' } },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/lg_live/rosters').flush([
      { roster_id: 1, owner_id: 'u1', players: ['p1'], starters: ['p1'], settings: { wins: 1, losses: 0, ties: 0 } },
      { roster_id: 2, owner_id: 'u2', players: ['p2'], starters: ['p2'], settings: { wins: 0, losses: 1, ties: 0 } },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/state/nfl').flush({
      season: '2026',
      season_type: 'regular',
      week: 2,
      display_week: 2,
      leg: 2,
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/lg_live/traded_picks').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/lg_live/winners_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/lg_live/losers_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/lg_live/drafts').flush([]);

    await new Promise((resolve) => setTimeout(resolve, 0));

    httpMock.expectOne('https://api.sleeper.app/v1/league/lg_live/matchups/1').flush([
      { roster_id: 1, matchup_id: 1, points: 110, starters: ['p1'], players: ['p1'], players_points: { p1: 110 } },
      { roster_id: 2, matchup_id: 1, points: 90, starters: ['p2'], players: ['p2'], players_points: { p2: 90 } },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/lg_live/matchups/2').flush([
      { roster_id: 1, matchup_id: 1, points: 54.2, starters: ['p1'], players: ['p1'], players_points: { p1: 54.2 } },
      { roster_id: 2, matchup_id: 1, points: 48.0, starters: ['p2'], players: ['p2'], players_points: { p2: 48.0 } },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/lg_live/transactions/1').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/lg_live/transactions/2').flush([]);

    await loadPromise;

    expect(service.selectedWeek()).toBe(2);
    expect(service.currentWeekMatchups()[0].home.points).toBe(54.2);
    expect(service.currentWeekMatchups()[0].status).toBe('Live');

    const refreshPromise = service.refreshWeek(2);
    expect(service.refreshing()).toBe(true);

    httpMock.expectOne('https://api.sleeper.app/v1/league/lg_live').flush({
      league_id: 'lg_live',
      name: 'Live Test',
      season: '2026',
      status: 'in_season',
      sport: 'nfl',
      total_rosters: 2,
      avatar: null,
      previous_league_id: null,
      roster_positions: ['QB', 'BN'],
      scoring_settings: { rec: 1 },
      settings: { leg: 2, last_scored_leg: 1, playoff_teams: 2 },
    });
    httpMock.expectOne('https://api.sleeper.app/v1/state/nfl').flush({
      season: '2026',
      season_type: 'regular',
      week: 2,
      display_week: 2,
      leg: 2,
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/lg_live/matchups/2').flush([
      { roster_id: 1, matchup_id: 1, points: 88.75, starters: ['p1'], players: ['p1'], players_points: { p1: 88.75 } },
      { roster_id: 2, matchup_id: 1, points: 61.5, starters: ['p2'], players: ['p2'], players_points: { p2: 61.5 } },
    ]);

    await refreshPromise;
    for (const req of httpMock.match((r) => r.url.includes('projections'))) {
      req.flush([]);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.refreshing()).toBe(false);
    expect(service.selectedWeek()).toBe(2);
    expect(service.currentWeekMatchups()[0].home.points).toBe(88.75);
    expect(service.currentWeekMatchups()[0].away?.points).toBe(61.5);
    expect(service.currentWeekMatchups()[0].status).toBe('Live');
  });

  it('computes median format standings and optimal lineup rankings accurately', () => {
    const buildTeam = (
      rosterId: number,
      teamName: string,
      wins: number,
      losses: number,
      standingsRank: number,
      pointsFor: number,
      maxPointsFor: number,
      pointsRank: number,
      ranks: number[],
    ) => ({
      rosterId,
      ownerId: null,
      managerName: teamName,
      teamName,
      avatarUrl: null,
      initials: 'TM',
      wins,
      losses,
      ties: 0,
      winPct: wins / Math.max(1, wins + losses),
      recordLabel: `${wins}-${losses}`,
      pointsFor,
      pointsAgainst: 200,
      maxPointsFor,
      lineupEfficiencyPct: (pointsFor / maxPointsFor) * 100,
      pointDifferential: pointsFor - 200,
      streak: 'W1',
      allPlayWins: 2,
      allPlayLosses: 0,
      luckScore: 0,
      powerScore: 0,
      standingsRank,
      powerRank: standingsRank,
      pointsRank,
      waiverMoves: 0,
      usesFaab: false,
      faabRemaining: 0,
      waiverPriority: 1,
      rosterSize: 10,
      starterCount: 8,
      medianScore: 120,
      stdDevScore: 5,
      boomWeeks: 0,
      benchPointsTotal: maxPointsFor - pointsFor,
      closeWins: 0,
      closeLosses: 0,
      rawPlayerIds: [],
      rawStarterIds: [],
      rawReserveIds: [],
      weeklyScores: ranks.map((r, idx) => ({
        week: idx + 1,
        points: 120,
        opponentPoints: 100,
        opponentName: 'Opp',
        opponentRosterId: 99,
        leagueAverage: 110,
        leagueRankThatWeek: r,
        leagueSizeThatWeek: 4,
        result: 'W' as const,
        margin: 20,
        benchPoints: 10,
        starterIds: [],
        playerPoints: {},
      })),
      bestWeek: null,
      worstWeek: null,
    });

    const teams = [
      buildTeam(1, 'Lucky', 2, 0, 1, 210, 220, 2, [3, 4]),
      buildTeam(2, 'Robbed', 0, 2, 2, 250, 310, 1, [1, 1]),
    ];

    const medianRows = computeMedianStandings(teams, 1);
    expect(medianRows[0].teamName).toBe('Robbed');
    expect(medianRows[0].combinedWins).toBe(2);
    expect(medianRows[0].medianWins).toBe(2);
    expect(medianRows[0].playoffFlip).toBe('in');
    expect(medianRows[1].teamName).toBe('Lucky');
    expect(medianRows[1].playoffFlip).toBe('out');

    const optRows = computeOptimalLineupRankings(teams);
    expect(optRows[0].teamName).toBe('Robbed');
    expect(optRows[0].pointsLeftOnBench).toBe(60);
  });

  it('hydrates NFL regular-season stats for midseason pickups and kickers missing from earlier matchups', async () => {
    const loadPromise = service.loadLeague('fa_ppg_league');

    httpMock.expectOne('https://api.sleeper.app/v1/league/fa_ppg_league').flush({
      league_id: 'fa_ppg_league',
      name: 'PPG Audit',
      season: '2026',
      status: 'in_season',
      sport: 'nfl',
      total_rosters: 2,
      avatar: null,
      roster_positions: ['QB', 'K', 'BN'],
      scoring_settings: { pass_yd: 0.04, pass_td: 4, rec: 1 },
      settings: { leg: 1, last_scored_leg: 1, playoff_teams: 2, waiver_budget: 100, waiver_type: 2 },
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/fa_ppg_league/users').flush([
      { user_id: 'u1', display_name: 'Chase', avatar: null, metadata: { team_name: 'Clubhouse' } },
      { user_id: 'u2', display_name: 'Opp', avatar: null, metadata: { team_name: 'Rival' } },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/fa_ppg_league/rosters').flush([
      {
        roster_id: 1,
        owner_id: 'u1',
        players: ['cam_ward', 'stream_k'],
        starters: ['cam_ward', 'stream_k'],
        settings: { wins: 1, losses: 0, ties: 0, fpts: 100, fpts_against: 90 },
      },
      {
        roster_id: 2,
        owner_id: 'u2',
        players: [],
        starters: [],
        settings: { wins: 0, losses: 1, ties: 0, fpts: 90, fpts_against: 100 },
      },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/state/nfl').flush({
      season: '2026',
      season_type: 'regular',
      week: 1,
      display_week: 1,
      leg: 1,
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/fa_ppg_league/traded_picks').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/fa_ppg_league/winners_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/fa_ppg_league/losers_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/fa_ppg_league/drafts').flush([]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock.expectOne('https://api.sleeper.app/v1/league/fa_ppg_league/matchups/1').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/fa_ppg_league/transactions/1').flush([]);
    await loadPromise;

    service.ensureSeasonStatsLoaded('2026');
    httpMock.expectOne('https://api.sleeper.app/v1/stats/nfl/regular/2026').flush({
      cam_ward: { gp: 10, pass_yd: 2500, pass_td: 20, pts_ppr: 180 },
      stream_k: { gp: 10, fgm: 22, xpm: 24, pts_ppr: 98, pts_std: 98 },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const team = service.teams()[0];
    const rosterStats = service.buildRosterPlayerStats(team);
    const cam = rosterStats.find((p) => p.playerId === 'cam_ward');
    const kicker = rosterStats.find((p) => p.playerId === 'stream_k');

    expect(cam?.seasonPoints).toBe(180);
    expect(cam?.avgPoints).toBe(18);
    expect(kicker?.seasonPoints).toBe(98);
    expect(kicker?.avgPoints).toBe(9.8);
  });

  it('loads season-long regular-season matchups and builds playoff weeks with TBD opponents', async () => {
    const loadPromise = service.loadLeague('season_full_id');

    httpMock.expectOne('https://api.sleeper.app/v1/league/season_full_id').flush({
      league_id: 'season_full_id',
      name: 'Full Schedule League',
      season: '2026',
      status: 'in_season',
      sport: 'nfl',
      total_rosters: 6,
      avatar: null,
      roster_positions: ['QB', 'RB'],
      scoring_settings: { rec: 1 },
      settings: {
        leg: 12,
        last_scored_leg: 12,
        playoff_week_start: 15,
        playoff_teams: 6,
      },
    });

    httpMock.expectOne('https://api.sleeper.app/v1/league/season_full_id/users').flush([
      { user_id: 'u1', display_name: 'M1', avatar: null, metadata: { team_name: 'Seed One' } },
      { user_id: 'u2', display_name: 'M2', avatar: null, metadata: { team_name: 'Seed Two' } },
      { user_id: 'u3', display_name: 'M3', avatar: null, metadata: { team_name: 'Seed Three' } },
      { user_id: 'u4', display_name: 'M4', avatar: null, metadata: { team_name: 'Seed Four' } },
      { user_id: 'u5', display_name: 'M5', avatar: null, metadata: { team_name: 'Seed Five' } },
      { user_id: 'u6', display_name: 'M6', avatar: null, metadata: { team_name: 'Seed Six' } },
    ]);

    httpMock.expectOne('https://api.sleeper.app/v1/league/season_full_id/rosters').flush(
      [1, 2, 3, 4, 5, 6].map((rid) => ({
        roster_id: rid,
        owner_id: `u${rid}`,
        players: [],
        starters: [],
        settings: { wins: 12 - rid, losses: rid, ties: 0, fpts: 1500 - rid * 40, fpts_against: 1200 },
      })),
    );

    httpMock.expectOne('https://api.sleeper.app/v1/state/nfl').flush({
      season: '2026',
      season_type: 'regular',
      week: 12,
      display_week: 12,
      leg: 12,
    });

    httpMock.expectOne('https://api.sleeper.app/v1/league/season_full_id/traded_picks').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/season_full_id/winners_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/season_full_id/losers_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/season_full_id/drafts').flush([]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let wk = 1; wk <= 12; wk++) {
      httpMock
        .expectOne(`https://api.sleeper.app/v1/league/season_full_id/matchups/${wk}`)
        .flush(
          wk === 12
            ? [
                { roster_id: 1, matchup_id: 1, points: 112, starters: [], players: [] },
                { roster_id: 2, matchup_id: 1, points: 98, starters: [], players: [] },
              ]
            : [],
        );
      httpMock
        .expectOne(`https://api.sleeper.app/v1/league/season_full_id/transactions/${wk}`)
        .flush([]);
    }
    await loadPromise;

    expect(service.seasonWeeks()).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));

    const seasonLoad = service.ensureSeasonMatchupsLoaded();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let wk = 1; wk <= 17; wk++) {
      if (wk === 12) continue;
      httpMock
        .expectOne(`https://api.sleeper.app/v1/league/season_full_id/matchups/${wk}`)
        .flush(
          wk === 14
            ? [
                { roster_id: 1, matchup_id: 1, points: 0, starters: [], players: [] },
                { roster_id: 3, matchup_id: 1, points: 0, starters: [], players: [] },
              ]
            : [],
        );
    }
    await seasonLoad;

    const wk14 = service.getMatchupsForWeek(14);
    expect(wk14.length).toBe(1);
    expect(wk14[0].home.teamName).toBe('Seed One');
    expect(wk14[0].away?.teamName).toBe('Seed Three');
    expect(wk14[0].status).toBe('Upcoming');

    const wk16 = service.getMatchupsForWeek(16);
    expect(wk16.length).toBe(2);
    expect(wk16[0].home.teamName).toBe('Seed One');
    expect(wk16[0].away?.teamName).toBe('TBD');
    expect(wk16[0].away?.isTbd).toBe(true);

    const wk17 = service.getMatchupsForWeek(17);
    expect(wk17.length).toBe(1);
    expect(wk17[0].home.isTbd).toBe(true);
    expect(wk17[0].away?.isTbd).toBe(true);
  });
});
