import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { PipelineResult } from '../../services/version-monitoring.service';
import { VersionDisplayService } from '../../services/version-display.service';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface PipelineStats {
  total: number;
  success: number;
  errors: number;
}

@Component({
  selector: 'app-pipelines-radar',
  standalone: true,
  imports: [CommonModule, TranslateModule, MatCardModule, MatIconModule, MatTooltipModule],
  templateUrl: './pipelines-radar.component.html',
  styleUrl: './pipelines-radar.component.scss'
})
export class PipelinesRadarComponent {
  @Input() pipelines: PipelineResult[] = [];
  @Input() pipelineStats: PipelineStats = { total: 0, success: 0, errors: 0 };

  readonly display = inject(VersionDisplayService);
}
