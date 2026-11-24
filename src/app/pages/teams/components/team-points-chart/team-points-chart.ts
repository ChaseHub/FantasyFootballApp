import { Component, computed, input, output } from '@angular/core';
import { TeamWeeklyScore } from '../../../../core/models/sleeper.models';

interface BarNode {
  week: number;
  x: number;
  y: number;
  width: number;
  height: number;
  avgY: number;
  score: TeamWeeklyScore;
}

@Component({
  selector: 'app-team-points-chart',
  imports: [],
  templateUrl: './team-points-chart.html',
  styleUrl: './team-points-chart.scss',
})
export class TeamPointsChart {
  readonly scores = input.required<TeamWeeklyScore[]>();
  readonly teamName = input.required<string>();
  readonly selectedWeek = input<number | null>(null);

  readonly weekSelected = output<number>();

  protected readonly viewWidth = 680;
  protected readonly viewHeight = 224;
  private readonly padLeft = 42;
  private readonly padRight = 18;
  private readonly padTop = 18;
  private readonly padBottom = 30;

  protected readonly maxScale = computed(() => {
    const items = this.scores();
    if (items.length === 0) return 160;
    const peak = Math.max(
      ...items.map((i) => Math.max(i.points, i.leagueAverage, i.opponentPoints ?? 0)),
    );
    return Math.max(100, Math.ceil((peak + 15) / 20) * 20);
  });

  protected readonly gridTicks = computed(() => {
    const max = this.maxScale();
    const plotHeight = this.viewHeight - this.padTop - this.padBottom;
    return [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      value: Math.round(max * ratio),
      y: this.padTop + plotHeight * (1 - ratio),
    }));
  });

  protected readonly bars = computed<BarNode[]>(() => {
    const items = this.scores();
    if (items.length === 0) return [];
    const max = this.maxScale();
    const plotWidth = this.viewWidth - this.padLeft - this.padRight;
    const plotHeight = this.viewHeight - this.padTop - this.padBottom;
    const slotWidth = plotWidth / items.length;
    const barWidth = Math.min(30, Math.max(14, slotWidth * 0.52));

    return items.map((score, idx) => {
      const centerX = this.padLeft + slotWidth * idx + slotWidth / 2;
      const barHeight = Math.max(4, (score.points / max) * plotHeight);
      const y = this.padTop + plotHeight - barHeight;
      const avgY = this.padTop + plotHeight - (score.leagueAverage / max) * plotHeight;
      return {
        week: score.week,
        x: centerX - barWidth / 2,
        y,
        width: barWidth,
        height: barHeight,
        avgY,
        score,
      };
    });
  });

  protected readonly avgPolyline = computed(() => {
    return this.bars()
      .map((b) => `${(b.x + b.width / 2).toFixed(1)},${b.avgY.toFixed(1)}`)
      .join(' ');
  });

  protected readonly focusedScore = computed(() => {
    const items = this.scores();
    if (items.length === 0) return null;
    const wk = this.selectedWeek();
    if (wk !== null) {
      return items.find((i) => i.week === wk) ?? items[items.length - 1];
    }
    return items[items.length - 1];
  });

  protected selectWeek(week: number): void {
    this.weekSelected.emit(week);
  }
}
