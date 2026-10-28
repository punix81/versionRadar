import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createFixtureRoot, FixtureRoot } from '../test/fixtures';
import { buildScanRecord, readScanMetadata, recordScan, scanMetadataPath } from './scan-metadata';

let fixture: FixtureRoot | null = null;

afterEach(() => {
  fixture?.cleanup();
  fixture = null;
});

const timestamps = { startedAt: '2026-09-03T08:00:00.000Z', finishedAt: '2026-09-03T08:32:48.000Z' };

describe('buildScanRecord', () => {
  it('marks a complete retrieval as success', () => {
    const record = buildScanRecord(timestamps, [{ status: 'success' }, { status: 'success' }]);

    expect(record.status).toBe('success');
    expect(record.total).toBe(2);
    expect(record.succeeded).toBe(2);
    expect(record.failed).toBe(0);
    expect(record.finishedAt).toBe(timestamps.finishedAt);
  });

  it('marks a partially failed retrieval as partial, never success', () => {
    const record = buildScanRecord(timestamps, [{ status: 'success' }, { status: 'error' }]);

    expect(record.status).toBe('partial');
    expect(record.succeeded).toBe(1);
    expect(record.failed).toBe(1);
  });

  it('marks a fully failed retrieval as failed', () => {
    const record = buildScanRecord(timestamps, [{ status: 'error' }]);

    expect(record.status).toBe('failed');
    expect(record.succeeded).toBe(0);
  });

  it('never reports success when nothing was retrieved', () => {
    const record = buildScanRecord(timestamps, []);

    expect(record.status).toBe('failed');
    expect(record.total).toBe(0);
  });
});

describe('recordScan', () => {
  it('writes a parseable metadata file with restrictive defaults', () => {
    fixture = createFixtureRoot();
    recordScan(fixture.rootDir, 'repositories', buildScanRecord(timestamps, [{ status: 'success' }]));

    const filePath = scanMetadataPath(fixture.rootDir);
    expect(fs.existsSync(filePath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    expect(parsed['version']).toBe(1);
    expect((parsed['repositories'] as Record<string, unknown>)['status']).toBe('success');
  });

  it('preserves the other dataset record', () => {
    fixture = createFixtureRoot();
    recordScan(fixture.rootDir, 'repositories', buildScanRecord(timestamps, [{ status: 'success' }]));
    recordScan(fixture.rootDir, 'pipelines', buildScanRecord(timestamps, [{ status: 'error' }]));

    const { metadata } = readScanMetadata(fixture.rootDir);

    expect(metadata.repositories?.status).toBe('success');
    expect(metadata.pipelines?.status).toBe('failed');
  });
});

describe('readScanMetadata', () => {
  it('reports an absent file without error', () => {
    fixture = createFixtureRoot();
    const result = readScanMetadata(fixture.rootDir);

    expect(result.exists).toBe(false);
    expect(result.error).toBeNull();
    expect(result.metadata.repositories).toBeUndefined();
  });

  it('reports a malformed file as an explicit error', () => {
    fixture = createFixtureRoot();
    fs.writeFileSync(scanMetadataPath(fixture.rootDir), '{ broken', 'utf-8');

    const result = readScanMetadata(fixture.rootDir);

    expect(result.exists).toBe(true);
    expect(result.error).toContain('scan-metadata.json');
    expect(result.metadata.repositories).toBeUndefined();
  });

  it('rejects an unexpected schema version', () => {
    fixture = createFixtureRoot();
    fs.writeFileSync(scanMetadataPath(fixture.rootDir), JSON.stringify({ version: 99 }), 'utf-8');

    const result = readScanMetadata(fixture.rootDir);

    expect(result.error).toContain('version inattendue');
  });
});
