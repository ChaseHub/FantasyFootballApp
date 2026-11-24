import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SleeperService } from '../../core/services/sleeper.service';
import { ToastService } from '../../core/services/toast.service';
import {
  SeasonWeekChampionItem,
  WeeklyRecapDigest,
  buildSeasonWeekChampions,
  buildWeeklyRecap,
} from '../../core/analytics/weekly-recaps';
import { PageHeaderComponent, WeekStepperComponent } from '../../shared/ui';

@Component({
  selector: 'app-recaps',
  imports: [RouterLink, PageHeaderComponent, WeekStepperComponent],
  templateUrl: './recaps.html',
  styleUrl: './recaps.scss',
})
export class Recaps implements OnInit {
  protected readonly sleeper = inject(SleeperService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly selectedWeekSignal = signal<number | null>(null);

  protected readonly availableWeeks = computed(() => this.sleeper.availableWeeks());

  protected readonly activeWeek = computed(() => {
    const weeks = this.availableWeeks();
    if (weeks.length === 0) return 1;
    const explicit = this.selectedWeekSignal();
    if (explicit !== null && weeks.includes(explicit)) return explicit;
    const dash = this.sleeper.dashboard();
    if (dash && dash.completedWeek > 0 && weeks.includes(dash.completedWeek)) {
      return dash.completedWeek;
    }
    return weeks[weeks.length - 1];
  });

  protected readonly digest = computed<WeeklyRecapDigest | null>(() => {
    const dash = this.sleeper.dashboard();
    if (!dash) return null;
    this.sleeper.playersMap();
    return buildWeeklyRecap({
      week: this.activeWeek(),
      dashboard: dash,
      trades: this.sleeper.buildLeagueTrades(),
      moves: this.sleeper.buildRecentMoves(),
      resolvePlayer: (id) => this.sleeper.resolvePlayer(id),
    });
  });

  protected readonly seasonArchive = computed<SeasonWeekChampionItem[]>(() => {
    const dash = this.sleeper.dashboard();
    if (!dash) return [];
    return buildSeasonWeekChampions(dash);
  });

  constructor() {
    effect(() => {
      if (this.sleeper.dashboard()) {
        this.sleeper.ensurePlayersLoaded();
      }
    });
  }

  ngOnInit(): void {
    const wkRaw = this.route.snapshot.queryParamMap.get('week');
    const parsed = wkRaw ? Number(wkRaw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      this.selectedWeekSignal.set(parsed);
    }
  }

  protected selectWeek(wk: number): void {
    this.selectedWeekSignal.set(wk);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { week: wk },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected copyChatSummary(): void {
    const d = this.digest();
    if (!d) return;
    void this.toast.copyText(d.chatMarkdown, `Week ${d.week} Gazette`);
  }

  protected copyShareLink(): void {
    if (typeof window === 'undefined') return;
    void this.toast.copyText(window.location.href, `Week ${this.activeWeek()} Recap link`);
  }
}
