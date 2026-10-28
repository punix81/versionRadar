import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getCredentialStatus, loadEnvironment, parseEnvFile, resolveEnvFilePath } from './env';
import { createFixtureEnvFile, SENTINEL_SECRET } from '../test/fixtures';

let tempDir: string;
const originalEnv = { ...process.env };

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'versionradar-env-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  process.env = { ...originalEnv };
});

describe('parseEnvFile', () => {
  it('parses simple values, ignores comments and strips quotes', () => {
    const parsed = parseEnvFile(
      ['# comment', '', 'A=1', 'B="two"', "C='three'", 'NOT_A_LINE', '1INVALID=x', 'D=a=b'].join('\n')
    );
    expect(parsed).toEqual({ A: '1', B: 'two', C: 'three', D: 'a=b' });
  });
});

describe('resolveEnvFilePath', () => {
  it('expands a home-relative path', () => {
    const resolved = resolveEnvFilePath('~/custom/path.env');
    expect(resolved.startsWith(os.homedir())).toBe(true);
    expect(resolved.endsWith('custom/path.env')).toBe(true);
  });
});

describe('loadEnvironment', () => {
  it('applies non-empty file values over stale process values and ignores empty ones', () => {
    const envPath = createFixtureEnvFile(tempDir, { AZUREDEVOPS_TOKEN: 'from-file', OTHER: 'value', EMPTY: '' });
    process.env['AZUREDEVOPS_TOKEN'] = 'from-process';

    const status = loadEnvironment({ path: envPath });

    expect(status.exists).toBe(true);
    expect(status.restrictivePermissions).toBe(true);
    expect(process.env['AZUREDEVOPS_TOKEN']).toBe('from-file');
    expect(process.env['OTHER']).toBe('value');
    expect(status.keys).toEqual(['AZUREDEVOPS_TOKEN', 'OTHER', 'EMPTY']);
    expect(process.env['EMPTY']).toBeUndefined();
  });

  it('warns when the file is readable by other users', () => {
    const envPath = createFixtureEnvFile(tempDir, { A: '1' });
    fs.chmodSync(envPath, 0o644);
    const warn = vi.fn();

    const status = loadEnvironment({ path: envPath, warn });

    expect(status.restrictivePermissions).toBe(false);
    expect(status.mode).toBe('644');
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('chmod 600');
  });

  it('reports a missing file without failing', () => {
    const status = loadEnvironment({ path: path.join(tempDir, 'missing.env'), warn: () => undefined });
    expect(status).toEqual({
      path: path.join(tempDir, 'missing.env'),
      exists: false,
      restrictivePermissions: false,
      mode: null,
      keys: [],
    });
  });
});

describe('getCredentialStatus', () => {
  it('reports presence only and never returns a value', () => {
    const envPath = createFixtureEnvFile(tempDir, {
      AZUREDEVOPS_USER: 'user',
      AZUREDEVOPS_TOKEN: SENTINEL_SECRET,
      BITBUCKET_USER: 'user',
    });

    const status = getCredentialStatus({ path: envPath });
    const serialized = JSON.stringify(status);

    expect(status.azure.userConfigured).toBe(true);
    expect(status.azure.tokenConfigured).toBe(true);
    expect(status.azure.defaultCollection18TokenConfigured).toBe(false);
    expect(status.bitbucket.tokenConfigured).toBe(false);
    expect(serialized).not.toContain(SENTINEL_SECRET);
    expect(serialized).not.toContain('SENTINEL');
  });
});
