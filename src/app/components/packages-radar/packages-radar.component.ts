import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { RepositoryResult } from '../../services/version-monitoring.service';
import { VersionDisplayService } from '../../services/version-display.service';

@Component({
  selector: 'app-packages-radar',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './packages-radar.component.html',
  styleUrl: './packages-radar.component.scss'
})
export class PackagesRadarComponent {
  @Input() repositories: RepositoryResult[] = [];

  constructor(public display: VersionDisplayService) {}
}

