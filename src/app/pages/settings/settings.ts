import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AppSettingsService,
  AppThemeId,
  DefaultHomeRoute,
  RefreshIntervalSec,
} from '../../core/services/app-settings.service';
import { SleeperService } from '../../core/services/sleeper.service';
import { ToastService } from '../../core/services/toast.service';
import { playAlertChime } from '../../core/analytics/watch-party-alerts';
import { PageHeaderComponent, PickerComponent, PickerOption } from '../../shared/ui';

type SettingsSection = 'all' | 'themes' | 'leagues' | 'alerts' | 'display';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, PageHeaderComponent, PickerComponent],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  protected readonly settings = inject(AppSettingsService);
  protected readonly sleeper = inject(SleeperService);
  private readonly toast = inject(ToastService);

  protected readonly activeSection = signal<SettingsSection>('all');
  protected readonly newLeagueInput = signal('');
  protected readonly clearingCache = signal(false);

  protected readonly activeThemeId = computed(() => this.settings.resolveActiveTheme());
  protected readonly activeThemeDef = computed(
    () =>
      this.settings.themes.find((t) => t.id === this.activeThemeId()) ?? this.settings.themes[0],
  );

  protected readonly myTeamOptions = computed<PickerOption<string>[]>(() => {
    const base: PickerOption<string>[] = [
      {
        value: '',
        label: 'No team pinned (browse all)',
        sub: 'Clear personal highlights',
      },
    ];
    for (const tm of this.sleeper.teams()) {
      if (!tm.ownerId) continue;
      base.push({
        value: tm.ownerId,
        label: `#${tm.standingsRank} ${tm.teamName}`,
        sub: tm.managerName,
        avatarUrl: tm.avatarUrl,
        initials: tm.initials,
      });
    }
    return base;
  });

  protected readonly refreshChoices: RefreshIntervalSec[] = [10, 20, 30];
  protected readonly routeOptions: PickerOption<DefaultHomeRoute>[] = [
    { value: '/', label: 'Overview Hub', sub: 'Season pulse & featured matchup' },
    { value: '/watch-party', label: 'Watch Party', sub: 'Sunday play-by-play booth' },
    { value: '/matchups', label: 'Matchups', sub: 'Weekly scoreboards & lineups' },
    { value: '/standings', label: 'Standings', sub: 'Power matrix & playoff odds' },
    { value: '/recaps', label: 'Weekly Recaps', sub: 'The Clubhouse Gazette' },
  ];

  protected setSection(section: SettingsSection): void {
    this.activeSection.set(section);
  }

  protected showSection(section: Exclude<SettingsSection, 'all'>): boolean {
    const cur = this.activeSection();
    return cur === 'all' || cur === section;
  }

  protected selectTheme(id: AppThemeId): void {
    this.settings.setTheme(id);
    if (this.settings.followSystemTheme()) {
      this.settings.setFollowSystemTheme(false);
    }
    const label = this.settings.themes.find((t) => t.id === id)?.name ?? id;
    this.toast.show(`Theme set to ${label}`);
  }

  protected onToggleSystemTheme(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settings.setFollowSystemTheme(checked);
    this.toast.show(checked ? 'Following OS light/dark appearance' : 'Manual theme enabled');
  }

  protected selectMyTeam(value: string): void {
    const uid = value || null;
    this.sleeper.setMyUserId(uid);
    const picked = uid ? this.sleeper.teams().find((t) => t.ownerId === uid) : null;
    this.toast.show(
      picked ? `Pinned ${picked.teamName} as your franchise` : 'Cleared pinned franchise',
    );
  }

  protected clearMyTeam(): void {
    this.sleeper.setMyUserId(null);
    this.toast.show('Cleared pinned franchise');
  }

  protected async switchLeague(leagueId: string): Promise<void> {
    await this.sleeper.loadLeague(leagueId);
    if (!this.sleeper.error()) {
      this.toast.show('Loaded league season');
    }
  }

  protected async connectLeagueById(): Promise<void> {
    const id = this.newLeagueInput().trim();
    if (!id) return;
    await this.sleeper.loadLeague(id);
    if (!this.sleeper.error()) {
      this.newLeagueInput.set('');
      this.toast.show(`Connected league ${id}`);
    }
  }

  protected removeLeague(leagueId: string): void {
    this.sleeper.removeSavedSeason(leagueId);
    this.toast.show('Removed league from saved list');
  }

  protected disconnectActive(): void {
    this.sleeper.disconnectCurrentLeague();
    this.toast.show('Disconnected active league');
  }

  protected testAlertChime(): void {
    playAlertChime('TD');
    this.toast.show('Played sample TD chime');
  }

  protected selectDefaultRoute(route: DefaultHomeRoute): void {
    this.settings.setDefaultRoute(route);
    this.toast.show('Updated starting page');
  }

  protected async resetPlayerCache(): Promise<void> {
    if (this.clearingCache()) return;
    this.clearingCache.set(true);
    try {
      await this.sleeper.clearCachedDataAndResync();
      this.toast.show('Cleared player cache & re-synced league');
    } finally {
      this.clearingCache.set(false);
    }
  }

  protected resetPreferences(): void {
    this.settings.resetAllPreferences();
    this.toast.show('Reset all app preferences to defaults');
  }
}
