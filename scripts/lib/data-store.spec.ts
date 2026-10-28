import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createFixtureRoot, FixtureRoot } from '../test/fixtures';
import {
  MODIFIED_AT_NOTE,
  NO_SCAN_NOTE,
  findPipeline,
  findRepository,
  normalizeState,
  readSnapshot,
} from './data-store';
import { ScanRecord } from './scan-metadata';

let fixture: FixtureRoot | null = null;

afterEach(() => {
  fixture?.cleanup();
  fixture = null;
});

function writeMetadata(rootDir: string, records: { repositories?: ScanRecord; pipelines?: ScanRecord }): void {
  fs.writeFileSync(
    path.join(rootDir, 'src', 'assets', 'data', 'scan-metadata.json'),
    JSON.stringify({ version: 1, ...records }, null, 2),
    'utf-8'
  );
}

const successRecord: ScanRecord = {
  startedAt: '2026-09-03T08:00:00.000Z',
  finishedAt: '2026-09-03T08:32:48.000Z',
  status: 'success',
  total: 3,
  succeeded: 3,
  failed: 0,
};

describe('readSnapshot', () => {
  it('reads generated assets and exposes counts', () => {
    fixture = createFixtureRoot();
    const snapshot = readSnapshot({ rootDir: fixture.rootDir });

    expect(snapshot.counts).toEqual({ repositories: 3, pipelines: 2 });
    expect(snapshot.repositories[0].name).toBe('alpha-ui');
    expect(snapshot.warnings).toEqual([]);
  });

  it('never presents the file modification time as a scan date', () => {
    fixture = createFixtureRoot();
    const snapshot = readSnapshot({ rootDir: fixture.rootDir });

    expect(snapshot.freshness.repositories.exists).toBe(true);
    expect(snapshot.freshness.repositories.modifiedAt).not.toBeNull();
    expect(snapshot.freshness.repositories.modifiedAtIsScanDate).toBe(false);
    expect(snapshot.freshness.repositories.note).toContain(MODIFIED_AT_NOTE);
    expect(snapshot.freshness.repositories.note).toContain('not a scan date');
  });

  it('returns lastScanAt null when no scan metadata exists', () => {
    fixture = createFixtureRoot();
    const snapshot = readSnapshot({ rootDir: fixture.rootDir });

    expect(snapshot.scanMetadata.available).toBe(false);
    expect(snapshot.freshness.repositories.lastScanAt).toBeNull();
    expect(snapshot.freshness.repositories.lastAttemptAt).toBeNull();
    expect(snapshot.freshness.repositories.lastAttemptStatus).toBeNull();
    expect(snapshot.freshness.repositories.note).toContain(NO_SCAN_NOTE);
  });

  it('exposes a real scan date only for a fully successful scan', () => {
    fixture = createFixtureRoot();
    writeMetadata(fixture.rootDir, { repositories: successRecord });

    const snapshot = readSnapshot({ rootDir: fixture.rootDir });

    expect(snapshot.scanMetadata.available).toBe(true);
    expect(snapshot.freshness.repositories.lastScanAt).toBe('2026-09-03T08:32:48.000Z');
    expect(snapshot.freshness.repositories.lastAttemptStatus).toBe('success');
    expect(snapshot.freshness.repositories.note).toContain('comes from the scan metadata');
    // The pipelines dataset has no record at all.
    expect(snapshot.freshness.pipelines.lastScanAt).toBeNull();
  });

  it('does not treat a partially failed scan as a successful scan', () => {
    fixture = createFixtureRoot();
    writeMetadata(fixture.rootDir, {
      repositories: { ...successRecord, status: 'partial', succeeded: 2, failed: 1 },
    });

    const snapshot = readSnapshot({ rootDir: fixture.rootDir });

    expect(snapshot.freshness.repositories.lastScanAt).toBeNull();
    expect(snapshot.freshness.repositories.lastAttemptAt).toBe('2026-09-03T08:32:48.000Z');
    expect(snapshot.freshness.repositories.lastAttemptStatus).toBe('partial');
    expect(snapshot.freshness.repositories.note).toContain('is "partial" and is not a successful scan');
  });

  it('does not treat a failed scan as a successful scan', () => {
    fixture = createFixtureRoot();
    writeMetadata(fixture.rootDir, {
      repositories: { ...successRecord, status: 'failed', succeeded: 0, failed: 3 },
    });

    const snapshot = readSnapshot({ rootDir: fixture.rootDir });

    expect(snapshot.freshness.repositories.lastScanAt).toBeNull();
    expect(snapshot.freshness.repositories.lastAttemptStatus).toBe('failed');
  });

  it('warns and ignores a malformed metadata file', () => {
    fixture = createFixtureRoot();
    fs.writeFileSync(path.join(fixture.rootDir, 'src', 'assets', 'data', 'scan-metadata.json'), '{ broken', 'utf-8');

    const snapshot = readSnapshot({ rootDir: fixture.rootDir });

    expect(snapshot.freshness.repositories.lastScanAt).toBeNull();
    expect(snapshot.warnings.some(warning => warning.includes('scan-metadata.json'))).toBe(true);
  });

  it('reports missing files as warnings instead of failing', () => {
    fixture = createFixtureRoot();
    fs.rmSync(path.join(fixture.rootDir, 'src', 'assets', 'data', 'pipelines.json'));

    const snapshot = readSnapshot({ rootDir: fixture.rootDir });

    expect(snapshot.counts.pipelines).toBe(0);
    expect(snapshot.freshness.pipelines.exists).toBe(false);
    expect(snapshot.warnings.some(warning => warning.includes('pipelines.json'))).toBe(true);
  });

  it('reports malformed JSON as a warning and empty data', () => {
    fixture = createFixtureRoot();
    fs.writeFileSync(path.join(fixture.rootDir, 'src', 'assets', 'data', 'repositories.json'), '{ broken', 'utf-8');

    const snapshot = readSnapshot({ rootDir: fixture.rootDir });

    expect(snapshot.repositories).toEqual([]);
    expect(snapshot.warnings.length).toBeGreaterThan(0);
  });
});

describe('normalizeState', () => {
  it('maps generator statuses to explicit states', () => {
    expect(normalizeState('success')).toBe('available');
    expect(normalizeState('error')).toBe('failed');
    expect(normalizeState('pending')).toBe('pending');
    expect(normalizeState(undefined)).toBe('missing');
    expect(normalizeState('something-else')).toBe('unknown');
  });
});

describe('lookups', () => {
  it('finds entries case-insensitively by name or slug', () => {
    fixture = createFixtureRoot();
    const snapshot = readSnapshot({ rootDir: fixture.rootDir });

    expect(findRepository(snapshot, 'ALPHA-UI')?.repo).toBe('alpha-ui');
    expect(findRepository(snapshot, 'gamma-api')?.status).toBe('error');
    expect(findRepository(snapshot, 'unknown-repo')).toBeUndefined();
    expect(findPipeline(snapshot, 'gitops-beta')?.chartName).toBe('beta-chart');
    expect(findPipeline(snapshot, 'nope')).toBeUndefined();
  });
});
