/**
 * Read model over the generated dashboard assets.
 *
 * Freshness is explicit and threefold:
 * - `modifiedAt`: when the JSON file was written (checkout, copy, generation);
 * - `lastScanAt`: a real scan date, taken only from `scan-metadata.json`, and only
 *   when the latest attempt completed without any failure;
 * - `null`: no reliable scan date is available.
 *
 * A file modification time is never presented as a scan date.
 */

import * as fs from 'fs';
import * as path from 'path';
import { findProjectRoot } from './scanner-context';
import { ScanRecord, ScanStatus, readScanMetadata } from './scan-metadata';

export type EntryState = 'available' | 'failed' | 'pending' | 'missing' | 'unknown';

export interface RepositoryEntry {
  name: string;
  platform: string;
  project: string;
  repo: string;
  status: string;
  packageVersions: Record<string, string | null>;
  packageName?: string;
  packageVersion?: string;
  nginxVersion?: string | null;
  allDependencies?: Record<string, string>;
  lockDependencies?: Record<string, string>;
  error?: string;
}

export interface PipelineEntry {
  name: string;
  project: string;
  repo: string;
  status: string;
  pipelineVersions: Record<string, string | null>;
  chartName?: string;
  chartVersion?: string;
  nodeVersion?: string | null;
  allDependencies?: Array<{ name: string; version?: string; repository?: string }>;
  error?: string;
}

export interface DatasetFreshness {
  file: string;
  exists: boolean;
  /** File write time (ISO). Never a scan date. */
  modifiedAt: string | null;
  /** Always false: the assets store no scan timestamp. */
  modifiedAtIsScanDate: false;
  /** Real scan completion date, only when the latest attempt fully succeeded. */
  lastScanAt: string | null;
  /** Date of the latest attempt, including failed or partial ones. */
  lastAttemptAt: string | null;
  lastAttemptStatus: ScanStatus | null;
  note: string;
}

export interface Snapshot {
  rootDir: string;
  repositories: RepositoryEntry[];
  pipelines: PipelineEntry[];
  freshness: { repositories: DatasetFreshness; pipelines: DatasetFreshness };
  counts: { repositories: number; pipelines: number };
  scanMetadata: { available: boolean; error: string | null };
  warnings: string[];
}

export const MODIFIED_AT_NOTE = 'modifiedAt is the file write time (checkout, copy or generation), not a scan date.';
export const NO_SCAN_NOTE = 'No successful scan is recorded in scan-metadata.json, so lastScanAt is null.';
export const SCAN_DATE_NOTE = 'lastScanAt comes from the scan metadata written by the fetcher.';

export function normalizeState(status: string | undefined): EntryState {
  switch (status) {
    case 'success':
      return 'available';
    case 'error':
      return 'failed';
    case 'pending':
      return 'pending';
    case undefined:
      return 'missing';
    default:
      return 'unknown';
  }
}

function buildFreshness(
  rootDir: string,
  relativePath: string,
  record: ScanRecord | undefined
): DatasetFreshness {
  const file = path.join(rootDir, relativePath);
  const exists = fs.existsSync(file);
  const modifiedAt = exists ? fs.statSync(file).mtime.toISOString() : null;

  const lastScanAt = record && record.status === 'success' ? record.finishedAt : null;
  const noteParts = [MODIFIED_AT_NOTE];
  noteParts.push(lastScanAt ? SCAN_DATE_NOTE : NO_SCAN_NOTE);
  if (record && record.status !== 'success') {
    noteParts.push(`The latest attempt (${record.finishedAt}) is "${record.status}" and is not a successful scan.`);
  }

  return {
    file,
    exists,
    modifiedAt,
    modifiedAtIsScanDate: false,
    lastScanAt,
    lastAttemptAt: record?.finishedAt ?? null,
    lastAttemptStatus: record?.status ?? null,
    note: noteParts.join(' '),
  };
}

function readJsonArray<T>(filePath: string, warnings: string[], label: string): T[] {
  if (!fs.existsSync(filePath)) {
    warnings.push(`${label}: fichier absent (${filePath})`);
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    if (!Array.isArray(parsed)) {
      warnings.push(`${label}: contenu inattendu (tableau attendu)`);
      return [];
    }
    return parsed as T[];
  } catch (error) {
    warnings.push(`${label}: fichier illisible (${error instanceof Error ? error.message : 'JSON invalide'})`);
    return [];
  }
}

/** Reads the generated assets. Never performs network access and never writes. */
export function readSnapshot(options: { rootDir?: string } = {}): Snapshot {
  const rootDir = options.rootDir ?? findProjectRoot();
  const warnings: string[] = [];

  const metadataRead = readScanMetadata(rootDir);
  if (metadataRead.error) {
    warnings.push(metadataRead.error);
  }

  const repositories = readJsonArray<RepositoryEntry>(
    path.join(rootDir, 'src', 'assets', 'data', 'repositories.json'),
    warnings,
    'repositories.json'
  );
  const pipelines = readJsonArray<PipelineEntry>(
    path.join(rootDir, 'src', 'assets', 'data', 'pipelines.json'),
    warnings,
    'pipelines.json'
  );

  return {
    rootDir,
    repositories,
    pipelines,
    freshness: {
      repositories: buildFreshness(
        rootDir,
        path.join('src', 'assets', 'data', 'repositories.json'),
        metadataRead.metadata.repositories
      ),
      pipelines: buildFreshness(
        rootDir,
        path.join('src', 'assets', 'data', 'pipelines.json'),
        metadataRead.metadata.pipelines
      ),
    },
    counts: { repositories: repositories.length, pipelines: pipelines.length },
    scanMetadata: { available: metadataRead.exists, error: metadataRead.error },
    warnings,
  };
}

/** Case-insensitive lookup by project name, then by repository slug. */
export function findRepository(snapshot: Snapshot, name: string): RepositoryEntry | undefined {
  const needle = name.trim().toLowerCase();
  return (
    snapshot.repositories.find(entry => entry.name.toLowerCase() === needle) ??
    snapshot.repositories.find(entry => entry.repo.toLowerCase() === needle)
  );
}

export function findPipeline(snapshot: Snapshot, name: string): PipelineEntry | undefined {
  const needle = name.trim().toLowerCase();
  return (
    snapshot.pipelines.find(entry => entry.name.toLowerCase() === needle) ??
    snapshot.pipelines.find(entry => entry.repo.toLowerCase() === needle)
  );
}
