import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, tap, throwError } from 'rxjs';

export interface PipelineRepository {
  project: string;
  repo: string;
  name: string;
  branch?: string;
}

export interface PipelineConfig {
  filePath: string;
  pipelineNames: string[];
  repositories: PipelineRepository[];
}

export interface PackageRepository {
  platform: 'azure' | 'bitbucket' | string;
  collection?: string;
  project: string;
  repo: string;
  name: string;
  path: string;
  branch?: string;
}

export interface PackageConfig {
  filePath: string;
  packageNames: string[];
  repositories: PackageRepository[];
}

export interface FetchStreamEvent {
  type: 'stdout' | 'stderr' | 'info' | 'success' | 'error' | 'done';
  line?: string;
  success?: boolean;
}

export interface EnvConfig {
  AZUREDEVOPS_TOKEN: string;
  AZUREDEVOPS_USER: string;
  BITBUCKET_USER: string;
  BITBUCKET_TOKEN: string;
  BITBUCKET_BASE_URL: string;
  REQUEST_TIMEOUT_MS: string;
  DATE_LOCALE: string;
  [key: string]: string;
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly http = inject(HttpClient);

  /** Incrémenté à chaque sauvegarde réussie — le dashboard l'observe pour se recharger */
  readonly savedVersion = signal(0);

  private handleError(err: HttpErrorResponse): Observable<never> {
    if (err.status === 0) {
      return throwError(() => new Error(
        'Serveur de configuration non disponible. Lancez : npm start'
      ));
    }
    return throwError(() => new Error(`Erreur ${err.status} : ${err.statusText}`));
  }

  getPipelineConfig(): Observable<PipelineConfig> {
    return this.http.get<PipelineConfig>('/api/config/repositories').pipe(
      catchError(e => this.handleError(e))
    );
  }

  savePipelineConfig(config: PipelineConfig): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>('/api/config/repositories', config).pipe(
      tap(() => this.savedVersion.update(v => v + 1)),
      catchError(e => this.handleError(e))
    );
  }

  getPackageConfig(): Observable<PackageConfig> {
    return this.http.get<PackageConfig>('/api/config/package-repositories').pipe(
      catchError(e => this.handleError(e))
    );
  }

  savePackageConfig(config: PackageConfig): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>('/api/config/package-repositories', config).pipe(
      tap(() => this.savedVersion.update(v => v + 1)),
      catchError(e => this.handleError(e))
    );
  }

  getEnvConfig(): Observable<EnvConfig> {
    return this.http.get<EnvConfig>('/api/config/env').pipe(
      catchError(e => this.handleError(e))
    );
  }

  saveEnvConfig(config: EnvConfig): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>('/api/config/env', config).pipe(
      catchError(e => this.handleError(e))
    );
  }

  streamFetch(type: 'all' | 'packages' | 'pipelines' = 'all'): Observable<FetchStreamEvent> {
    return new Observable(observer => {
      const source = new EventSource(`/api/fetch/stream?type=${type}`);
      source.onmessage = (e: MessageEvent) => {
        const data = JSON.parse(e.data as string) as FetchStreamEvent;
        observer.next(data);
        if (data.type === 'done') { source.close(); observer.complete(); }
      };
      source.onerror = () => {
        source.close();
        observer.error(new Error('Erreur de connexion au serveur de fetch'));
      };
      return () => source.close();
    });
  }
}

