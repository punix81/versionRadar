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
}

