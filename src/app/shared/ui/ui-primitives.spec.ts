import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BottomSheetComponent,
  FilterBarComponent,
  PickerComponent,
  PickerOption,
  WeekStepperComponent,
} from './index';

@Component({
  imports: [BottomSheetComponent],
  template: `
    <app-bottom-sheet [open]="open()" title="Hub Sheet" (closed)="closedCount = closedCount + 1">
      <p class="sheet-child">Sheet content</p>
    </app-bottom-sheet>
  `,
})
class SheetHost {
  readonly open = signal(false);
  closedCount = 0;
}

@Component({
  imports: [PickerComponent],
  template: `
    <app-picker
      [options]="options"
      [value]="selected()"
      [searchable]="true"
      sheetTitle="Pick Franchise"
      (valueChange)="selected.set($event)"
    />
  `,
})
class PickerHost {
  readonly options: PickerOption<string>[] = [
    { value: 'a', label: 'Alpha Squad', sub: 'Manager A', badge: '8-2' },
    { value: 'b', label: 'Beta Club', sub: 'Manager B', badge: '6-4' },
    { value: 'c', label: 'Gamma Utd', disabled: true },
  ];
  readonly selected = signal<string | null>('a');
}

@Component({
  imports: [WeekStepperComponent],
  template: `
    <app-week-stepper
      [week]="week()"
      [weeks]="[1, 2, 3]"
      prefix="Wk"
      (weekChange)="week.set($event)"
    />
  `,
})
class StepperHost {
  readonly week = signal(2);
}

@Component({
  imports: [FilterBarComponent],
  template: `
    <app-filter-bar
      [searchQuery]="query()"
      [activeFilterCount]="count()"
      (searchQueryChange)="query.set($event)"
      (clearAll)="cleared = cleared + 1"
    >
      <span class="projected-filter">POS Filter</span>
    </app-filter-bar>
  `,
})
class FilterHost {
  readonly query = signal('');
  readonly count = signal(2);
  cleared = 0;
}

describe('Shared UI Primitives', () => {
  it('BottomSheetComponent opens, renders projected content, and emits closed on Escape', async () => {
    const fixture = TestBed.createComponent(SheetHost);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="dialog"]')).toBeNull();

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    expect(el.querySelector('[role="dialog"]')).toBeTruthy();
    expect(el.querySelector('.sheet-child')?.textContent).toContain('Sheet content');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.closedCount).toBe(1);
  });

  it('PickerComponent displays selected option, filters via search, and emits valueChange', async () => {
    const fixture = TestBed.createComponent(PickerHost);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector('button.picker-trigger') as HTMLButtonElement;
    expect(trigger.textContent).toContain('Alpha Squad');

    trigger.click();
    await fixture.whenStable();

    const opts = el.querySelectorAll('[role="option"]');
    expect(opts.length).toBe(3);
    (opts[1] as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(fixture.componentInstance.selected()).toBe('b');
    expect(trigger.textContent).toContain('Beta Club');
  });

  it('WeekStepperComponent steps backward/forward and respects list bounds', async () => {
    const fixture = TestBed.createComponent(StepperHost);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const prevBtn = el.querySelector('[aria-label="Previous week"]') as HTMLButtonElement;
    const nextBtn = el.querySelector('[aria-label="Next week"]') as HTMLButtonElement;

    expect(prevBtn.disabled).toBe(false);
    expect(nextBtn.disabled).toBe(false);

    prevBtn.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.week()).toBe(1);
    expect(prevBtn.disabled).toBe(true);

    nextBtn.click();
    await fixture.whenStable();
    nextBtn.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.week()).toBe(3);
    expect(nextBtn.disabled).toBe(true);
  });

  it('FilterBarComponent opens mobile drawer sheet and clears filters', async () => {
    const fixture = TestBed.createComponent(FilterHost);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const filterBtn = el.querySelector('.filter-trigger-btn') as HTMLButtonElement;
    expect(filterBtn.textContent).toContain('2');

    filterBtn.click();
    await fixture.whenStable();
    expect(el.querySelector('.drawer-body.is-open')).toBeTruthy();

    const resetBtn = el.querySelector('.reset-btn') as HTMLButtonElement;
    resetBtn.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.cleared).toBe(1);
  });
});
