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

export interface MaliciousPackage {
  name: string;
  version: string | null;
}

interface CsvParseResult {
  packages: MaliciousPackage[];
  skippedRows: number;
}

export interface EnvConfig {
  AZUREDEVOPS_TOKEN: string;
  AZUREDEVOPS_TOKEN_DEFAULTCOLLECTION18: string;
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
  private readonly maliciousCsvStorageKey = 'versionRadar.maliciousPackagesCsv';
  private readonly maliciousCsvFileNameStorageKey = 'versionRadar.maliciousPackagesCsvFileName';

  /** Incrémenté à chaque sauvegarde réussie — le dashboard l'observe pour se recharger */
  readonly savedVersion = signal(0);
  readonly maliciousPackages = signal<MaliciousPackage[]>([]);
  readonly maliciousCsvFileName = signal<string | null>(null);
  readonly maliciousCsvSkippedRows = signal(0);
  readonly maliciousCsvError = signal<string | null>(null);

  constructor() {
    this.restoreMaliciousCsv();
  }

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

  async loadMaliciousPackagesCsvFile(file: File): Promise<void> {
    const text = await file.text();
    this.loadMaliciousPackagesCsvContent(file.name, text);
  }

  loadMaliciousPackagesCsvContent(fileName: string, text: string): void {
    this.maliciousCsvFileName.set(fileName);
    this.maliciousCsvError.set(null);

    const result = this.parseCsv(text);
    this.maliciousPackages.set(result.packages);
    this.maliciousCsvSkippedRows.set(result.skippedRows);

    if (!result.packages.length) {
      this.maliciousCsvError.set('npm_worm.error_no_rows');
      localStorage.removeItem(this.maliciousCsvStorageKey);
      localStorage.removeItem(this.maliciousCsvFileNameStorageKey);
      return;
    }

    localStorage.setItem(this.maliciousCsvStorageKey, text);
    localStorage.setItem(this.maliciousCsvFileNameStorageKey, fileName);
  }

  clearMaliciousPackagesCsv(): void {
    this.maliciousPackages.set([]);
    this.maliciousCsvFileName.set(null);
    this.maliciousCsvSkippedRows.set(0);
    this.maliciousCsvError.set(null);
    localStorage.removeItem(this.maliciousCsvStorageKey);
    localStorage.removeItem(this.maliciousCsvFileNameStorageKey);
  }

  private restoreMaliciousCsv(): void {
    const text = localStorage.getItem(this.maliciousCsvStorageKey);
    const fileName = localStorage.getItem(this.maliciousCsvFileNameStorageKey);
    if (!text || !fileName) return;

    try {
      const result = this.parseCsv(text);
      this.maliciousPackages.set(result.packages);
      this.maliciousCsvFileName.set(fileName);
      this.maliciousCsvSkippedRows.set(result.skippedRows);
    } catch {
      this.clearMaliciousPackagesCsv();
    }
  }

  private parseCsv(csv: string): CsvParseResult {
    const rows = this.parseCsvRows(csv, this.detectDelimiter(csv)).filter(row =>
      row.some(cell => cell.trim().length > 0)
    );
    if (!rows.length) {
      return { packages: [], skippedRows: 0 };
    }

    const delimiterInfo = this.resolveColumns(rows[0]);
    const dataRows = delimiterInfo.hasHeader ? rows.slice(1) : rows;
    const seen = new Set<string>();
    let skippedRows = 0;

    const packages = dataRows.reduce<MaliciousPackage[]>((acc, row) => {
      const name = row[delimiterInfo.nameIndex]?.trim();
      const version = row[delimiterInfo.versionIndex]?.trim() || null;

      if (!name) {
        skippedRows += 1;
        return acc;
      }

      const cleanVersion = version ? this.normalizeVersion(version) : null;
      const key = `${this.normalizeName(name)}@${cleanVersion ?? '*'}`;
      if (!seen.has(key)) {
        acc.push({ name, version: cleanVersion });
        seen.add(key);
      }

      return acc;
    }, []);

    return { packages, skippedRows };
  }

  private parseCsvRows(csv: string, delimiter: ',' | ';'): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let inQuotes = false;

    for (let i = 0; i < csv.length; i += 1) {
      const char = csv[i];
      const nextChar = csv[i + 1];

      if (char === '"' && inQuotes && nextChar === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        row.push(value);
        value = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') i += 1;
        row.push(value);
        rows.push(row);
        row = [];
        value = '';
      } else {
        value += char;
      }
    }

    row.push(value);
    rows.push(row);

    return rows;
  }

  private detectDelimiter(csv: string): ',' | ';' {
    const firstLine = csv.split(/\r?\n/, 1)[0] ?? '';
    let commaCount = 0;
    let semicolonCount = 0;
    let inQuotes = false;

    for (const char of firstLine) {
      if (char === '"') inQuotes = !inQuotes;
      if (!inQuotes && char === ',') commaCount += 1;
      if (!inQuotes && char === ';') semicolonCount += 1;
    }

    return semicolonCount > commaCount ? ';' : ',';
  }

  private resolveColumns(firstRow: string[]): { hasHeader: boolean; nameIndex: number; versionIndex: number } {
    const headers = firstRow.map(cell => this.normalizeHeader(cell));
    const nameIndex = headers.findIndex(header =>
      ['package', 'package_name', 'packagename', 'name', 'npm_package', 'npm'].includes(header)
    );
    const versionIndex = headers.findIndex(header =>
      ['version', 'package_version', 'packageversion', 'versions', 'malicious_version'].includes(header)
    );

    if (nameIndex >= 0) {
      return {
        hasHeader: true,
        nameIndex,
        versionIndex: versionIndex >= 0 ? versionIndex : 1
      };
    }

    return {
      hasHeader: false,
      nameIndex: 0,
      versionIndex: 1
    };
  }

  private normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }

  private normalizeHeader(header: string): string {
    return header.trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  private normalizeVersion(version: string): string {
    return version
      .trim()
      .replace(/^npm:/, '')
      .replace(/^[\^~<>=\s]+/, '')
      .replace(/^v/i, '')
      .split(' ')[0];
  }
}
