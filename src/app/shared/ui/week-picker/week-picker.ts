import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { SleeperService } from '../../../core/services/sleeper.service';
import { PickerComponent, type PickerOption } from '../picker/picker';

export type WeekPickerScope =
  | 'nfl'
  | 'all'
  | 'season'
  | 'scheduled'
  | 'played'
  | 'completed';

@Component({
  selector: 'app-week-picker',
  standalone: true,
  imports: [PickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './week-picker.html',
  styleUrl: './week-picker.scss',
})
export class WeekPickerComponent {
  private readonly sleeper = inject(SleeperService);

  readonly week = input.required<number>();
  readonly scope = input<WeekPickerScope>('season');
  readonly weeks = input<number[] | null>(null);
  readonly prefix = input<string>('Week');
  readonly tone = input<'light' | 'dark'>('light');
  readonly compact = input<boolean>(true);
  readonly searchable = input<boolean>(false);
  readonly ariaLabel = input<string>('Select week');
  readonly sheetTitle = input<string>('Select Week');

  readonly weekChange = output<number>();

  protected readonly resolvedWeeks = computed<number[]>(() => {
    const explicit = this.weeks();
    if (explicit !== null) {
      return [...new Set(explicit)].sort((a, b) => a - b);
    }

    const mode = this.scope();
    if (mode === 'nfl' || mode === 'all') {
      return Array.from({ length: 18 }, (_, i) => i + 1);
    }

    const dash = this.sleeper.dashboard();
    if (!dash) return [];

    if (mode === 'season') {
      return this.sleeper.seasonWeeks();
    }

    if (mode === 'scheduled') {
      return this.sleeper.availableWeeks();
    }

    if (mode === 'completed') {
      return Object.keys(dash.weeklyMatchups)
        .map(Number)
        .filter((wk) => (dash.weeklyMatchups[wk] ?? []).some((m) => m.isCompleted))
        .sort((a, b) => a - b);
    }

    // 'played': completed weeks + current active week (excludes unplayed future slate)
    const maxPlayed = Math.max(dash.completedWeek, dash.currentWeek, 1);
    return this.sleeper
      .availableWeeks()
      .filter((wk) => wk <= maxPlayed);
  });

  protected readonly pickerOptions = computed<PickerOption<number>[]>(() => {
    const wks = this.resolvedWeeks();
    if (wks.length === 0) return [];

    const mode = this.scope();
    const dash = this.sleeper.dashboard();
    const labelPrefix = this.prefix();

    if (mode === 'nfl' || mode === 'all' || !dash) {
      const nflCur = dash?.nflState.week ?? null;
      return wks.map((wk) => {
        const isCurrent = nflCur !== null && wk === nflCur;
        const isPast = nflCur !== null && wk < nflCur;
        return {
          value: wk,
          label: `${labelPrefix} ${wk}`,
          sub: isCurrent ? 'Current NFL Week' : isPast ? 'Completed Slate' : nflCur ? 'Upcoming Slate' : undefined,
          badge: isCurrent ? 'LIVE' : `W${wk}`,
        };
      });
    }

    const playoffStart = dash.league.settings?.playoff_week_start ?? 15;
    const winnersRounds = this.sleeper.winnersBracketRounds();
    const projectedRounds = this.sleeper.projectedBracketRounds();
    const bracketRounds = winnersRounds.length > 0 ? winnersRounds : projectedRounds;

    return wks.map((wk) => {
      const cards = dash.weeklyMatchups[wk] ?? [];
      const hasLive = cards.some((c) => c.status === 'Live');
      const hasFinal = cards.some((c) => c.isCompleted);

      if (wk >= playoffStart) {
        const round = bracketRounds.find((r) => r.week === wk);
        const cleanTitle = (round?.title ?? `Playoff Rd ${wk - playoffStart + 1}`).replace(
          ' (Projected)',
          '',
        );
        const roundBadge = cleanTitle.includes('Championship')
          ? 'FINAL'
          : cleanTitle.includes('Semi')
            ? 'SF'
            : cleanTitle.includes('Quarter')
              ? 'QF'
              : 'PO';
        return {
          value: wk,
          label: `${labelPrefix} ${wk}`,
          sub: hasLive ? `${cleanTitle} · Live` : hasFinal ? `${cleanTitle} · Final` : cleanTitle,
          badge: hasLive ? 'LIVE' : roundBadge,
        };
      }

      const isCurrent = wk === dash.currentWeek;
      return {
        value: wk,
        label: `${labelPrefix} ${wk}`,
        sub: hasLive
          ? 'Live Matchups'
          : hasFinal
            ? 'Final Results'
            : isCurrent
              ? 'Current Slate'
              : 'Scheduled',
        badge: hasLive ? 'LIVE' : hasFinal ? 'FINAL' : `W${wk}`,
      };
    });
  });
}
