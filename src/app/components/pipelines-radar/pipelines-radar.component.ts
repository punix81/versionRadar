import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { PipelineResult } from '../../services/version-monitoring.service';
import { VersionDisplayService } from '../../services/version-display.service';

export interface PipelineStats {
  total: number;
  success: number;
  errors: number;
}

@Component({
  selector: 'app-pipelines-radar',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './pipelines-radar.component.html',
  styleUrl: './pipelines-radar.component.scss'
})
export class PipelinesRadarComponent {
  @Input() pipelines: PipelineResult[] = [];
  @Input() pipelineStats: PipelineStats = { total: 0, success: 0, errors: 0 };

  constructor(public display: VersionDisplayService) {}
}

