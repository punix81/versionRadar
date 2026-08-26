import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { ConfigAdminComponent } from '../config-admin/config-admin.component';
import { ConfigService } from '../../services/config.service';

@Component({
  selector: 'app-configuration',
  standalone: true,
  imports: [ConfigAdminComponent, RouterLink, MatButtonModule, MatIconModule, MatTooltipModule, TranslateModule],
  templateUrl: './configuration.component.html',
  styleUrl: './configuration.component.scss',
})
export class ConfigurationComponent implements OnInit {
  @ViewChild(ConfigAdminComponent) private readonly configAdmin?: ConfigAdminComponent;
  private readonly configService = inject(ConfigService);
  private readonly router = inject(Router);
  private initialRepoTotal = 0;

  reloadConfig(): void {
    this.configAdmin?.reloadActiveTab();
  }

  ngOnInit(): void {
    forkJoin({
      pipeline: this.configService.getPipelineConfig(),
      packages: this.configService.getPackageConfig(),
    }).subscribe({
      next: ({ pipeline, packages }) => {
        this.initialRepoTotal =
          pipeline.repositories.length + packages.repositories.length;
      },
      error: () => {
        this.initialRepoTotal = 0;
      },
    });
  }

  onSaved(): void {
    if (this.initialRepoTotal === 0) {
      this.router.navigate(['/dashboard']);
    }
  }
}
