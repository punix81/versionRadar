import { inject } from '@angular/core';
import { UrlTree } from '@angular/router';
import { Router } from '@angular/router';
import { Observable, forkJoin, map } from 'rxjs';
import { ConfigService } from '../services/config.service';

/**
 * Redirects first-time users (no repositories configured) to the welcome page,
 * and everyone else to the dashboard.
 */
export function firstRunRedirectGuard(): Observable<UrlTree> {
  const router = inject(Router);
  const configService = inject(ConfigService);

  return forkJoin({
    pipeline: configService.getPipelineConfig(),
    packages: configService.getPackageConfig(),
  }).pipe(
    map(({ pipeline, packages }) => {
      const hasRepositories =
        pipeline.repositories.length > 0 || packages.repositories.length > 0;
      return router.createUrlTree(hasRepositories ? ['/dashboard'] : ['/welcome']);
    })
  );
}
