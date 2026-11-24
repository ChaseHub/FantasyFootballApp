import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EspnNflService } from '../../../../core/services/espn-nfl.service';
import { WeeklyLineupEntry, WeeklyMatchupCard, WeeklyMatchupSide } from '../../../../core/models/sleeper.models';
import { SleeperService } from '../../../../core/services/sleeper.service';

interface AlignedLineupRow {
  slotIndex: number;
  home: WeeklyLineupEntry | null;
  away: WeeklyLineupEntry | null;
}

@Component({
  selector: 'app-matchup-detail-panel',
  imports: [RouterLink],
  templateUrl: './matchup-detail-panel.html',
  styleUrl: './matchup-detail-panel.scss',
})
export class MatchupDetailPanel {
  private readonly sleeper = inject(SleeperService);
  private readonly espn = inject(EspnNflService);

  readonly matchup = input.required<WeeklyMatchupCard>();
  readonly season = input<string>('');

  protected readonly playersLoading = this.sleeper.playersLoading;
  protected readonly projectionsLoading = this.sleeper.projectionsLoading;

  protected readonly homeEntries = computed(() => this.buildEntries(this.matchup().home));
  protected readonly awayEntries = computed(() =>
    this.matchup().away ? this.buildEntries(this.matchup().away!) : [],
  );

  protected readonly starterRows = computed<AlignedLineupRow[]>(() => {
    const homeStarters = this.homeEntries().filter((e) => e.isStarter);
    const awayStarters = this.awayEntries().filter((e) => e.isStarter);
    const len = Math.max(homeStarters.length, awayStarters.length);
    return Array.from({ length: len }, (_, idx) => ({
      slotIndex: idx + 1,
      home: homeStarters[idx] ?? null,
      away: awayStarters[idx] ?? null,
    }));
  });

  protected readonly benchRows = computed<AlignedLineupRow[]>(() => {
    const homeBench = this.homeEntries().filter((e) => !e.isStarter);
    const awayBench = this.awayEntries().filter((e) => !e.isStarter);
    const len = Math.max(homeBench.length, awayBench.length);
    return Array.from({ length: len }, (_, idx) => ({
      slotIndex: idx + 1,
      home: homeBench[idx] ?? null,
      away: awayBench[idx] ?? null,
    }));
  });

  protected readonly homeProjTotal = computed(() => {
    const s = this.season();
    if (!s) return null;
    return this.sleeper.getSideProjectedTotal(this.matchup().home.starterIds, s, this.matchup().week);
  });

  protected readonly awayProjTotal = computed(() => {
    const s = this.season();
    const away = this.matchup().away;
    if (!s || !away) return null;
    return this.sleeper.getSideProjectedTotal(away.starterIds, s, this.matchup().week);
  });

  protected readonly homeBenchTotal = computed(() =>
    this.homeEntries()
      .filter((e) => !e.isStarter)
      .reduce((sum, e) => sum + e.points, 0),
  );

  protected readonly awayBenchTotal = computed(() =>
    this.awayEntries()
      .filter((e) => !e.isStarter)
      .reduce((sum, e) => sum + e.points, 0),
  );

  protected getGameStatus(nflTeam: string) {
    return this.espn.getMatchupGameStatus(nflTeam, this.season(), this.matchup().week);
  }

  private buildEntries(side: WeeklyMatchupSide): WeeklyLineupEntry[] {
    return this.sleeper.buildWeeklyLineup(
      {
        week: this.matchup().week,
        points: side.points,
        opponentPoints: null,
        opponentName: null,
        opponentRosterId: null,
        leagueAverage: 0,
        leagueRankThatWeek: 1,
        leagueSizeThatWeek: 1,
        result: 'W',
        margin: 0,
        benchPoints: 0,
        starterIds: side.starterIds,
        playerPoints: side.playerPoints,
      },
      this.season() || undefined,
    );
  }
}
