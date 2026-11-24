import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PickerComponent, PickerOption } from '../picker/picker';

@Component({
  selector: 'app-week-stepper',
  standalone: true,
  imports: [PickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './week-stepper.html',
  styleUrl: './week-stepper.scss',
})
export class WeekStepperComponent {
  readonly week = input.required<number>();
  readonly weeks = input.required<number[]>();
  readonly prefix = input<string>('Week');
  readonly compact = input<boolean>(false);

  readonly weekChange = output<number>();

  protected readonly pickerOptions = computed<PickerOption<number>[]>(() =>
    this.weeks().map((w) => ({
      value: w,
      label: `${this.prefix()} ${w}`,
      badge: `W${w}`,
    }))
  );

  protected readonly canPrev = computed(() => {
    const list = this.weeks();
    const idx = list.indexOf(this.week());
    return idx > 0;
  });

  protected readonly canNext = computed(() => {
    const list = this.weeks();
    const idx = list.indexOf(this.week());
    return idx >= 0 && idx < list.length - 1;
  });

  protected step(delta: -1 | 1): void {
    const list = this.weeks();
    const idx = list.indexOf(this.week());
    const next = list[idx + delta];
    if (next !== undefined) {
      this.weekChange.emit(next);
    }
  }
}
