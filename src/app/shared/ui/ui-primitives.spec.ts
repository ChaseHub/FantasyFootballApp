import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SleeperService } from '../../core/services/sleeper.service';
import {
  BottomSheetComponent,
  FilterBarComponent,
  PickerComponent,
  PickerOption,
  WeekPickerComponent,
  WeekPickerScope,
} from './index';

@Component({
  imports: [BottomSheetComponent],
  template: `
    <app-bottom-sheet [open]="open()" title="Hub Sheet" (closed)="closedCount = closedCount + 1">
      <p class="sheet-child">Sheet content</p>
    </app-bottom-sheet>
  `,
})
class SheetHost {
  readonly open = signal(false);
  closedCount = 0;
}

@Component({
  imports: [PickerComponent],
  template: `
    <app-picker
      [options]="options"
      [value]="selected()"
      [searchable]="true"
      sheetTitle="Pick Franchise"
      (valueChange)="selected.set($event)"
    />
  `,
})
class PickerHost {
  readonly options: PickerOption<string>[] = [
    { value: 'a', label: 'Alpha Squad', sub: 'Manager A', badge: '8-2' },
    { value: 'b', label: 'Beta Club', sub: 'Manager B', badge: '6-4' },
    { value: 'c', label: 'Gamma Utd', disabled: true },
  ];
  readonly selected = signal<string | null>('a');
}

@Component({
  imports: [WeekPickerComponent],
  template: `
    <app-week-picker
      [week]="week()"
      [scope]="scope()"
      [weeks]="weeks()"
      (weekChange)="week.set($event)"
    />
  `,
})
class WeekPickerHost {
  readonly week = signal(2);
  readonly scope = signal<WeekPickerScope>('nfl');
  readonly weeks = signal<number[] | null>(null);
}

@Component({
  imports: [FilterBarComponent],
  template: `
    <app-filter-bar
      [searchQuery]="query()"
      [activeFilterCount]="count()"
      (searchQueryChange)="query.set($event)"
      (clearAll)="cleared = cleared + 1"
    >
      <span class="projected-filter">POS Filter</span>
    </app-filter-bar>
  `,
})
class FilterHost {
  readonly query = signal('');
  readonly count = signal(2);
  cleared = 0;
}

