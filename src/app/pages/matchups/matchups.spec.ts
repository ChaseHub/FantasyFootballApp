import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SleeperService } from '../../core';
import { Matchups } from './matchups';

describe('Matchups page', () => {
  let httpMock: HttpTestingController;
  let sleeper: SleeperService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Matchups],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    sleeper = TestBed.inject(SleeperService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('uses a standalone week dropdown without arrows and displays playoff TBD matchups', async () => {
    const load = sleeper.loadLeague('m_league');
    httpMock.expectOne('https://api.sleeper.app/v1/league/m_league').flush({
      league_id: 'm_league',
      name: 'Playoff Test',
      season: '2026',
      status: 'in_season',
      sport: 'nfl',
      total_rosters: 6,
      avatar: null,
      roster_positions: ['QB', 'RB'],
      scoring_settings: { rec: 1 },
      settings: { leg: 1, last_scored_leg: 1, playoff_week_start: 15, playoff_teams: 6 },
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/m_league/users').flush([
      { user_id: 'u1', display_name: 'A', avatar: null, metadata: { team_name: 'Alpha' } },
      { user_id: 'u2', display_name: 'B', avatar: null, metadata: { team_name: 'Beta' } },
      { user_id: 'u3', display_name: 'C', avatar: null, metadata: { team_name: 'Gamma' } },
      { user_id: 'u4', display_name: 'D', avatar: null, metadata: { team_name: 'Delta' } },
      { user_id: 'u5', display_name: 'E', avatar: null, metadata: { team_name: 'Epsilon' } },
      { user_id: 'u6', display_name: 'F', avatar: null, metadata: { team_name: 'Zeta' } },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/m_league/rosters').flush(
      [1, 2, 3, 4, 5, 6].map((rid) => ({
        roster_id: rid,
        owner_id: `u${rid}`,
        players: [],
        starters: [],
        settings: { wins: 10 - rid, losses: rid, ties: 0, fpts: 900 - rid * 20, fpts_against: 800 },
      })),
    );
    httpMock.expectOne('https://api.sleeper.app/v1/state/nfl').flush({
      season: '2026',
      season_type: 'regular',
      week: 1,
      display_week: 1,
      leg: 1,
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/m_league/traded_picks').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/m_league/winners_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/m_league/losers_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/m_league/drafts').flush([]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock.expectOne('https://api.sleeper.app/v1/league/m_league/matchups/1').flush([
      { roster_id: 1, matchup_id: 1, points: 100, starters: [], players: [] },
      { roster_id: 2, matchup_id: 1, points: 90, starters: [], players: [] },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/m_league/transactions/1').flush([]);
    await load;

    const fixture = TestBed.createComponent(Matchups);
    await fixture.whenStable();

    // Flush async season schedule, projections, espn, and player metadata calls triggered by Matchups
    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock.match((r) => r.url.includes('/league/m_league/matchups/')).forEach((r) => r.flush([]));
    httpMock.match((r) => r.url.includes('players/nfl')).forEach((r) => r.flush({}));
    httpMock.match((r) => r.url.includes('projections')).forEach((r) => r.flush([]));
    httpMock.match((r) => r.url.includes('scoreboard')).forEach((r) => r.flush({ events: [] }));
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[aria-label="Previous week"]')).toBeNull();
    expect(el.querySelector('[aria-label="Next week"]')).toBeNull();

    const trigger = el.querySelector('.week-picker button.picker-trigger') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    trigger.click();
    await fixture.whenStable();

    const options = Array.from(el.querySelectorAll('[role="option"]')) as HTMLButtonElement[];
    expect(options.length).toBe(17);

    const wk16Option = options.find((opt) => opt.textContent?.includes('Week 16'));
    expect(wk16Option).toBeTruthy();
    wk16Option?.click();
    await fixture.whenStable();

    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock.match((r) => r.url.includes('projections')).forEach((r) => r.flush([]));
    httpMock.match((r) => r.url.includes('scoreboard')).forEach((r) => r.flush({ events: [] }));
    await fixture.whenStable();

    expect(sleeper.selectedWeek()).toBe(16);
    expect(el.textContent).toContain('Alpha');
    expect(el.textContent).toContain('TBD');
    expect(el.querySelector('.playoff-banner')).toBeTruthy();
    expect(el.querySelector('a[href="/teams/0"]')).toBeNull();
  });
});
