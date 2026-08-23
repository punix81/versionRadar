import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { RepositoryResult } from '../../services/version-monitoring.service';
import { VersionDisplayService } from '../../services/version-display.service';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-packages-radar',
  standalone: true,
  imports: [CommonModule, TranslateModule, MatCardModule, MatIconModule, MatTooltipModule],
  templateUrl: './packages-radar.component.html',
  styleUrl: './packages-radar.component.scss'
})
export class PackagesRadarComponent {
  @Input() repositories: RepositoryResult[] = [];

  readonly display = inject(VersionDisplayService);
}
