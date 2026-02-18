import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, startWith } from 'rxjs';

export interface PackageVersions {
  [key: string]: string | null;
}

export interface PipelineVersions {
  [key: string]: string | null;
}

export interface RepositoryResult {
  name: string;
  platform: string;
  project: string;
  repo: string;
  status: 'success' | 'error';
  packageVersions: PackageVersions;
  packageName?: string;
  packageVersion?: string;
  allDependencies?: { [key: string]: string };
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
  // Signal pour les données réactives
  private dataSignal = signal<VersionData | null>(null);
  private loadingSignal = signal<boolean>(false);
  private errorSignal = signal<string | null>(null);

  // Exposer les signaux en lecture seule
  readonly data = this.dataSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  constructor(private http: HttpClient) {}

  /**
   * Charger les données depuis les fichiers de configuration
   * (simulation - en production, vous appelleriez une API backend)
   */
  async loadVersionData(): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      // Simuler les résultats (en production, vous exécuteriez le script via une API)
      const mockResults = this.generateMockResults();
      const mockPipelineResults = this.generateMockPipelineResults();

      const versionData: VersionData = {
        repositories: mockResults,
        pipelines: mockPipelineResults,
        timestamp: new Date(),
        stats: {
          total: mockResults.length,
          success: mockResults.filter(r => r.status === 'success').length,
          errors: mockResults.filter(r => r.status === 'error').length
        },
        pipelineStats: {
          total: mockPipelineResults.length,
          success: mockPipelineResults.filter(r => r.status === 'success').length,
          errors: mockPipelineResults.filter(r => r.status === 'error').length
        }
      };

