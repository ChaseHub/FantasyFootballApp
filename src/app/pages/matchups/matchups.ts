import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  EspnNflService,
  type MatchupOddsSummary,
  SleeperService,
  computeMatchupOdds,
} from '../../core';
import { PageHeaderComponent, WeekStepperComponent } from '../../shared/ui';
import { MatchupDetailPanel } from './components/matchup-detail-panel/matchup-detail-panel';

@Component({
  selector: 'app-matchups',
  imports: [RouterLink, PageHeaderComponent, WeekStepperComponent, MatchupDetailPanel],
  templateUrl: './matchups.html',
  styleUrl: './matchups.scss',
})
export class Matchups implements OnInit {
  protected readonly sleeper = inject(SleeperService);
  private readonly espn = inject(EspnNflService);
  private readonly route = inject(ActivatedRoute);

  protected readonly selectedMatchupId = signal<number | null>(null);

  protected readonly activeMatchup = computed(() => {
    const list = this.sleeper.currentWeekMatchups();
    if (list.length === 0) return null;
    const chosenId = this.selectedMatchupId();
    if (chosenId !== null) {
      const match = list.find((m) => m.matchupId === chosenId);
      if (match) return match;
    }
    return this.sleeper.featuredMatchup() ?? list[0];
  });

  protected readonly featuredSummaryLine = computed(() => {
    const m = this.activeMatchup();
    if (!m || !m.away) return 'Bye week';
    if (m.home.points === 0 && m.away.points === 0) return 'Matchup scheduled';
    if (m.home.points === m.away.points) return 'Scores are tied';
    const leader = m.home.points > m.away.points ? m.home.teamName : m.away.teamName;
    const verb = m.status === 'Final' ? 'won by' : 'leads by';
    return `${leader} ${verb} ${m.margin.toFixed(2)} pts`;
  });

  constructor() {
    effect(() => {
      const season = this.sleeper.league()?.season;
      const week = this.sleeper.selectedWeek();
      if (season && week > 0) {
        this.sleeper.ensureWeekProjections(season, week);
        void this.espn.loadScoreboard(season, week);
      }
    });
  }

  protected readonly myWeekMatchupId = computed(() => {
    const mine = this.sleeper.myTeam();
    if (!mine) return null;
    const found = this.sleeper
      .currentWeekMatchups()
      .find((m) => m.home.rosterId === mine.rosterId || m.away?.rosterId === mine.rosterId);
    return found?.matchupId ?? null;
  });

  ngOnInit(): void {
    this.sleeper.ensurePlayersLoaded();
    this.route.queryParamMap.subscribe((params) => {
      const wk = params.get('week');
      if (wk !== null) {
        const wkNum = Number(wk);
        if (Number.isFinite(wkNum) && wkNum > 0) this.sleeper.setSelectedWeek(wkNum);
      }
      const matchup = params.get('matchup');
      if (matchup !== null) {
        const mId = Number(matchup);
        if (Number.isFinite(mId)) this.selectedMatchupId.set(mId);
      }
    });
  }

  protected selectWeek(week: number): void {
    this.selectedMatchupId.set(null);
    this.sleeper.setSelectedWeek(week);
  }

  protected selectMatchup(matchupId: number): void {
    this.selectedMatchupId.set(matchupId);
  }

  protected refreshWeek(): void {
    const week = this.sleeper.selectedWeek();
    const season = this.sleeper.league()?.season;
    void this.sleeper.refreshWeek(week);
    if (season && week > 0) {
      void this.espn.loadScoreboard(season, week, true);
    }
  }

  protected readonly oddsByMatchupId = computed(() => {
    this.sleeper.playersMap();
    this.sleeper.projectionsByKey();
    const season = this.sleeper.league()?.season ?? '';
    const map = new Map<number, MatchupOddsSummary>();
    if (!season) return map;
    for (const card of this.sleeper.currentWeekMatchups()) {
      map.set(card.matchupId, computeMatchupOdds(card, this.sleeper, this.espn, season));
    }
    return map;
  });

  protected readonly featuredOdds = computed<MatchupOddsSummary | null>(() => {
    const m = this.activeMatchup();
    return m ? this.oddsByMatchupId().get(m.matchupId) ?? null : null;
  });

  protected getMatchupOdds(matchupId: number): MatchupOddsSummary | null {
    return this.oddsByMatchupId().get(matchupId) ?? null;
  }

  protected getProjected(starterIds: string[], week: number): number | null {
    const season = this.sleeper.league()?.season;
    if (!season) return null;
    return this.sleeper.getSideProjectedTotal(starterIds, season, week);
  }
}
