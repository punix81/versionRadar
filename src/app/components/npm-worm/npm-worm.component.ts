import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ConfigService, MaliciousPackage } from '../../services/config.service';
import { RepositoryResult } from '../../services/version-monitoring.service';

interface NpmWormProjectResult {
  project: string;
  lockPackageCount: number;
  contaminatedPackageCount: number;
  isSecure: boolean;
}

@Component({
  selector: 'app-npm-worm',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './npm-worm.component.html',
  styleUrl: './npm-worm.component.scss'
})
export class NpmWormComponent {
  @Input() repositories: RepositoryResult[] = [];

  readonly config = inject(ConfigService);

  projectResults(): NpmWormProjectResult[] {
    const malicious = this.config.maliciousPackages();
    const successfulRepositories = this.repositories.filter(repository => repository.status === 'success');
    if (!successfulRepositories.length) return [];

    const maliciousByName = new Map<string, MaliciousPackage[]>();
    for (const entry of malicious) {
      const normalizedName = this.normalizeName(entry.name);
      const entries = maliciousByName.get(normalizedName) ?? [];
      entries.push(entry);
      maliciousByName.set(normalizedName, entries);
    }

    const projectPackages = new Map<string, Set<string>>();
    const projectContaminatedPackages = new Map<string, Set<string>>();

    for (const repository of successfulRepositories) {
      if (!projectPackages.has(repository.project)) {
        projectPackages.set(repository.project, new Set<string>());
      }

      const lockDependencies = repository.lockDependencies ?? {};

      for (const [packageName, installedVersion] of Object.entries(lockDependencies)) {
        if (!installedVersion) continue;

        const packageKey = `${this.normalizeName(packageName)}@${this.normalizeVersion(installedVersion)}`;
        projectPackages.get(repository.project)!.add(packageKey);

        const maliciousEntries = maliciousByName.get(this.normalizeName(packageName)) ?? [];
        for (const maliciousEntry of maliciousEntries) {
          if (this.versionMatches(installedVersion, maliciousEntry.version)) {
            const contaminated = projectContaminatedPackages.get(repository.project) ?? new Set<string>();
            contaminated.add(packageKey);
            projectContaminatedPackages.set(repository.project, contaminated);
          }
        }
      }
    }

    return Array.from(projectPackages.entries())
      .map(([project, packages]) => {
        const contaminatedCount = projectContaminatedPackages.get(project)?.size ?? 0;
        return {
          project,
          lockPackageCount: packages.size,
          contaminatedPackageCount: contaminatedCount,
          isSecure: contaminatedCount === 0
        };
      })
      .sort((a, b) => a.project.localeCompare(b.project));
  }

  contaminatedProjectCount(): number {
    return this.projectResults().filter(result => !result.isSecure).length;
  }

  contaminatedPackageCount(): number {
    return this.projectResults().reduce((total, result) => total + result.contaminatedPackageCount, 0);
  }

  hasCsvFile(): boolean {
    return this.config.hasMaliciousPackagesCsv();
  }

  requireCsvFile(): void {
    this.config.requireMaliciousPackagesCsv();
  }

  getMatchStatusClass(): string {
    return this.contaminatedPackageCount() > 0 ? 'error' : 'success';
  }

  private versionMatches(installedVersion: string, maliciousVersion: string | null): boolean {
    if (!maliciousVersion) return true;
    return this.normalizeVersion(installedVersion) === this.normalizeVersion(maliciousVersion);
  }

  private normalizeName(name: string): string {
    return name.trim().toLowerCase();
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
