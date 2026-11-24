import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LineupOptimizationReport, optimizeTeamLineup } from '../../../../core/analytics/lineup-optimizer';
import { TeamSummary, TeamWeeklyScore } from '../../../../core/models/sleeper.models';
import { SleeperService } from '../../../../core/services/sleeper.service';

type RosterTab = 'roster' | 'lineup' | 'optimizer';
type PosFilter = 'ALL' | 'QB' | 'RB' | 'WR' | 'TE' | 'OTHER';

@Component({
  selector: 'app-team-roster-table',
  imports: [RouterLink],
  templateUrl: './team-roster-table.html',
  styleUrl: './team-roster-table.scss',
})
export class TeamRosterTable {
  private readonly sleeper = inject(SleeperService);

  readonly team = input.required<TeamSummary>();
  readonly selectedWeek = input<number | null>(null);
  readonly clearWeekRequested = output<void>();

  protected readonly activeTab = signal<RosterTab>('roster');
  protected readonly posFilter = signal<PosFilter>('ALL');

  constructor() {
    effect(() => {
      if (this.selectedWeek() !== null) {
        this.activeTab.set('lineup');
      }
    });

    effect(() => {
      const dash = this.sleeper.dashboard();
      if (this.activeTab() === 'optimizer' && dash) {
        const s = dash.nflState.season || dash.league.season;
        if (s && dash.currentWeek > 0) {
          this.sleeper.ensureWeekProjections(s, dash.currentWeek);
        }
      }
    });
  }

  protected readonly optimization = computed<LineupOptimizationReport | null>(() => {
    const dash = this.sleeper.dashboard();
    if (!dash) return null;
    this.sleeper.projectionsByKey();
    const season = dash.nflState.season || dash.league.season;
    const week = dash.currentWeek;
    return optimizeTeamLineup({
      team: this.team(),
      week,
      rosterPositions: dash.league.roster_positions ?? [],
      rosterStats: this.rosterPlayers(),
      getProjection: (id) => this.sleeper.getPlayerProjection(id, season, week),
      isOnBye: (nflTeam) => this.sleeper.isPlayerOnBye(nflTeam, season, week),
    });
  });

  protected readonly projectionsLoading = this.sleeper.projectionsLoading;

  protected readonly rosterPlayers = computed(() =>
    this.sleeper.buildRosterPlayerStats(this.team()),
  );

  protected readonly filteredRosterPlayers = computed(() => {
    const filter = this.posFilter();
    const list = this.rosterPlayers();
    if (filter === 'ALL') return list;
    if (filter === 'OTHER') {
      return list.filter((p) => !['QB', 'RB', 'WR', 'TE'].includes(p.position));
    }
    return list.filter((p) => p.position === filter);
  });

  protected readonly positionCounts = computed(() => {
    const counts = { QB: 0, RB: 0, WR: 0, TE: 0, OTHER: 0 };
    for (const p of this.rosterPlayers()) {
      if (p.position === 'QB' || p.position === 'RB' || p.position === 'WR' || p.position === 'TE') {
        counts[p.position] += 1;
      } else {
        counts.OTHER += 1;
      }
    }
    return counts;
  });

  protected readonly activeWeekScore = computed<TeamWeeklyScore | null>(() => {
    const scores = this.team().weeklyScores;
    if (scores.length === 0) return null;
    const wk = this.selectedWeek();
    if (wk !== null) {
      return scores.find((s) => s.week === wk) ?? scores[scores.length - 1];
    }
    return scores[scores.length - 1];
  });

  protected readonly weeklyLineup = computed(() => {
    const wk = this.activeWeekScore();
    return wk ? this.sleeper.buildWeeklyLineup(wk) : [];
  });

  protected readonly playersLoading = this.sleeper.playersLoading;

  protected setTab(tab: RosterTab): void {
    this.activeTab.set(tab);
  }

  protected setPosFilter(filter: PosFilter): void {
    this.posFilter.set(filter);
  }
}
