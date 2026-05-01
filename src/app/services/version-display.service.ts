import { Injectable } from '@angular/core';
import { RepositoryResult, PipelineResult } from './version-monitoring.service';

@Injectable({
  providedIn: 'root'
})
export class VersionDisplayService {

  getPackageNames(repo: RepositoryResult): string[] {
    return Object.keys(repo.packageVersions);
  }

  getPipelineNames(pipeline: PipelineResult): string[] {
    return Object.keys(pipeline.pipelineVersions);
  }

  getPackageUrl(packageName: string, version: string): string {
    const clean = version.replace(/[\^~]/, '');
    return `https://www.npmjs.com/package/${packageName}/v/${clean}`;
  }

  getPipelineUrl(pipeline: PipelineResult): string {
    const baseUrl = 'https://bitbucket.bit.admin.ch';
    return `${baseUrl}/projects/${pipeline.project}/repos/${pipeline.repo}/browse/pipeline/Chart.yaml`;
  }

  getStatusClass(repo: RepositoryResult): string {
    return repo.status === 'success' ? 'status-success' : 'status-error';
  }

  getPlatformIcon(platform: string): string {
    return platform === 'azure' ? '☁️' : '🔷';
  }
}

