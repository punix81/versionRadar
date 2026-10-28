import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildHttpsOptions, resolveTlsConfig } from '../http-utils';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('buildHttpsOptions', () => {
  it('validates certificates by default', () => {
    const options = buildHttpsOptions(new URL('https://example.invalid/file.json'), {});
    expect(options.rejectUnauthorized).toBe(true);
  });

  it('disables validation only when explicitly requested', () => {
    const options = buildHttpsOptions(new URL('https://example.invalid/file.json'), {}, { insecure: true });
    expect(options.rejectUnauthorized).toBe(false);
  });

  it('keeps the original hostname for TLS and HTTP when an IP override is used', () => {
    const options = buildHttpsOptions(
      new URL('https://internal.invalid/path?x=1'),
      { Authorization: 'redacted' },
      { insecure: false },
      { 'internal.invalid': '10.0.0.5' }
    );

    expect(options.hostname).toBe('10.0.0.5');
    expect(options.servername).toBe('internal.invalid');
    expect((options.headers as Record<string, string>)['Host']).toBe('internal.invalid');
    expect(options.path).toBe('/path?x=1');
  });

  it('adds extra CA certificates when provided', () => {
    const options = buildHttpsOptions(new URL('https://example.invalid/'), {}, { insecure: false, ca: ['PEM'] });
    expect(options.ca).toEqual(['PEM']);
    expect(options.rejectUnauthorized).toBe(true);
  });
});

describe('resolveTlsConfig', () => {
  it('is secure by default', () => {
    expect(resolveTlsConfig({})).toEqual({ insecure: false });
  });

  it('requires an explicit opt-in for the insecure mode', () => {
    expect(resolveTlsConfig({ VERSIONRADAR_TLS_INSECURE: '1' })).toEqual({ insecure: true });
    expect(resolveTlsConfig({ VERSIONRADAR_TLS_INSECURE: '0' })).toEqual({ insecure: false });
  });

  it('reads a PEM bundle for internal CAs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'versionradar-ca-'));
    tempDirs.push(dir);
    const caFile = path.join(dir, 'ca.pem');
    fs.writeFileSync(caFile, '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n');

    const config = resolveTlsConfig({ VERSIONRADAR_CA_FILE: caFile });
    expect(config.insecure).toBe(false);
    expect(config.ca?.[0]).toContain('BEGIN CERTIFICATE');
  });

  it('rejects a CA file without a certificate', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'versionradar-ca-'));
    tempDirs.push(dir);
    const caFile = path.join(dir, 'not-a-cert.pem');
    fs.writeFileSync(caFile, 'hello');

    expect(() => resolveTlsConfig({ VERSIONRADAR_CA_FILE: caFile })).toThrow(/PEM/);
  });
});
