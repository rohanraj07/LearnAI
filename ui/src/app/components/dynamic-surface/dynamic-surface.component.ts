import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-dynamic-surface',
  templateUrl: './dynamic-surface.component.html',
  styleUrls: ['./dynamic-surface.component.scss'],
})
export class DynamicSurfaceComponent {
  @Input() surface: any;

  get isTableType(): boolean {
    return this.surface?.type === 'table';
  }

  get isSectionType(): boolean {
    return this.surface?.type === 'section';
  }

  get isMetricGridType(): boolean {
    return this.surface?.type === 'metric-grid';
  }

  getNestedValue(obj: any, key: string): any {
    return key.split('.').reduce((acc, part) => acc?.[part], obj);
  }
}
