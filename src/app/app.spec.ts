import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { SleeperService } from './core/services/sleeper.service';

describe('App', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-density');
    document.documentElement.removeAttribute('data-motion');
  });

  it('should render the Clubhouse shell and League Connect onboarding when no league is saved', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    await router.navigateByUrl('/');
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.wordmark-title')?.textContent).toContain('The Clubhouse');
    expect(compiled.querySelector('.hero-heading')?.textContent).toContain(
      'Connect your Sleeper league.',
    );
  });

  it('should render Overview, Teams, Trades, and Insights when a league is loaded', async () => {
    const router = TestBed.inject(Router);
    const sleeper = TestBed.inject(SleeperService);
    const fixture = TestBed.createComponent(App);

    const loadPromise = sleeper.loadLeague('999');

    httpMock.expectOne('https://api.sleeper.app/v1/league/999').flush({
      league_id: '999',
      name: 'Porcelain Invitational',
      season: '2026',
      status: 'in_season',
      sport: 'nfl',
      total_rosters: 2,
      avatar: null,
      roster_positions: ['QB', 'RB'],
      scoring_settings: { rec: 1 },
      settings: { leg: 1, last_scored_leg: 1, playoff_teams: 2, waiver_budget: 100, waiver_type: 2 },
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/999/users').flush([
      { user_id: 'u1', display_name: 'Chase', avatar: null, metadata: { team_name: 'Clubhouse One' } },
      { user_id: 'u2', display_name: 'Alex', avatar: null, metadata: { team_name: 'Graphite FC' } },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/999/rosters').flush([
      {
        roster_id: 1,
        owner_id: 'u1',
        players: ['4046'],
        starters: ['4046'],
        settings: { wins: 1, losses: 0, ties: 0, fpts: 132, fpts_decimal: 40, fpts_against: 110, fpts_against_decimal: 0, ppts: 140, ppts_decimal: 0 },
      },
      {
        roster_id: 2,
        owner_id: 'u2',
        players: ['6794'],
        starters: ['6794'],
        settings: { wins: 0, losses: 1, ties: 0, fpts: 110, fpts_decimal: 0, fpts_against: 132, fpts_against_decimal: 40, ppts: 120, ppts_decimal: 0 },
      },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/state/nfl').flush({
      season: '2026',
      season_type: 'regular',
      week: 1,
      display_week: 1,
      leg: 1,
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/999/traded_picks').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/999/winners_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/999/losers_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/999/drafts').flush([]);

    await new Promise((resolve) => setTimeout(resolve, 0));

    httpMock.expectOne('https://api.sleeper.app/v1/league/999/matchups/1').flush([
      { roster_id: 1, matchup_id: 1, points: 132.4, starters: ['4046'], players: ['4046'], players_points: { '4046': 24.5 } },
      { roster_id: 2, matchup_id: 1, points: 110.0, starters: ['6794'], players: ['6794'], players_points: { '6794': 18.0 } },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/999/transactions/1').flush([]);

    await loadPromise;

    await router.navigateByUrl('/');
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Overview');
    expect(compiled.textContent).toContain('Clubhouse One');

    // First-time "Who Are You?" picker renders when no My Team is pinned and pins cleanly
    const whoAmIBanner = compiled.querySelector('.ch-whoami-banner');
    expect(whoAmIBanner).toBeTruthy();
    const whoTrigger = compiled.querySelector('.ch-whoami-controls button.picker-trigger') as HTMLButtonElement | null;
    expect(whoTrigger).toBeTruthy();
    whoTrigger?.click();
    await fixture.whenStable();
    const whoOption = Array.from(document.querySelectorAll('[role="option"]')).find((el) =>
      el.textContent?.includes('Clubhouse One'),
    ) as HTMLButtonElement | undefined;
    expect(whoOption).toBeTruthy();
    whoOption?.click();
    await fixture.whenStable();
    const pinBtn = Array.from(compiled.querySelectorAll('.ch-whoami-banner button')).find((b) =>
      b.textContent?.includes('Pin My Team'),
    ) as HTMLButtonElement | undefined;
    pinBtn?.click();
    await fixture.whenStable();
    expect(compiled.querySelector('.ch-whoami-banner')).toBeNull();
    expect(sleeper.myTeam()?.ownerId).toBe('u1');

    // Settings route renders all 6 themes and switches document theme on click
    await router.navigateByUrl('/settings');
    await fixture.whenStable();
    expect(compiled.querySelector('h1')?.textContent).toContain('Settings');
    expect(compiled.querySelectorAll('.theme-card').length).toBe(6);
    const midnightCard = Array.from(compiled.querySelectorAll('.theme-card')).find((el) =>
      el.textContent?.includes('Midnight Stadium'),
    ) as HTMLButtonElement | undefined;
    midnightCard?.click();
    await fixture.whenStable();
    expect(document.documentElement.getAttribute('data-theme')).toBe('midnight-graphite');

    // Quick Light/Dark mode toggle in Shell switches back to Light theme cleanly
    const lightToggle = compiled.querySelector('.switch-league-btn.is-theme') as HTMLButtonElement | null;
    expect(lightToggle).toBeTruthy();
    lightToggle?.click();
    await fixture.whenStable();
    expect(document.documentElement.getAttribute('data-theme')).toBe('porcelain-jade');

    await router.navigateByUrl('/teams/1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock.match('https://api.sleeper.app/v1/players/nfl').forEach((req) => req.flush({}));
    httpMock.match((r) => r.url.includes('/stats/nfl')).forEach((req) => req.flush({}));
    await fixture.whenStable();
    expect(compiled.querySelector('.hero-team-name')?.textContent).toContain('Clubhouse One');

    const optTab = Array.from(compiled.querySelectorAll('button.ch-segment')).find((b) =>
      b.textContent?.includes('Start / Sit Lab'),
    ) as HTMLButtonElement | undefined;
    expect(optTab).toBeTruthy();
    optTab?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock.match((r) => r.url.includes('projections')).forEach((req) => req.flush([]));
    await fixture.whenStable();
    expect(compiled.textContent).toContain('Optimal Lineup');

    await router.navigateByUrl('/standings');
    await fixture.whenStable();
    expect(compiled.querySelector('h1')?.textContent).toContain('Standings');
    expect(compiled.textContent).toContain('Strength of Schedule Matrix');

    await router.navigateByUrl('/recaps');
    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock.match('https://api.sleeper.app/v1/players/nfl').forEach((req) => req.flush({}));
    await fixture.whenStable();
    expect(compiled.querySelector('h1')?.textContent).toContain('Weekly Recaps');
    expect(compiled.textContent).toContain('Weekly Crown Archive');
    expect(compiled.textContent).toContain('Week 1 Clubhouse Gazette');

    await router.navigateByUrl('/trades');
    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock.match((r) => r.url.includes('/stats/nfl')).forEach((req) => req.flush({}));
    await fixture.whenStable();
    expect(compiled.querySelector('h1')?.textContent).toContain('Trading & Moves');
    const sandboxTab = Array.from(compiled.querySelectorAll('button.ch-segment')).find((b) =>
      b.textContent?.includes('Trade Sandbox'),
    ) as HTMLButtonElement | undefined;
    expect(sandboxTab).toBeTruthy();
    sandboxTab?.click();
    await fixture.whenStable();
    expect(compiled.textContent).toContain('Live Trade Evaluator');
    expect(compiled.textContent).toContain('Package Balance & Starter Impact');

    await router.navigateByUrl('/insights');
    await fixture.whenStable();
    expect(compiled.querySelector('h1')?.textContent).toContain('What-Ifs & League Lab');

    const allPlayTab = Array.from(compiled.querySelectorAll('button.ch-segment')).find((b) =>
      b.textContent?.includes('Weekly All-Play'),
    ) as HTMLButtonElement | undefined;
    expect(allPlayTab).toBeTruthy();
    allPlayTab?.click();
    await fixture.whenStable();
    expect(compiled.textContent).toContain('Expected Wins (xW)');
    expect(compiled.textContent).toContain('Week Crown #1');

    await router.navigateByUrl('/playoffs');
    await fixture.whenStable();
    expect(compiled.querySelector('h1')?.textContent).toContain('Playoffs');
    expect(compiled.textContent).toContain('Playoff & Title Probability Simulator');

    await router.navigateByUrl('/draft');
    await fixture.whenStable();
    expect(compiled.querySelector('h1')?.textContent).toContain('Draft');

    await router.navigateByUrl('/about');
    await fixture.whenStable();
    expect(compiled.querySelector('h1')?.textContent).toContain('How Clubhouse Metrics Work');
    expect(compiled.textContent).toContain('All-Play Record & All-Play %');
    expect(compiled.textContent).toContain('Schedule Luck (+/-)');

    await router.navigateByUrl('/games');
    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock
      .match((r) => r.url.includes('/scoreboard'))
      .forEach((req) => req.flush({ events: [] }));
    await fixture.whenStable();
    expect(compiled.querySelector('h1')?.textContent).toContain('NFL Games');

    await router.navigateByUrl('/watch-party');
    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock
      .match((r) => r.url.includes('/scoreboard') || r.url.includes('projections'))
      .forEach((req) => req.flush(req.request.url.includes('scoreboard') ? { events: [] } : []));
    await fixture.whenStable();
    expect(compiled.querySelector('h1')?.textContent).toContain('Watch Party');

    // Trigger sample Watch Party alert banner and dismiss it
    const testAlertBtn = Array.from(compiled.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Test Alert'),
    );
    expect(testAlertBtn).toBeTruthy();
    testAlertBtn?.click();
    await fixture.whenStable();
    expect(compiled.querySelector('.ch-wp-alerts')).toBeTruthy();
    expect(compiled.querySelector('.ch-wp-alert-card')?.textContent).toContain('Sample TD Alert');
    const closeAlertBtn = compiled.querySelector('.ch-wp-alert-close') as HTMLButtonElement | null;
    closeAlertBtn?.click();
    await fixture.whenStable();
    expect(compiled.querySelector('.ch-wp-alert-card')).toBeNull();

    // Quick Jump keyboard accessibility (Ctrl+K opens dialog, Escape closes)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    await fixture.whenStable();
    const dialog = compiled.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('Quick Jump');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(compiled.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull();
  });

  it('should render Pre-Draft Headquarters in pre_draft phase and League History route', async () => {
    const router = TestBed.inject(Router);
    const sleeper = TestBed.inject(SleeperService);
    const fixture = TestBed.createComponent(App);

    const loadPromise = sleeper.loadLeague('998');
    httpMock.expectOne('https://api.sleeper.app/v1/league/998').flush({
      league_id: '998',
      name: 'Dynasty Startup',
      season: '2026',
      status: 'pre_draft',
      sport: 'nfl',
      total_rosters: 2,
      previous_league_id: null,
      avatar: null,
      roster_positions: ['QB', 'RB'],
      scoring_settings: { rec: 0.5 },
      settings: { leg: 0, last_scored_leg: 0, playoff_teams: 2, waiver_budget: 100, waiver_type: 2 },
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/998/users').flush([
      { user_id: 'u1', display_name: 'Chase', avatar: null, metadata: { team_name: 'Draft Pick One' } },
      { user_id: 'u2', display_name: 'Alex', avatar: null, metadata: { team_name: 'Draft Pick Two' } },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/998/rosters').flush([
      { roster_id: 1, owner_id: 'u1', players: [], starters: [], settings: { wins: 0, losses: 0, ties: 0 } },
      { roster_id: 2, owner_id: 'u2', players: [], starters: [], settings: { wins: 0, losses: 0, ties: 0 } },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/state/nfl').flush({
      season: '2026',
      season_type: 'off',
      week: 0,
      display_week: 1,
      leg: 0,
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/998/traded_picks').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/998/winners_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/998/losers_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/998/drafts').flush([]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock.expectOne('https://api.sleeper.app/v1/league/998/matchups/1').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/998/transactions/1').flush([]);

    await loadPromise;

    await router.navigateByUrl('/');
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.ch-skip-link')).toBeTruthy();
    expect(compiled.textContent).toContain('Pre-Draft Headquarters');

    await router.navigateByUrl('/history');
    for (let tick = 0; tick < 3; tick++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const pending = httpMock.match((r) => r.url.includes('/league/998'));
      for (const req of pending) {
        if (req.request.url.endsWith('/league/998')) {
          req.flush({
            league_id: '998',
            name: 'Dynasty Startup',
            season: '2026',
            status: 'pre_draft',
            sport: 'nfl',
            total_rosters: 2,
            previous_league_id: null,
            roster_positions: ['QB', 'RB'],
            scoring_settings: { rec: 0.5 },
            settings: { leg: 0, last_scored_leg: 0, playoff_teams: 2 },
          });
        } else {
          req.flush([]);
        }
      }
    }
    await fixture.whenStable();
    expect(compiled.querySelector('h1')?.textContent).toContain('League History');
  });
});