      this.dataSignal.set(versionData);
    } catch (error) {
      this.errorSignal.set('Erreur lors du chargement des données');
      console.error('Error loading version data:', error);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Générer des résultats mockés (à remplacer par de vraies données)
   */
  private generateMockResults(): RepositoryResult[] {
    const results: RepositoryResult[] = [
      {
        name: 'ASTRA GEOSI',
        platform: 'azure',
        project: 'ASTRA_RIMA',
        repo: 'ASTRA_GeoSI',
        status: 'success',
        packageVersions: {
          '@oblique/oblique': '^14.1.3',
          '@angular/cdk': '^20.2.14'
        },
        packageName: 'geo-si_web-client',
        packageVersion: '2026.1.1'
      },
      {
        name: 'BJ BO HREG',
        platform: 'bitbucket',
        project: 'BJBOHREG',
        repo: 'bj_bo_hreg_ui',
        status: 'success',
        packageVersions: {
          '@oblique/oblique': '^14.1.1',
          '@angular/cdk': '^20.2.12'
        },
        packageName: 'bj-bof-ui',
        packageVersion: '0.0.0'
      },
      {
        name: 'FEDPOL PWA',
        platform: 'azure',
        project: 'Fedpol_PWA_App',
        repo: 'Fedpol_PWA_App_UI',
        status: 'success',
        packageVersions: {
          '@oblique/oblique': '12.0.2',
          '@angular/cdk': '^18.2.11'
        },
        packageName: 'fedpol-pwa-app',
        packageVersion: '0.0.2'
      },
      {
        name: 'NB AB ALMA',
        platform: 'azure',
        project: '_git',
        repo: 'ISB_ALMA',
        status: 'error',
        packageVersions: {
          '@oblique/oblique': null,
          '@angular/cdk': null
        },
        error: 'HTTP 404'
      },
      {
        name: 'SECO NLR',
        platform: 'azure',
        project: 'Seco_NLR',
        repo: 'Seco_NLR',
        status: 'success',
        packageVersions: {
          '@oblique/oblique': '^11.0.3',
          '@angular/cdk': '^17.0.0'
        },
        packageName: 'nlr-app',
        packageVersion: '0.0.0'
      },
      {
        name: 'SEM WIS',
        platform: 'bitbucket',
        project: 'SEM',
        repo: 'sem_wis',
        status: 'success',
        packageVersions: {
          '@oblique/oblique': '^14.1.0',
          '@angular/cdk': '^20.2.9'
        },
        packageName: 'integration-info',
        packageVersion: '1.2.7'
      },
      {
        name: 'EBG LOGIB',
        platform: 'azure',
        project: 'EBG_TEMOSTA23',
        repo: 'EBG_TEMOSTA23',
        status: 'success',
        packageVersions: {
          '@oblique/oblique': '^13.3.3',
          '@angular/cdk': '^19.2.19'
        },
        packageName: 'temosta',
        packageVersion: '2.1.3'
      },
      {
        name: 'BIT FMZ APP',
        platform: 'azure',
        project: 'BIT_FMZ_APP',
        repo: 'BIT_FMZ_APP',
        status: 'success',
        packageVersions: {
          '@oblique/oblique': '13.3.3',
          '@angular/cdk': '^19.2.19'
        },
        packageName: 'bit-journey-app',
        packageVersion: '1.0.0'
      }
    ];

    return results;
  }

  /**
   * Générer des résultats mockés pour les pipelines (à remplacer par de vraies données)
   */
  private generateMockPipelineResults(): PipelineResult[] {
    const pipelineResults: PipelineResult[] = [
      {
        name: 'ASTRA GEOSI',
        project: 'GEOSI',
        repo: 'astra-geosi-gitops',
        status: 'success',
        pipelineVersions: {
          'commons-pipeline': '2.5.0',
          'angular-pipeline': '3.2.1'
        },
        chartName: 'astra-geosi',
        chartVersion: '1.4.0'
      },
      {
        name: 'BJ BO HREG',
        project: 'BJBOHREG',
        repo: 'bj_bo_hreg_gitops',
        status: 'success',
        pipelineVersions: {
          'commons-pipeline': '2.4.0',
          'angular-pipeline': '3.1.0'
        },
        chartName: 'bj-bo-hreg',
        chartVersion: '1.2.3'
      },
      {
        name: 'FEDPOL PWA',
        project: 'FEDPOLPWA',
        repo: 'fedpol-pwa-app-gitops',
        status: 'success',
        pipelineVersions: {
          'commons-pipeline': '2.3.0',
          'angular-pipeline': '3.0.0'
        },
        chartName: 'fedpol-pwa',
        chartVersion: '0.5.1'
      },
      {
        name: 'NB AB ALMA',
        project: 'ALMA',
        repo: 'nb-ab-alma-gitops',
        status: 'error',
        pipelineVersions: {
          'commons-pipeline': null,
          'angular-pipeline': null
        },
        error: 'HTTP 404'
      },
      {
        name: 'SECO NLR',
        project: 'SECONLR',
        repo: 'seco-nlr-gitops',
        status: 'success',
        pipelineVersions: {
          'commons-pipeline': '2.2.0',
          'angular-pipeline': '2.9.0'
        },
        chartName: 'seco-nlr',
        chartVersion: '1.0.0'
      },
      {
        name: 'SEM WIS',
        project: 'SEM',
        repo: 'sem_wis_gitops',
        status: 'success',
        pipelineVersions: {
          'commons-pipeline': '2.5.0',
          'angular-pipeline': '3.2.1'
        },
        chartName: 'sem-wis',
        chartVersion: '2.1.0'
      },
      {
        name: 'EBG LOGIB',
        project: 'LOGIB',
        repo: 'ebg-logib-gitops',
        status: 'success',
        pipelineVersions: {
          'commons-pipeline': '2.4.5',
          'angular-pipeline': '3.1.2'
        },
        chartName: 'ebg-logib',
        chartVersion: '1.8.0'
      },
      {
        name: 'BIT FMZ APP',
        project: 'FMZ',
        repo: 'bit_fmz_app-gitops',
        status: 'success',
        pipelineVersions: {
          'commons-pipeline': '2.5.0',
          'angular-pipeline': '3.2.0'
        },
        chartName: 'bit-fmz-app',
        chartVersion: '1.0.5'
      }
    ];

    return pipelineResults;
  }

  /**
   * Auto-refresh des données à intervalle régulier
   */
  startAutoRefresh(intervalMs: number = 300000): Observable<VersionData | null> {
    return interval(intervalMs).pipe(
      startWith(0),
      switchMap(async () => {
        await this.loadVersionData();
        return this.data();
      })
    );
  }

  /**
   * Obtenir les statistiques par plateforme
   */
  getStatsByPlatform(): { azure: number; bitbucket: number } {
    const data = this.data();
    if (!data) return { azure: 0, bitbucket: 0 };

    return {
      azure: data.repositories.filter(r => r.platform === 'azure').length,
      bitbucket: data.repositories.filter(r => r.platform === 'bitbucket').length
    };
  }

  /**
   * Obtenir les versions pour un package spécifique
   */
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

