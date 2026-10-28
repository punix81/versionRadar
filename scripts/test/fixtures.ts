/**
 * Anonymised fixtures for VersionRadar tests.
 * No real repository, host, user or credential value appears here.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface FixtureRoot {
  rootDir: string;
  cleanup: () => void;
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function createFixtureRoot(): FixtureRoot {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'versionradar-fixture-'));

  writeJson(path.join(rootDir, 'config', 'package-repositories.json'), {
    filePath: 'package.json',
    packageNames: ['zone.js', '@oblique/oblique', '@angular/cdk'],
    repositories: [
      { platform: 'bitbucket', project: 'PROJECT_ALPHA', repo: 'alpha-ui', name: 'alpha-ui', path: 'package.json' },
      { platform: 'azure', project: 'PROJECT_BETA', repo: 'beta-ui', name: 'beta-ui', path: 'frontend/package.json', collection: 'DefaultCollection' },
    ],
  });

  writeJson(path.join(rootDir, 'config', 'repositories.json'), {
    filePath: 'pipeline/Chart.yaml',
    valuesFilePath: 'pipeline/values.yaml',
    pipelineNames: ['commons-pipeline'],
    repositories: [
      { project: 'PROJECT_ALPHA', repo: 'gitops-alpha', name: 'gitops-alpha' },
      { project: 'PROJECT_BETA', repo: 'gitops-beta', name: 'gitops-beta' },
    ],
  });

  writeJson(path.join(rootDir, 'config', 'messages.json'), {
    app: { title: 'Fixture', subtitle: '', dateLabel: '', fileLabel: '', repoCountLabel: '' },
    display: { repoIcon: '', separator: '-', separatorLength: 10, chartLabel: 'Chart' },
    status: { fetching: '', success: '', warning: '', notFound: '', error: '' },
    summary: { icon: '', label: '', success: '', errors: '', on: '', repositories: '' },
    table: {
      title: '',
      headers: { repository: '', status: '' },
      statusOk: '',
      statusError: '',
    },
    errors: { missingCredentials: 'credentials missing', parseError: 'parse error', timeout: 'timeout' },
  });

  writeJson(path.join(rootDir, 'src', 'assets', 'data', 'repositories.json'), [
    {
      name: 'alpha-ui',
      platform: 'bitbucket',
      project: 'PROJECT_ALPHA',
      repo: 'alpha-ui',
      status: 'success',
      packageVersions: { 'zone.js': '^0.15.1', '@oblique/oblique': '^14.1.1', '@angular/cdk': '^20.2.12' },
      packageName: 'alpha-ui',
      packageVersion: '1.0.0',
      nginxVersion: '1.26',
      allDependencies: { '@angular/core': '^20.2.0', '@angular/cdk': '^20.2.12', 'zone.js': '^0.15.1' },
      lockDependencies: { 'left-pad': '1.3.0', 'event-stream': '3.3.6' },
    },
    {
      name: 'beta-ui',
      platform: 'azure',
      project: 'PROJECT_BETA',
      repo: 'beta-ui',
      status: 'success',
      packageVersions: { 'zone.js': null, '@oblique/oblique': '15.1.3', '@angular/cdk': '19.1.5' },
      packageName: 'beta-ui',
      packageVersion: '2.0.0',
      nginxVersion: null,
      allDependencies: { '@angular/core': '19.1.0', '@angular/cdk': '19.1.5' },
      lockDependencies: { 'left-pad': '1.3.0' },
    },
    {
      name: 'gamma-api',
      platform: 'azure',
      project: 'PROJECT_GAMMA',
      repo: 'gamma-api',
      status: 'error',
      error: 'HTTP 401',
      packageVersions: { 'zone.js': null, '@oblique/oblique': null, '@angular/cdk': null },
    },
  ]);

  writeJson(path.join(rootDir, 'src', 'assets', 'data', 'pipelines.json'), [
    {
      name: 'gitops-alpha',
      project: 'PROJECT_ALPHA',
      repo: 'gitops-alpha',
      status: 'success',
      pipelineVersions: { 'commons-pipeline': '2.2.0' },
      chartName: 'alpha-chart',
      chartVersion: '1.0.0',
      nodeVersion: '22',
      allDependencies: [{ name: 'commons-pipeline', version: '2.2.0', repository: 'https://example.invalid/charts' }],
    },
    {
      name: 'gitops-beta',
      project: 'PROJECT_BETA',
      repo: 'gitops-beta',
      status: 'success',
      pipelineVersions: { 'commons-pipeline': '2.4.0' },
      chartName: 'beta-chart',
      chartVersion: '1.0.0',
      nodeVersion: '20',
      allDependencies: [{ name: 'commons-pipeline', version: '2.4.0', repository: 'https://example.invalid/charts' }],
    },
  ]);

  return {
    rootDir,
    cleanup: () => fs.rmSync(rootDir, { recursive: true, force: true }),
  };
}

/** Marker used to prove that credential values never leak into tool output. */
export const SENTINEL_SECRET = 'SENTINEL_SECRET_VALUE_MUST_NOT_APPEAR';

/** Writes a restrictive env file and returns its path. */
export function createFixtureEnvFile(rootDir: string, values: Record<string, string>): string {
  const envPath = path.join(rootDir, 'versionRadar.env');
  const content = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  fs.writeFileSync(envPath, content, { encoding: 'utf-8', mode: 0o600 });
  fs.chmodSync(envPath, 0o600);
  return envPath;
}
