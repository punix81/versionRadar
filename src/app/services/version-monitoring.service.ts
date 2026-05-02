import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, startWith, forkJoin, tap, catchError, finalize, map, of } from 'rxjs';

export type PackageVersions = Record<string, string | null>;

export type PipelineVersions = Record<string, string | null>;

export interface RepositoryResult {
  name: string;
  platform: string;
  project: string;
  repo: string;
  status: 'success' | 'error';
  packageVersions: PackageVersions;
  packageName?: string;
  packageVersion?: string;
  allDependencies?: Record<string, string>;
  error?: string;
}

export interface PipelineResult {
  name: string;
  project: string;
  repo: string;
  status: 'success' | 'error';
  pipelineVersions: PipelineVersions;
  chartName?: string;
  chartVersion?: string;
  error?: string;
}

export interface VersionData {
  repositories: RepositoryResult[];
  pipelines: PipelineResult[];
  timestamp: Date;
  stats: {
    total: number;
    success: number;
    errors: number;
  };
  pipelineStats: {
    total: number;
    success: number;
    errors: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class VersionMonitoringService {
  private readonly http = inject(HttpClient);

  private dataSignal = signal<VersionData | null>(null);
  private loadingSignal = signal<boolean>(false);
  private errorSignal = signal<string | null>(null);

  readonly data = this.dataSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  loadVersionData(): Observable<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    return forkJoin({
      repositories: this.http.get<RepositoryResult[]>('assets/data/repositories.json'),
      pipelines: this.http.get<PipelineResult[]>('assets/data/pipelines.json')
    }).pipe(
      tap(({ repositories, pipelines }) => {
        if (repositories.length === 0 && pipelines.length === 0) {
          this.errorSignal.set(
            'Aucune donnée disponible. Lancez la commande "npm run fetch-all" pour récupérer les versions depuis Azure DevOps et Bitbucket.'
          );
          this.dataSignal.set(null);
          return;
        }

        this.dataSignal.set({
          repositories,
          pipelines,
          timestamp: new Date(),
          stats: {
            total: repositories.length,
            success: repositories.filter(r => r.status === 'success').length,
            errors: repositories.filter(r => r.status === 'error').length
          },
          pipelineStats: {
            total: pipelines.length,
            success: pipelines.filter(r => r.status === 'success').length,
            errors: pipelines.filter(r => r.status === 'error').length
          }
        });
      }),
      catchError(error => {
        this.errorSignal.set('Erreur lors du chargement des données. Lancez npm run fetch-all pour récupérer les données.');
        console.error('Error loading version data:', error);
        return of(null);
      }),
      finalize(() => this.loadingSignal.set(false)),
      map(() => void 0)
    );
  }

  startAutoRefresh(intervalMs = 300000): Observable<VersionData | null> {
    return interval(intervalMs).pipe(
      startWith(0),
      switchMap(() => this.loadVersionData()),
      map(() => this.data())
    );
  }

  getStatsByPlatform(): { azure: number; bitbucket: number } {
    const data = this.data();
    if (!data) return { azure: 0, bitbucket: 0 };

    return {
      azure: data.repositories.filter(r => r.platform === 'azure').length,
      bitbucket: data.repositories.filter(r => r.platform === 'bitbucket').length
    };
  }

  getVersionsForPackage(packageName: string): Map<string, number> {
    const data = this.data();
    if (!data) return new Map();

    const versionCounts = new Map<string, number>();

    data.repositories.forEach(repo => {
      const version = repo.packageVersions[packageName];
      if (version) {
        const cleanVersion = version.replace(/[\^~]/, '');
        versionCounts.set(cleanVersion, (versionCounts.get(cleanVersion) || 0) + 1);
      }
    });

    return versionCounts;
  }
}
