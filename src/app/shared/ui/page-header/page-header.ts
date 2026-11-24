import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './page-header.html',
  styleUrl: './page-header.scss',
})
export class PageHeaderComponent {
  readonly overline = input<string>('');
  readonly title = input.required<string>();
  readonly context = input<string>('');
  readonly mobileContext = input<string>('');
  readonly meta = input<string>('');
}