describe('Shared UI Primitives', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('BottomSheetComponent opens, renders projected content, and emits closed on Escape', async () => {
    const fixture = TestBed.createComponent(SheetHost);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="dialog"]')).toBeNull();

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    expect(el.querySelector('[role="dialog"]')).toBeTruthy();
    expect(el.querySelector('.sheet-child')?.textContent).toContain('Sheet content');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.closedCount).toBe(1);
  });

  it('PickerComponent displays selected option, filters via search, and emits valueChange', async () => {
    const fixture = TestBed.createComponent(PickerHost);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector('button.picker-trigger') as HTMLButtonElement;
    expect(trigger.textContent).toContain('Alpha Squad');

    trigger.click();
    await fixture.whenStable();

    const opts = el.querySelectorAll('[role="option"]');
    expect(opts.length).toBe(3);
    (opts[1] as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(fixture.componentInstance.selected()).toBe('b');
    expect(trigger.textContent).toContain('Beta Club');
  });

  it('WeekPickerComponent renders all 18 weeks for nfl scope and custom subsets, emitting weekChange', async () => {
    const fixture = TestBed.createComponent(WeekPickerHost);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector('button.picker-trigger') as HTMLButtonElement;
    expect(trigger.textContent).toContain('Week 2');

    trigger.click();
    await fixture.whenStable();

    const nflOptions = el.querySelectorAll('[role="option"]');
    expect(nflOptions.length).toBe(18);
    (nflOptions[10] as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(fixture.componentInstance.week()).toBe(11);

    fixture.componentInstance.weeks.set([1, 4, 7]);
    await fixture.whenStable();
    trigger.click();
    await fixture.whenStable();
    const subsetOptions = el.querySelectorAll('[role="option"]');
    expect(subsetOptions.length).toBe(3);
    (subsetOptions[2] as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(fixture.componentInstance.week()).toBe(7);
  });

  it('WeekPickerComponent supports season, completed, and played scopes from loaded league', async () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const sleeper = TestBed.inject(SleeperService);

    const load = sleeper.loadLeague('wp_league');
    httpMock.expectOne('https://api.sleeper.app/v1/league/wp_league').flush({
      league_id: 'wp_league',
      name: 'Scope Test',
      season: '2026',
      status: 'in_season',
      sport: 'nfl',
      total_rosters: 4,
      avatar: null,
      roster_positions: ['QB'],
      scoring_settings: { rec: 1 },
      settings: { leg: 2, last_scored_leg: 1, playoff_week_start: 15, playoff_teams: 4 },
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/wp_league/users').flush([
      { user_id: 'u1', display_name: 'A', avatar: null },
      { user_id: 'u2', display_name: 'B', avatar: null },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/wp_league/rosters').flush([
      { roster_id: 1, owner_id: 'u1', players: [], starters: [], settings: { wins: 1, losses: 0, ties: 0, fpts: 100, fpts_against: 80 } },
      { roster_id: 2, owner_id: 'u2', players: [], starters: [], settings: { wins: 0, losses: 1, ties: 0, fpts: 80, fpts_against: 100 } },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/state/nfl').flush({
      season: '2026',
      season_type: 'regular',
      week: 2,
      display_week: 2,
      leg: 2,
    });
    httpMock.expectOne('https://api.sleeper.app/v1/league/wp_league/traded_picks').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/wp_league/winners_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/wp_league/losers_bracket').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/wp_league/drafts').flush([]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    httpMock.expectOne('https://api.sleeper.app/v1/league/wp_league/matchups/1').flush([
      { roster_id: 1, matchup_id: 1, points: 100, starters: [], players: [] },
      { roster_id: 2, matchup_id: 1, points: 80, starters: [], players: [] },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/wp_league/matchups/2').flush([
      { roster_id: 1, matchup_id: 1, points: 0, starters: [], players: [] },
      { roster_id: 2, matchup_id: 1, points: 0, starters: [], players: [] },
    ]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/wp_league/transactions/1').flush([]);
    httpMock.expectOne('https://api.sleeper.app/v1/league/wp_league/transactions/2').flush([]);
    await load;
    httpMock.verify();

    const fixture = TestBed.createComponent(WeekPickerHost);
    fixture.componentInstance.week.set(1);
    fixture.componentInstance.scope.set('completed');
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector('button.picker-trigger') as HTMLButtonElement;
    trigger.click();
    await fixture.whenStable();
    expect(el.querySelectorAll('[role="option"]').length).toBe(1);
    trigger.click();

    fixture.componentInstance.scope.set('played');
    await fixture.whenStable();
    trigger.click();
    await fixture.whenStable();
    expect(el.querySelectorAll('[role="option"]').length).toBe(2);
    trigger.click();

    fixture.componentInstance.scope.set('season');
    await fixture.whenStable();
    trigger.click();
    await fixture.whenStable();
    expect(el.querySelectorAll('[role="option"]').length).toBe(16);
  });

  it('FilterBarComponent opens mobile drawer sheet and clears filters', async () => {
    const fixture = TestBed.createComponent(FilterHost);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const filterBtn = el.querySelector('.filter-trigger-btn') as HTMLButtonElement;
    expect(filterBtn.textContent).toContain('2');

    filterBtn.click();
    await fixture.whenStable();
    expect(el.querySelector('.drawer-body.is-open')).toBeTruthy();

    const resetBtn = el.querySelector('.reset-btn') as HTMLButtonElement;
    resetBtn.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.cleared).toBe(1);
  });
});
