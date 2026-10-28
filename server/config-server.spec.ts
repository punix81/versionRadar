import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { createApp } from './config-server';
import { SENTINEL_SECRET } from '../scripts/test/fixtures';

let tempDir: string;
let envPath: string;
let server: http.Server;
let port: number;

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

interface Response {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function request(
  method: string,
  requestPath: string,
  options: { headers?: Record<string, string>; body?: string } = {}
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path: requestPath, headers: options.headers },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk as Buffer));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf-8') })
        );
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'versionradar-server-'));
  envPath = path.join(tempDir, 'versionRadar.env');
  fs.writeFileSync(
    envPath,
    [
      'AZUREDEVOPS_USER=fixture-user',
      `AZUREDEVOPS_TOKEN=${SENTINEL_SECRET}`,
      `BITBUCKET_TOKEN=${SENTINEL_SECRET}`,
      'BITBUCKET_BASE_URL=https://bitbucket.example.invalid',
      'REQUEST_TIMEOUT_MS=30000',
      '',
    ].join('\n'),
    { encoding: 'utf-8', mode: 0o600 }
  );
  fs.chmodSync(envPath, 0o600);

  writeJson(path.join(tempDir, 'config', 'repositories.json'), {
    filePath: 'pipeline/Chart.yaml',
    pipelineNames: ['commons-pipeline'],
    repositories: [],
  });
  writeJson(path.join(tempDir, 'config', 'package-repositories.json'), {
    filePath: 'package.json',
    packageNames: ['zone.js'],
    repositories: [],
  });
  writeJson(path.join(tempDir, 'src', 'assets', 'data', 'pipelines.json'), []);
  writeJson(path.join(tempDir, 'src', 'assets', 'data', 'repositories.json'), []);

  const app = createApp({
    configDir: path.join(tempDir, 'config'),
    assetsDir: path.join(tempDir, 'src', 'assets', 'data'),
    envPath,
    rootDir: tempDir,
  });

  await new Promise<void>(resolve => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env['VERSIONRADAR_ADMIN_TOKEN'];
});

describe('config server - credential exposure', () => {
  it('never returns credential values', async () => {
    const response = await request('GET', '/api/config/env');

    expect(response.status).toBe(200);
    expect(response.body).not.toContain(SENTINEL_SECRET);
    expect(response.body).not.toContain('SENTINEL');

    const payload = JSON.parse(response.body) as {
      secrets: Record<string, boolean>;
      users: Record<string, string>;
      settings: Record<string, string>;
      envFilePath: string;
    };
    expect(payload.secrets).toEqual({
      AZUREDEVOPS_TOKEN: true,
      AZUREDEVOPS_TOKEN_DEFAULTCOLLECTION18: false,
      BITBUCKET_TOKEN: true,
    });
    expect(payload.users['AZUREDEVOPS_USER']).toBe('fixture-user');
    expect(payload.settings['BITBUCKET_BASE_URL']).toBe('https://bitbucket.example.invalid');
    expect(payload.envFilePath).toBe(envPath);
  });
});

describe('config server - request guards', () => {
  it('rejects cross-origin browser requests', async () => {
    const response = await request('GET', '/api/config/env', { headers: { Origin: 'http://evil.example' } });
    expect(response.status).toBe(403);
    expect(response.body).toContain('forbidden_origin');
  });

  it('allows the Angular dev server origin', async () => {
    const response = await request('GET', '/api/config/env', { headers: { Origin: 'http://localhost:4200' } });
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:4200');
  });

  it('requires a JSON body for writes', async () => {
    const response = await request('PUT', '/api/config/env', {
      headers: { 'Content-Type': 'text/plain' },
      body: 'AZUREDEVOPS_TOKEN=x',
    });
    expect(response.status).toBe(415);
    expect(response.body).toContain('json_required');
  });

  it('requires the admin token when configured', async () => {
    process.env['VERSIONRADAR_ADMIN_TOKEN'] = 'admin-token-value';

    const withoutToken = await request('PUT', '/api/config/env', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: {} }),
    });
    expect(withoutToken.status).toBe(401);

    const withToken = await request('PUT', '/api/config/env', {
      headers: { 'Content-Type': 'application/json', 'X-VersionRadar-Admin': 'admin-token-value' },
      body: JSON.stringify({ settings: {} }),
    });
    expect(withToken.status).toBe(200);
  });
});

describe('config server - env writes', () => {
  it('writes the env file with 0600 and keeps existing secrets', async () => {
    const response = await request('PUT', '/api/config/env', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { REQUEST_TIMEOUT_MS: '45000' } }),
    });
    expect(response.status).toBe(200);

    const mode = fs.statSync(envPath).mode & 0o777;
    expect(mode.toString(8)).toBe('600');

    const content = fs.readFileSync(envPath, 'utf-8');
    expect(content).toContain('REQUEST_TIMEOUT_MS=45000');
    expect(content).toContain('AZUREDEVOPS_TOKEN=');
    expect(content).not.toContain('REQUEST_TIMEOUT_MS=30000');
  });

  it('replaces a secret when a new value is supplied, without returning it', async () => {
    const newSecret = 'NEW-SECRET-VALUE';
    const response = await request('PUT', '/api/config/env', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secrets: { BITBUCKET_TOKEN: newSecret } }),
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toContain(newSecret);
    expect(fs.readFileSync(envPath, 'utf-8')).toContain(`BITBUCKET_TOKEN=${newSecret}`);
  });

  it('removes a secret only through an explicit clearSecrets request', async () => {
    const response = await request('PUT', '/api/config/env', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearSecrets: ['BITBUCKET_TOKEN'] }),
    });

    expect(response.status).toBe(200);
    const content = fs.readFileSync(envPath, 'utf-8');
    expect(content).not.toContain('BITBUCKET_TOKEN=');
    expect(content).toContain('AZUREDEVOPS_TOKEN=');
  });

  it('rejects invalid payloads', async () => {
    const response = await request('PUT', '/api/config/env', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secrets: { UNKNOWN_KEY: 'value' } }),
    });
    expect(response.status).toBe(200);

    const invalid = await request('PUT', '/api/config/env', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: 'not-an-object' }),
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toContain('invalid_settings');
  });

  it('does not accept tokens through the settings or users maps', async () => {
    await request('PUT', '/api/config/env', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { AZUREDEVOPS_TOKEN: 'sneaky' }, users: { BITBUCKET_TOKEN: 'sneaky' } }),
    });

    const content = fs.readFileSync(envPath, 'utf-8');
    expect(content).not.toContain('AZUREDEVOPS_TOKEN=sneaky');
    expect(content).not.toContain('BITBUCKET_TOKEN=sneaky');
  });
});

describe('config server - config validation', () => {
  it('rejects malformed package configuration', async () => {
    const response = await request('PUT', '/api/config/package-repositories', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: 'package.json', packageNames: 'not-an-array', repositories: [] }),
    });
    expect(response.status).toBe(400);
  });

  it('accepts a valid package configuration', async () => {
    const response = await request('PUT', '/api/config/package-repositories', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: 'package.json',
        packageNames: ['zone.js'],
        repositories: [{ platform: 'bitbucket', project: 'P', repo: 'r', name: 'r', path: 'package.json' }],
      }),
    });
    expect(response.status).toBe(200);
  });
});
