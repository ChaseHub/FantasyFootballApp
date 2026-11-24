import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { EspnNflService, NflGameCard, groupGamesBySlate, normalizeNflAbbr } from './espn-nfl.service';

describe('EspnNflService', () => {
  let service: EspnNflService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EspnNflService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('normalizes mismatched NFL team abbreviations cleanly', () => {
    expect(normalizeNflAbbr('WSH')).toBe('WAS');
    expect(normalizeNflAbbr('JAC')).toBe('JAX');
    expect(normalizeNflAbbr('LA')).toBe('LAR');
    expect(normalizeNflAbbr('buf')).toBe('BUF');
  });

  it('maps live ESPN scoreboard and summary plays accurately', async () => {
    const loadPromise = service.loadScoreboard('2026', 12);

    const sbReq = httpMock.expectOne((r) => r.url.includes('/scoreboard'));
    sbReq.flush({
      events: [
        {
          id: '401671700',
          name: 'Kansas City Chiefs at Buffalo Bills',
          shortName: 'KC @ BUF',
          date: '2026-11-22T21:25Z',
          competitions: [
            {
              venue: { fullName: 'Highmark Stadium' },
              broadcasts: [{ names: ['CBS'] }],
              status: {
                period: 3,
                displayClock: '04:12',
                type: { state: 'in', shortDetail: '3rd 04:12' },
              },
              situation: {
                shortDownDistanceText: '2nd & 6',
                possessionText: 'BUF 34',
                possession: '12',
                isRedZone: false,
                lastPlay: { text: 'P. Mahomes pass to T. Kelce for 12 yds.' },
              },
              competitors: [
                {
                  id: '2',
                  homeAway: 'home',
                  score: '20',
                  records: [{ summary: '9-2' }],
                  linescores: [{ value: 7 }, { value: 6 }, { value: 7 }],
                  team: { id: '2', abbreviation: 'BUF', shortDisplayName: 'Bills', displayName: 'Buffalo Bills' },
                },
                {
                  id: '12',
                  homeAway: 'away',
                  score: '21',
                  records: [{ summary: '9-2' }],
                  linescores: [{ value: 7 }, { value: 7 }, { value: 7 }],
                  team: { id: '12', abbreviation: 'KC', shortDisplayName: 'Chiefs', displayName: 'Kansas City Chiefs' },
                },
              ],
            },
          ],
        },
      ],
    });

    await loadPromise;

    expect(service.games().length).toBe(1);
    const game = service.games()[0];
    expect(game.state).toBe('in');
    expect(game.away.abbr).toBe('KC');
    expect(game.away.score).toBe(21);
    expect(game.home.abbr).toBe('BUF');
    expect(game.situation?.isRedZone).toBe(false);
    expect(game.situation?.lastPlayText).toContain('T. Kelce');

    const detailPromise = service.loadGameDetail('401671700', { '12': 'KC', '2': 'BUF' });
    const detailReq = httpMock.expectOne((r) => r.url.includes('/summary?event=401671700'));
    detailReq.flush({
      drives: {
        current: {
          description: '7 plays, 58 yards, 3:14',
          yards: 58,
          offensivePlays: 7,
          team: { id: '12', abbreviation: 'KC' },
          plays: [
            {
              id: 'p1',
              period: { number: 3 },
              clock: { displayValue: '04:12' },
              start: { shortDownDistanceText: '1st & 10' },
              text: 'P. Mahomes pass short to R. Rice for 14 yds.',
              statYardage: 14,
              scoringPlay: false,
            },
          ],
        },
      },
      scoringPlays: [
        {
          id: 'sp1',
          period: { number: 3 },
          clock: { displayValue: '07:40' },
          team: { abbreviation: 'KC' },
          type: { text: 'Passing Touchdown' },
          text: 'X. Worthy 24 yd pass from P. Mahomes',
          awayScore: 21,
          homeScore: 20,
        },
      ],
      boxscore: {
        teams: [
          { team: { abbreviation: 'KC' }, statistics: [{ name: 'totalYards', displayValue: '312' }] },
          { team: { abbreviation: 'BUF' }, statistics: [{ name: 'totalYards', displayValue: '289' }] },
        ],
      },
    });

    await detailPromise;

    const detail = service.detail();
    expect(detail?.currentDrive?.yards).toBe(58);
    expect(detail?.recentPlays[0].text).toContain('R. Rice');
    expect(detail?.scoringPlays[0].awayScore).toBe(21);
    expect(detail?.teamStats[0]).toEqual({
      label: 'Total Yards',
      awayValue: '312',
      homeValue: '289',
    });

    const liveInfo = service.getLiveTeamGame('KC', '2026', 12);
    expect(liveInfo?.label).toBe('KC 21-20 BUF · 3rd 04:12');
    expect(liveInfo?.hasPossession).toBe(true);
    expect(service.getLiveTeamGame('SF', '2026', 12)).toBeNull();
    expect(service.getMatchupGameStatus('KC', '2026', 12)?.state).toBe('in');
  });

  it('returns Final score status from getMatchupGameStatus for finished games', async () => {
    const p = service.loadScoreboard('2026', 12, true);
    const req = httpMock.expectOne((r) => r.url.includes('/scoreboard'));
    req.flush({
      events: [
        {
          id: 'thu_1',
          name: 'Pittsburgh Steelers at Cleveland Browns',
          shortName: 'PIT @ CLE',
          date: '2026-11-20T01:15Z',
          competitions: [
            {
              status: { period: 4, displayClock: '0:00', type: { state: 'post', shortDetail: 'Final' } },
              competitors: [
                { id: '5', homeAway: 'home', score: '24', team: { id: '5', abbreviation: 'CLE' } },
                { id: '23', homeAway: 'away', score: '19', team: { id: '23', abbreviation: 'PIT' } },
              ],
            },
          ],
        },
      ],
    });
    await p;

    const status = service.getMatchupGameStatus('CLE', '2026', 12);
    expect(status?.state).toBe('post');
    expect(status?.label).toBe('Final · PIT 19-24 CLE');
  });

  it('groups games cleanly by chronological NFL time slate in local time', () => {
    const mkGame = (id: string, dateIso: string): NflGameCard => ({
      id,
      name: id,
      shortName: id,
      dateIso,
      kickoffLabel: '',
      venue: null,
      broadcast: null,
      state: 'pre',
      statusDetail: '',
      period: 0,
      clock: '0:00',
      away: { id: '1', abbr: 'KC', normalizedAbbr: 'KC', name: 'KC', displayName: 'KC', logo: null, record: '0-0', score: 0, winner: false, linescores: [] },
      home: { id: '2', abbr: 'BUF', normalizedAbbr: 'BUF', name: 'BUF', displayName: 'BUF', logo: null, record: '0-0', score: 0, winner: false, linescores: [] },
      situation: null,
      oddsLine: null,
      overUnder: null,
    });

    // Using explicit local Date timestamps so test behaves deterministically regardless of runner timezone
    const dThu = new Date(2026, 10, 19, 19, 15); // Thursday 7:15 PM local
    const dSunNoon = new Date(2026, 10, 22, 12, 0); // Sunday 12:00 PM local
    const dSunAfternoon = new Date(2026, 10, 22, 15, 25); // Sunday 3:25 PM local
    const dMonNight = new Date(2026, 10, 23, 19, 15); // Monday 7:15 PM local

    const groups = groupGamesBySlate([
      mkGame('mon', dMonNight.toISOString()),
      mkGame('sun2', dSunAfternoon.toISOString()),
      mkGame('thu', dThu.toISOString()),
      mkGame('sun1', dSunNoon.toISOString()),
    ]);

    expect(groups.map((g) => g.id)).toEqual(['thu-night', 'sun-early', 'sun-late', 'mon-night']);
    expect(groups[0].label).toBe('Thursday Night Football');
    expect(groups[3].label).toBe('Monday Night Football');
  });

  it('backfills full core plays once, uses lightweight summary deltas on refresh, and stops querying final games', async () => {
    const first = service.fetchEventDetailCached('fin_1', { '12': 'KC', '2': 'BUF' }, true, true);
    const summaryReq = httpMock.expectOne((r) => r.url.includes('/summary?event=fin_1'));
    const coreReq = httpMock.expectOne((r) => r.url.includes('/events/fin_1/competitions/fin_1/plays'));
    coreReq.flush({
      items: [
        {
          id: 'p1',
          sequenceNumber: 1,
          period: { number: 1 },
          clock: { displayValue: '14:20' },
          team: { $ref: 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/teams/12' },
          text: 'P.Mahomes pass short right to T.Kelce for 12 yards.',
          statYardage: 12,
        },
      ],
    });
    summaryReq.flush({
      plays: [
        {
          id: 'p10',
          sequenceNumber: 10,
          period: { number: 4 },
          clock: { displayValue: '00:12' },
          team: { id: '12', abbreviation: 'KC' },
          text: 'P.Mahomes kneel to BUF 20 for -1 yards.',
          statYardage: -1,
        },
      ],
    });
    const detail1 = await first;
    expect(detail1?.allPlays).toHaveLength(2);
    expect(detail1?.hasFullTimeline).toBe(true);
    expect(detail1?.finalized).toBe(true);

    // Subsequent call with force=true & isGameFinal=true must NOT trigger any HTTP request
    const detail2 = await service.fetchEventDetailCached('fin_1', { '12': 'KC', '2': 'BUF' }, true, true);
    httpMock.expectNone((r) => r.url.includes('fin_1'));
    expect(detail2?.allPlays).toHaveLength(2);
  });
});
