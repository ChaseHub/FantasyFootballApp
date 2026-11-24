import { Component, computed, input, signal } from '@angular/core';

export interface LeagueScoringPoint {
  week: number;
  average: number;
  high: number;
}

interface ChartPoint {
  week: number;
  x: number;
  avgY: number;
  highY: number;
  average: number;
  high: number;
}

@Component({
  selector: 'app-scoring-trend-card',
  imports: [],
  templateUrl: './scoring-trend-card.html',
  styleUrl: './scoring-trend-card.scss',
})
export class ScoringTrendCard {
  readonly data = input.required<LeagueScoringPoint[]>();

  protected readonly focusedWeek = signal<number | null>(null);

  protected readonly viewWidth = 660;
  protected readonly viewHeight = 232;
  private readonly padLeft = 44;
  private readonly padRight = 22;
  private readonly padTop = 20;
  private readonly padBottom = 32;

  protected readonly scaleBounds = computed(() => {
    const items = this.data();
    if (items.length === 0) return { min: 60, max: 180 };
    const maxVal = Math.max(...items.map((d) => d.high));
    const minVal = Math.min(...items.map((d) => d.average));
    const max = Math.ceil((maxVal + 12) / 20) * 20;
    const min = Math.max(0, Math.floor((minVal - 15) / 20) * 20);
    return { min, max: Math.max(max, min + 40) };
  });

  protected readonly gridTicks = computed(() => {
    const { min, max } = this.scaleBounds();
    const plotHeight = this.viewHeight - this.padTop - this.padBottom;
    return [0, 0.33, 0.66, 1].map((ratio) => {
      const value = Math.round(min + (max - min) * ratio);
      const y = this.padTop + plotHeight * (1 - ratio);
      return { value, y };
    });
  });

  protected readonly points = computed<ChartPoint[]>(() => {
    const items = this.data();
    if (items.length === 0) return [];
    const { min, max } = this.scaleBounds();
    const span = max - min || 1;
    const plotWidth = this.viewWidth - this.padLeft - this.padRight;
    const plotHeight = this.viewHeight - this.padTop - this.padBottom;

    return items.map((item, idx) => {
      const x =
        items.length === 1
          ? this.padLeft + plotWidth / 2
          : this.padLeft + (plotWidth * idx) / (items.length - 1);
      const avgY = this.padTop + plotHeight * (1 - (item.average - min) / span);
      const highY = this.padTop + plotHeight * (1 - (item.high - min) / span);
      return {
        week: item.week,
        x,
        avgY,
        highY,
        average: item.average,
        high: item.high,
      };
    });
  });

  protected readonly highPath = computed(() => {
    return this.points()
      .map((p) => `${p.x.toFixed(1)},${p.highY.toFixed(1)}`)
      .join(' ');
  });

  protected readonly avgPath = computed(() => {
    return this.points()
      .map((p) => `${p.x.toFixed(1)},${p.avgY.toFixed(1)}`)
      .join(' ');
  });

  protected readonly activePoint = computed(() => {
    const pts = this.points();
    if (pts.length === 0) return null;
    const wk = this.focusedWeek();
    if (wk !== null) {
      return pts.find((p) => p.week === wk) ?? pts[pts.length - 1];
    }
    return pts[pts.length - 1];
  });

  protected selectWeek(week: number): void {
    this.focusedWeek.set(week);
  }
}
