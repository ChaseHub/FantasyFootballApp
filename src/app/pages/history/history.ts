import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SleeperService } from '../../core/services/sleeper.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent, PickerComponent, PickerOption } from '../../shared/ui';

type HistoryTab = 'hall' | 'careers' | 'rivalry';

@Component({
  selector: 'app-history',
  imports: [RouterLink, PageHeaderComponent, PickerComponent],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class History implements OnInit {
  protected readonly sleeper = inject(SleeperService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  protected readonly activeTab = signal<HistoryTab>('hall');
  protected readonly managerA = signal<string | null>(null);
  protected readonly managerB = signal<string | null>(null);

  protected readonly history = this.sleeper.allTimeHistory;
  protected readonly loading = this.sleeper.historyLoading;
  protected readonly error = this.sleeper.historyError;

  protected readonly managerOptions = computed<PickerOption<string>[]>(() => {
    const h = this.history();
    if (!h) return [];
    return h.managers.map((m) => ({
      value: m.managerKey,
      label: m.latestTeamName,
      sub: `${m.displayName} · ${m.wins}-${m.losses} (${m.seasonsPlayed}y)`,
      avatarUrl: m.avatarUrl,
      initials: m.initials,
      badge: m.titles > 0 ? `${m.titles}T` : undefined,
    }));
  });

  protected readonly topStats = computed(() => {
    const h = this.history();
    if (!h || h.managers.length === 0) return null;

    const mostTitles = [...h.managers].sort(
      (a, b) => b.titles - a.titles || b.runnerUps - a.runnerUps || b.winPct - a.winPct,
    )[0];
    const bestWinPct = [...h.managers].sort(
      (a, b) => b.winPct - a.winPct || b.wins - a.wins,
    )[0];
    const pfKing = [...h.managers].sort((a, b) => b.totalPf - a.totalPf)[0];
    const topRecord = h.records[0] ?? null;

    return { mostTitles, bestWinPct, pfKing, topRecord };
  });

  protected readonly rivalryPair = computed(() => {
    const h = this.history();
    if (!h || h.managers.length < 2) return null;

    const mgrs = h.managers;
    const keyA = this.managerA() ?? mgrs[0].managerKey;
    let keyB = this.managerB() ?? mgrs[1].managerKey;
    if (keyA === keyB) {
      keyB = mgrs.find((m) => m.managerKey !== keyA)?.managerKey ?? mgrs[1].managerKey;
    }

    const mgrA = mgrs.find((m) => m.managerKey === keyA) ?? mgrs[0];
    const mgrB = mgrs.find((m) => m.managerKey === keyB) ?? mgrs[1];
    const record = h.h2hMatrix[mgrA.managerKey]?.[mgrB.managerKey] ?? null;

    return { mgrA, mgrB, record };
  });

  protected readonly mobileH2hRows = computed(() => {
    const h = this.history();
    const pair = this.rivalryPair();
    if (!h || !pair) return [];
    return h.managers
      .filter((m) => m.managerKey !== pair.mgrA.managerKey)
      .map((opp) => ({
        opp,
        record: h.h2hMatrix[pair.mgrA.managerKey]?.[opp.managerKey] ?? null,
        isSelected: opp.managerKey === pair.mgrB.managerKey,
      }));
  });

  constructor() {
    effect(() => {
      if (this.sleeper.dashboard()) {
        void this.sleeper.loadAllTimeHistory();
      }
    });
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const tab = qp.get('tab');
    if (tab === 'hall' || tab === 'careers' || tab === 'rivalry') {
      this.activeTab.set(tab);
    }
    const a = qp.get('a');
    const b = qp.get('b');
    if (a) this.managerA.set(a);
    if (b) this.managerB.set(b);

    if (this.sleeper.dashboard()) {
      void this.sleeper.loadAllTimeHistory();
    }
  }

  protected setTab(tab: HistoryTab): void {
    this.activeTab.set(tab);
    this.syncQueryParams();
  }

  protected refreshHistory(): void {
    void this.sleeper.loadAllTimeHistory(true);
  }

  protected copyShareLink(): void {
    if (typeof window === 'undefined') return;
    void this.toast.copyText(window.location.href, 'History view link');
  }

  protected openSeason(leagueId: string): void {
    void this.sleeper.loadLeague(leagueId).then(() => {
      void this.router.navigateByUrl('/');
    });
  }

  protected selectRivalryPair(keyA: string, keyB: string): void {
    if (keyA === keyB) return;
    this.managerA.set(keyA);
    this.managerB.set(keyB);
    this.syncQueryParams();
  }

  protected selectManagerA(key: string): void {
    this.managerA.set(key);
    this.syncQueryParams();
  }

  protected selectManagerB(key: string): void {
    this.managerB.set(key);
    this.syncQueryParams();
  }

  protected swapRivalryPair(): void {
    const pair = this.rivalryPair();
    if (!pair) return;
    this.managerA.set(pair.mgrB.managerKey);
    this.managerB.set(pair.mgrA.managerKey);
    this.syncQueryParams();
  }

  private syncQueryParams(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeTab() === 'hall' ? null : this.activeTab(),
        a: this.managerA() || null,
        b: this.managerB() || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
