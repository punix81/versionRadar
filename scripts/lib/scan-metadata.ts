/**
 * Scan metadata: the only source of a real scan date.
 *
 * The generated JSON assets carry no timestamp. Without this record, the MCP
 * server must report `lastScanAt: null`; a file modification time is never
 * promoted to a scan date.
 *
 * A partially failed retrieval is recorded as `partial` and never as `success`,
 * so a partially refreshed dataset cannot be presented as a complete scan.
 */

import * as fs from 'fs';
import * as path from 'path';
import { writeJsonAtomic } from './results';

export type ScanStatus = 'success' | 'partial' | 'failed';
export type ScanDataset = 'repositories' | 'pipelines';

export interface ScanRecord {
  /** ISO timestamp when the retrieval started. */
  startedAt: string;
  /** ISO timestamp when the retrieval finished. */
  finishedAt: string;
  status: ScanStatus;
  total: number;
  succeeded: number;
  failed: number;
}

export interface ScanMetadata {
  version: 1;
  repositories?: ScanRecord;
  pipelines?: ScanRecord;
}

export const SCAN_METADATA_RELATIVE_PATH = path.join('src', 'assets', 'data', 'scan-metadata.json');

export function scanMetadataPath(rootDir: string): string {
  return path.join(rootDir, SCAN_METADATA_RELATIVE_PATH);
}

/**
 * Derives the status from real retrieval results.
 * `success` requires at least one item and zero failures.
 */
export function buildScanRecord(
  timestamps: { startedAt: string; finishedAt: string },
  results: Array<{ status: string }>
): ScanRecord {
  const total = results.length;
  const succeeded = results.filter(result => result.status === 'success').length;
  const failed = total - succeeded;

  let status: ScanStatus;
  if (total > 0 && failed === 0) {
    status = 'success';
  } else if (succeeded > 0) {
    status = 'partial';
  } else {
    status = 'failed';
  }

  return {
    startedAt: timestamps.startedAt,
    finishedAt: timestamps.finishedAt,
    status,
    total,
    succeeded,
    failed,
  };
}

export interface ScanMetadataRead {
  metadata: ScanMetadata;
  error: string | null;
  exists: boolean;
}

/** Reads the metadata file. A malformed file yields an error and no record. */
export function readScanMetadata(rootDir: string): ScanMetadataRead {
  const filePath = scanMetadataPath(rootDir);
  if (!fs.existsSync(filePath)) {
    return { metadata: { version: 1 }, error: null, exists: false };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ScanMetadata;
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) {
      return { metadata: { version: 1 }, error: 'scan-metadata.json: version inattendue', exists: true };
    }
    return { metadata: parsed, error: null, exists: true };
  } catch (error) {
    return {
      metadata: { version: 1 },
      error: `scan-metadata.json: illisible (${error instanceof Error ? error.message : 'JSON invalide'})`,
      exists: true,
    };
  }
}

/** Records one dataset result and preserves the other dataset record. */
export function recordScan(rootDir: string, dataset: ScanDataset, record: ScanRecord): void {
  const { metadata } = readScanMetadata(rootDir);
  const next: ScanMetadata = { ...metadata };
  next.version = 1;
  next[dataset] = record;
  writeJsonAtomic(scanMetadataPath(rootDir), next);
}
