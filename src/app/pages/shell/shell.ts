import { Component, DestroyRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { AppSettingsService, SleeperService, ToastService } from '../../core';
import { BottomSheetComponent, PickerComponent, type PickerOption } from '../../shared/ui';
import { LeagueConnectPanel } from './components/league-connect-panel/league-connect-panel';

interface QuickJumpResult {
  id: string;
  kind: 'Page' | 'Team' | 'Player';
  label: string;
  sub: string;
  route: string[];
  queryParams?: Record<string, string | number>;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const NAV_PAGES: QuickJumpResult[] = [
  { id: 'pg-overview', kind: 'Page', label: 'Overview', sub: 'Clubhouse League Hub', route: ['/'] },
  { id: 'pg-matchups', kind: 'Page', label: 'Matchups', sub: 'Weekly fantasy slate & lineups', route: ['/matchups'] },
  { id: 'pg-games', kind: 'Page', label: 'NFL Games', sub: 'Live NFL scores & box scores', route: ['/games'] },
  { id: 'pg-wp', kind: 'Page', label: 'Watch Party', sub: 'Real-time RedZone play feed', route: ['/watch-party'] },
  { id: 'pg-standings', kind: 'Page', label: 'Standings', sub: 'Records, efficiency & power', route: ['/standings'] },
  { id: 'pg-playoffs', kind: 'Page', label: 'Playoffs', sub: 'Bracket tree & cutline watch', route: ['/playoffs'] },
  { id: 'pg-draft', kind: 'Page', label: 'Draft', sub: 'Board, pick inspector & recaps', route: ['/draft'] },
  { id: 'pg-teams', kind: 'Page', label: 'Teams', sub: 'Franchise directory & rosters', route: ['/teams'] },
  { id: 'pg-players', kind: 'Page', label: 'Players', sub: 'Scouting workbench & logs', route: ['/players'] },
  { id: 'pg-trades', kind: 'Page', label: 'Trades', sub: 'Deals, waivers & sandbox', route: ['/trades'] },
  { id: 'pg-history', kind: 'Page', label: 'League History', sub: 'Hall of Champions & H2H matrix', route: ['/history'] },
  { id: 'pg-recaps', kind: 'Page', label: 'Weekly Recaps', sub: 'Clubhouse Gazette & past archive', route: ['/recaps'] },
  { id: 'pg-insights', kind: 'Page', label: 'What-Ifs & Lab', sub: 'Schedule swaps, median & best-ball', route: ['/insights'] },
  { id: 'pg-about', kind: 'Page', label: 'About & Glossary', sub: 'How All-Play, Luck, Power & metrics work', route: ['/about'] },
  { id: 'pg-settings', kind: 'Page', label: 'Settings & Themes', sub: 'Color themes, My Franchise & alerts', route: ['/settings'] },
];

@Component({
  selector: 'app-shell',
  imports: [
    FormsModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LeagueConnectPanel,
    BottomSheetComponent,
    PickerComponent,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell implements OnInit {
  protected readonly sleeper = inject(SleeperService);
  protected readonly settings = inject(AppSettingsService);
  protected readonly toast = inject(ToastService);
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isPublicRoute = signal(
    this.router.url.startsWith('/about') || this.router.url.startsWith('/settings')
  );
  protected readonly updateAvailable = signal(false);
  protected readonly isOffline = signal(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  protected readonly selectedWhoAmIId = signal('');
  protected readonly whoAmIDismissed = signal(false);

  protected readonly showWhoAmIBanner = computed(() => {
    const dash = this.sleeper.dashboard();
    return Boolean(
      dash &&
        !this.sleeper.myTeam() &&
        this.sleeper.teams().length > 0 &&
        !this.whoAmIDismissed() &&
        !this.isPublicRoute()
    );
  });

  protected readonly isDarkTheme = computed(() => {
    const activeId = this.settings.resolveActiveTheme();
    return this.settings.themes.find((t) => t.id === activeId)?.mode === 'dark';
  });

  protected readonly switchModalOpen = signal(false);
  protected readonly quickJumpOpen = signal(false);
  protected readonly quickQuery = signal('');
  protected readonly activeQuickIdx = signal(0);
  protected readonly mobileMoreOpen = signal(false);
  private readonly deferredInstallPrompt = signal<BeforeInstallPromptEvent | null>(null);
  private lastFocusedEl: HTMLElement | null = null;

  protected readonly canInstallApp = computed(() => this.deferredInstallPrompt() !== null);

  protected readonly seasonOptions = computed<PickerOption<string>[]>(() =>
    this.sleeper.seasons().map((s) => ({
      value: s.leagueId,
      label: `${s.season} Season`,
      badge: s.season,
    }))
  );

  protected readonly whoAmIOptions = computed<PickerOption<string>[]>(() =>
    this.sleeper
      .teams()
      .filter((t) => Boolean(t.ownerId))
      .map((t) => ({
        value: t.ownerId ?? '',
        label: t.teamName,
        sub: t.managerName,
        badge: `#${t.standingsRank} · ${t.recordLabel}`,
        avatarUrl: t.avatarUrl,
        initials: t.initials,
      }))
  );

  protected readonly leagueInitials = computed(() => {
    const name = this.sleeper.league()?.name?.trim() || 'CH';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  });

  protected readonly leagueAvatarUrl = computed(() => {
    const avatar = this.sleeper.league()?.avatar;
    return avatar ? `https://sleepercdn.com/avatars/thumbs/${avatar}` : null;
  });

  protected readonly hasLiveMatchups = computed(() =>
    this.sleeper.currentWeekMatchups().some((m) => m.status === 'Live')
  );

  protected readonly scoringBadge = computed(() => {
    const rec = this.sleeper.league()?.scoring_settings?.['rec'] ?? 0;
    if (rec >= 1) return 'PPR';
    if (rec >= 0.5) return '0.5 PPR';
    return 'STD';
  });

  protected readonly quickResults = computed<QuickJumpResult[]>(() => {
    const q = this.quickQuery().trim().toLowerCase();
    const out: QuickJumpResult[] = [];

    for (const pg of NAV_PAGES) {
      if (!q || pg.label.toLowerCase().includes(q) || pg.sub.toLowerCase().includes(q)) {
        out.push(pg);
      }
    }

    for (const t of this.sleeper.teams()) {
      if (!q || t.teamName.toLowerCase().includes(q) || t.managerName.toLowerCase().includes(q)) {
        out.push({
          id: `tm-${t.rosterId}`,
          kind: 'Team',
          label: t.teamName,
          sub: `#${t.standingsRank} · ${t.recordLabel} · ${t.managerName}`,
          route: ['/teams', String(t.rosterId)],
        });
      }
    }

    if (q.length >= 2 && this.sleeper.dashboard()) {
      const players = this.sleeper.buildLeaguePlayers();
      let added = 0;
      for (const p of players) {
        if (p.name.toLowerCase().includes(q) || p.nflTeam.toLowerCase().includes(q)) {
          out.push({
            id: `pl-${p.playerId}`,
            kind: 'Player',
            label: p.name,
            sub: `${p.position} · ${p.nflTeam} · ${p.fantasyTeamName ?? 'Free Agent'} · ${p.seasonPoints.toFixed(1)}p`,
            route: ['/players'],
            queryParams: { player: p.playerId },
          });
          added += 1;
          if (added >= 8) break;
        }
      }
    }

    return out.slice(0, 14);
  });

  @HostListener('window:beforeinstallprompt', ['$event'])
  protected captureInstallPrompt(event: Event): void {
    event.preventDefault();
    this.deferredInstallPrompt.set(event as BeforeInstallPromptEvent);
  }

  @HostListener('document:keydown', ['$event'])
  protected handleGlobalShortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.openQuickJump();
      return;
    }

    if (!this.quickJumpOpen()) return;
    const list = this.quickResults();
    if (list.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeQuickIdx.update((i) => (i + 1) % list.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeQuickIdx.update((i) => (i - 1 + list.length) % list.length);
    } else if (event.key === 'Enter') {
      const target = list[this.activeQuickIdx()] ?? list[0];
      if (target) {
        event.preventDefault();
        this.navigateQuick(target);
      }
    }
  }

  ngOnInit(): void {
    this.sleeper.initialize();
    const defaultRoute = this.settings.defaultRoute();
    if (defaultRoute !== '/' && this.router.url === '/') {
      void this.router.navigateByUrl(defaultRoute);
    }

    const sub = this.router.events.subscribe((ev) => {
      if (ev instanceof NavigationEnd) {
        this.isPublicRoute.set(
          ev.urlAfterRedirects.startsWith('/about') ||
            ev.urlAfterRedirects.startsWith('/settings')
        );
        this.mobileMoreOpen.set(false);
      }
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());

    if (this.swUpdate?.isEnabled) {
      const swSub = this.swUpdate.versionUpdates.subscribe((evt) => {
        if (evt.type === 'VERSION_READY') {
          this.updateAvailable.set(true);
        }
      });
      this.destroyRef.onDestroy(() => swSub.unsubscribe());
    }

    if (typeof window !== 'undefined') {
      const onOnline = () => this.isOffline.set(false);
      const onOffline = () => this.isOffline.set(true);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      });
    }
  }

  protected openQuickJump(): void {
    this.lastFocusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.quickQuery.set('');
    this.activeQuickIdx.set(0);
    this.mobileMoreOpen.set(false);
    this.quickJumpOpen.set(true);
    if (this.sleeper.dashboard()) {
      this.sleeper.ensurePlayersLoaded();
    }
  }

  protected onQuickQueryChange(val: string): void {
    this.quickQuery.set(val);
    this.activeQuickIdx.set(0);
  }

  protected closeQuickJump(): void {
    this.quickJumpOpen.set(false);
    this.lastFocusedEl?.focus();
    this.lastFocusedEl = null;
  }

  protected navigateQuick(item: QuickJumpResult): void {
    this.quickJumpOpen.set(false);
    this.lastFocusedEl = null;
    void this.router.navigate(item.route, { queryParams: item.queryParams });
  }

  protected openSwitchModal(): void {
    this.lastFocusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.mobileMoreOpen.set(false);
    this.switchModalOpen.set(true);
  }

  protected closeSwitchModal(): void {
    this.switchModalOpen.set(false);
    this.lastFocusedEl?.focus();
    this.lastFocusedEl = null;
  }

  protected toggleMobileMore(): void {
    this.mobileMoreOpen.update((v) => !v);
  }

  protected closeMobileMore(): void {
    this.mobileMoreOpen.set(false);
  }

  protected refreshLeague(): void {
    void this.sleeper.refreshCurrentLeague();
  }

  protected async installApp(): Promise<void> {
    const prompt = this.deferredInstallPrompt();
    if (!prompt) return;
    await prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === 'accepted') {
      this.deferredInstallPrompt.set(null);
    }
  }

  protected onSeasonSelect(leagueId: string): void {
    if (leagueId) {
      void this.sleeper.loadLeague(leagueId);
    }
  }

  protected confirmWhoAmI(): void {
    const userId = this.selectedWhoAmIId().trim();
    if (!userId) return;
    this.sleeper.setMyUserId(userId);
    const team = this.sleeper.teams().find((t) => t.ownerId === userId);
    this.selectedWhoAmIId.set('');
    this.toast.show(`Pinned ${team?.teamName ?? 'your franchise'} as My Team`);
  }

  protected dismissWhoAmI(): void {
    this.whoAmIDismissed.set(true);
  }

  protected reloadForUpdate(): void {
    if (this.swUpdate) {
      void this.swUpdate.activateUpdate().then(() => {
        document.location.reload();
      });
    } else {
      document.location.reload();
    }
  }

  protected dismissUpdateBanner(): void {
    this.updateAvailable.set(false);
  }

  protected toggleThemeMode(): void {
    const nextId = this.isDarkTheme() ? 'porcelain-jade' : 'midnight-graphite';
    this.settings.setFollowSystemTheme(false);
    this.settings.setTheme(nextId);
    const label = this.settings.themes.find((t) => t.id === nextId)?.name ?? nextId;
    this.toast.show(`Theme switched to ${label}`);
  }
}
