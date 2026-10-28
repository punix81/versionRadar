import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as fs from 'fs';
import * as path from 'path';
import { createConsent, consumeConsent, authorizeRefresh, registerTools, resolveApprovalMode, ToolDependencies } from './tools';
import { createFixtureEnvFile, createFixtureRoot, FixtureRoot, SENTINEL_SECRET } from '../test/fixtures';

interface Harness {
  client: Client;
  close: () => Promise<void>;
}

let fixture: FixtureRoot;
let envPath: string;
const originalEnv = { ...process.env };

async function connect(deps: ToolDependencies): Promise<Harness> {
  const server = new McpServer({ name: 'versionradar-test', version: '0.0.0' });
  registerTools(server, deps);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);

  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

function parse(result: unknown): Record<string, unknown> {
  const content = (result as { content: Array<{ type: string; text: string }> }).content;
  return JSON.parse(content[0].text) as Record<string, unknown>;
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

beforeEach(() => {
  fixture = createFixtureRoot();
  envPath = createFixtureEnvFile(fixture.rootDir, {
    AZUREDEVOPS_USER: 'fixture-user',
    AZUREDEVOPS_TOKEN: SENTINEL_SECRET,
    BITBUCKET_USER: 'fixture-user',
    BITBUCKET_TOKEN: SENTINEL_SECRET,
  });
  process.env = { ...originalEnv, VERSIONRADAR_ENV_FILE: envPath };
});

afterEach(() => {
  fixture.cleanup();
  process.env = { ...originalEnv };
});

describe('MCP server integration', () => {
  it('exposes the read-only tools and hides refresh by default', async () => {
    const harness = await connect({ rootDir: fixture.rootDir, allowRefresh: false, envFilePath: envPath });
    try {
      const { tools } = await harness.client.listTools();
      const names = tools.map(tool => tool.name).sort();

      expect(names).toEqual([
        'check_credentials',
        'compare_versions',
        'find_package_usage',
        'get_pipeline',
        'get_repository',
        'list_pipelines',
        'list_repositories',
        'query_dependencies',
        'scan_status',
      ]);
      expect(names).not.toContain('refresh_versions');
    } finally {
      await harness.close();
    }
  });

  it('registers refresh_versions only when explicitly enabled', async () => {
    const harness = await connect({ rootDir: fixture.rootDir, allowRefresh: true, envFilePath: envPath });
    try {
      const { tools } = await harness.client.listTools();
      expect(tools.map(tool => tool.name)).toContain('refresh_versions');
    } finally {
      await harness.close();
    }
  });

  it('returns scan status with an explicit freshness disclaimer', async () => {
    const harness = await connect({ rootDir: fixture.rootDir, allowRefresh: false, envFilePath: envPath });
    try {
      const payload = parse(await harness.client.callTool({ name: 'scan_status', arguments: {} }));

      expect(payload['dataSource']).toBe('generated-assets');
      expect(payload['scanMetadataAvailable']).toBe(false);
      expect(payload['lastScanAt']).toEqual({ repositories: null, pipelines: null });
      const files = payload['files'] as Record<string, Record<string, unknown>>;
      expect(files['repositories']['modifiedAtIsScanDate']).toBe(false);
      expect(files['repositories']['lastScanAt']).toBeNull();
      expect(String(files['repositories']['note'])).toContain('not a scan date');
      expect(payload['repositories']).toMatchObject({ total: 3, available: 2, failed: 1 });
    } finally {
      await harness.close();
    }
  });

  it('paginates list_repositories and reports the next offset', async () => {
    const harness = await connect({ rootDir: fixture.rootDir, allowRefresh: false, envFilePath: envPath });
    try {
      const first = parse(await harness.client.callTool({ name: 'list_repositories', arguments: { limit: 2 } }));
      expect(first['total']).toBe(3);
      expect((first['items'] as unknown[]).length).toBe(2);
      expect(first['hasMore']).toBe(true);
      expect(first['nextOffset']).toBe(2);

      const second = parse(
        await harness.client.callTool({ name: 'list_repositories', arguments: { limit: 2, offset: 2 } })
      );
      expect((second['items'] as unknown[]).length).toBe(1);
      expect(second['hasMore']).toBe(false);
    } finally {
      await harness.close();
    }
  });

  it('returns an explicit error for an unknown repository', async () => {
    const harness = await connect({ rootDir: fixture.rootDir, allowRefresh: false, envFilePath: envPath });
    try {
      const result = (await harness.client.callTool({ name: 'get_repository', arguments: { name: 'nope' } })) as {
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
      expect(parse(result)['error']).toContain('repository_not_found');
    } finally {
      await harness.close();
    }
  });

  it('searches declared and lockfile dependencies with pagination', async () => {
    const harness = await connect({ rootDir: fixture.rootDir, allowRefresh: false, envFilePath: envPath });
    try {
      const declared = parse(
        await harness.client.callTool({ name: 'query_dependencies', arguments: { query: 'angular', limit: 1 } })
      );
      expect(declared['total']).toBe(4);
      expect(declared['hasMore']).toBe(true);

      const lockfile = parse(
        await harness.client.callTool({
          name: 'query_dependencies',
          arguments: { scope: 'lockfile', query: 'left-pad' },
        })
      );
      expect(lockfile['total']).toBe(2);
      expect((lockfile['items'] as Array<Record<string, string>>)[0]['package']).toBe('left-pad');
    } finally {
      await harness.close();
    }
  });

  it('finds package usage and compares resolved versions', async () => {
    const harness = await connect({ rootDir: fixture.rootDir, allowRefresh: false, envFilePath: envPath });
    try {
      const usage = parse(
        await harness.client.callTool({ name: 'find_package_usage', arguments: { package: '@angular/cdk' } })
      );
      expect(usage['matchCount']).toBe(2);
      expect((usage['comparison'] as Record<string, unknown>)['distinctVersions']).toBe(2);

      const pipelines = parse(
        await harness.client.callTool({ name: 'compare_versions', arguments: { package: 'commons-pipeline' } })
      );
      const groups = pipelines['groups'] as Array<{ version: string; projects: string[] }>;
      expect(groups.map(group => group.version)).toEqual(['2.2.0', '2.4.0']);
      expect(String(pipelines['note'])).toContain('outdated');
    } finally {
      await harness.close();
    }
  });

  it('does not claim that a dependency is outdated', async () => {
    const harness = await connect({ rootDir: fixture.rootDir, allowRefresh: false, envFilePath: envPath });
    try {
      const result = await harness.client.callTool({ name: 'compare_versions', arguments: {} });
      const serialized = JSON.stringify(result).toLowerCase();
      expect(serialized).not.toContain('"outdated": true');
      expect(serialized).not.toContain('is outdated');
    } finally {
      await harness.close();
    }
  });

  it('reports credential presence without leaking any value', async () => {
    const harness = await connect({ rootDir: fixture.rootDir, allowRefresh: false, envFilePath: envPath });
    try {
      const result = await harness.client.callTool({ name: 'check_credentials', arguments: {} });
      const serialized = JSON.stringify(result);

      expect(serialized).not.toContain(SENTINEL_SECRET);
      const payload = parse(result);
      expect(payload['azure']).toMatchObject({ userConfigured: true, tokenConfigured: true });
      expect(payload['valuesExposed']).toBe(false);
      expect((payload['envFile'] as Record<string, unknown>)['restrictivePermissions']).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it('never leaks a credential value from any read-only tool', async () => {
    const harness = await connect({ rootDir: fixture.rootDir, allowRefresh: false, envFilePath: envPath });
    try {
      const calls: Array<[string, Record<string, unknown>]> = [
        ['scan_status', {}],
        ['list_repositories', {}],
        ['get_repository', { name: 'alpha-ui' }],
        ['query_dependencies', { query: 'angular' }],
        ['find_package_usage', { package: '@angular/cdk', includeLockfile: true }],
        ['list_pipelines', {}],
        ['get_pipeline', { name: 'gitops-alpha' }],
        ['compare_versions', {}],
        ['check_credentials', {}],
      ];

      for (const [name, args] of calls) {
        const result = await harness.client.callTool({ name, arguments: args });
        expect(JSON.stringify(result)).not.toContain(SENTINEL_SECRET);
      }
    } finally {
      await harness.close();
    }
  });

  it('refuses refresh without a locally created consent token', async () => {
    const consentFilePath = path.join(fixture.rootDir, 'refresh.consent');
    const harness = await connect({
      rootDir: fixture.rootDir,
      allowRefresh: true,
      envFilePath: envPath,
      consentFilePath,
    });
    try {
      const result = (await harness.client.callTool({
        name: 'refresh_versions',
        arguments: { target: 'packages' },
      })) as { isError?: boolean };

      expect(result.isError).toBe(true);
      expect(parse(result)['error']).toBe('consent_required');
      expect(JSON.stringify(result)).not.toContain(SENTINEL_SECRET);
    } finally {
      await harness.close();
    }
  });
});

describe('consent handling', () => {
  it('accepts a valid consent once and removes the file', () => {
    const consentFilePath = path.join(fixture.rootDir, 'refresh.consent');
    createConsent({ target: 'packages', filePath: consentFilePath });

    expect(consumeConsent(consentFilePath, 'packages')).toBeNull();
    expect(fs.existsSync(consentFilePath)).toBe(false);
    expect(consumeConsent(consentFilePath, 'packages')).toBe('consent_required');
  });

  it('rejects a wrong target and an expired consent', () => {
    const consentFilePath = path.join(fixture.rootDir, 'refresh.consent');

    createConsent({ target: 'packages', filePath: consentFilePath });
    expect(consumeConsent(consentFilePath, 'pipelines')).toBe('consent_target_mismatch');

    fs.writeFileSync(
      consentFilePath,
      JSON.stringify({ createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() - 1000).toISOString(), target: 'all' })
    );
    expect(consumeConsent(consentFilePath, 'all')).toBe('consent_expired');
    expect(fs.existsSync(consentFilePath)).toBe(false);
  });

  it('rejects a malformed consent file', () => {
    const consentFilePath = path.join(fixture.rootDir, 'refresh.consent');
    fs.writeFileSync(consentFilePath, JSON.stringify({ target: 'all' }));
    expect(consumeConsent(consentFilePath, 'all')).toBe('consent_invalid');
  });

  it('writes the consent file with restrictive permissions and no token', () => {
    const consentFilePath = path.join(fixture.rootDir, 'refresh.consent');
    const consent = createConsent({ target: 'all', filePath: consentFilePath });

    expect(consent).not.toHaveProperty('token');
    const mode = fs.statSync(consentFilePath).mode & 0o777;
    expect(mode.toString(8)).toBe('600');

    const record = JSON.parse(fs.readFileSync(consentFilePath, 'utf-8')) as Record<string, unknown>;
    expect(record).not.toHaveProperty('token');
    expect(record['target']).toBe('all');
  });
});

describe('scan metadata recording', () => {  it('reports lastScanAt after a fully successful scan record', async () => {
    const metadataPath = path.join(fixture.rootDir, 'src', 'assets', 'data', 'scan-metadata.json');
    fs.writeFileSync(
      metadataPath,
      JSON.stringify({
        version: 1,
        repositories: {
          startedAt: '2026-09-03T08:00:00.000Z',
          finishedAt: '2026-09-03T08:32:48.000Z',
          status: 'success',
          total: 3,
          succeeded: 3,
          failed: 0,
        },
      })
    );

    const harness = await connect({ rootDir: fixture.rootDir, allowRefresh: false, envFilePath: envPath });
    try {
      const payload = parse(await harness.client.callTool({ name: 'scan_status', arguments: {} }));
      expect(payload['scanMetadataAvailable']).toBe(true);
      expect((payload['lastScanAt'] as Record<string, unknown>)['repositories']).toBe('2026-09-03T08:32:48.000Z');
      expect((payload['lastScanAt'] as Record<string, unknown>)['pipelines']).toBeNull();
    } finally {
      await harness.close();
    }
  });
});

describe('refresh approval modes', () => {
  it('uses the strict mode by default', () => {
    expect(resolveApprovalMode(undefined)).toEqual({ mode: 'strict', error: null });
    expect(resolveApprovalMode('')).toEqual({ mode: 'strict', error: null });
    expect(resolveApprovalMode(' strict ')).toEqual({ mode: 'strict', error: null });
  });

  it('accepts the opencode local mode explicitly', () => {
    expect(resolveApprovalMode('opencode')).toEqual({ mode: 'opencode', error: null });
  });

  it('fails closed on an unknown mode', () => {
    const resolved = resolveApprovalMode('opencode-local');
    expect(resolved.mode).toBe('strict');
    expect(resolved.error).toContain('unknown VERSIONRADAR_MCP_APPROVAL_MODE');
  });

  it('keeps strict mode refusing refresh without a consent file', () => {
    const consentFilePath = path.join(fixture.rootDir, 'refresh.consent');
    const deps: ToolDependencies = {
      rootDir: fixture.rootDir,
      allowRefresh: true,
      envFilePath: envPath,
      consentFilePath,
    };

    expect(deps.approvalMode).toBeUndefined();
    expect(authorizeRefresh(deps, 'all')).toBe('consent_required');
  });

  it('consumes a strict-mode consent exactly once', () => {
    const consentFilePath = path.join(fixture.rootDir, 'refresh.consent');
    const deps: ToolDependencies = {
      rootDir: fixture.rootDir,
      allowRefresh: true,
      approvalMode: 'strict',
      envFilePath: envPath,
      consentFilePath,
    };

    createConsent({ target: 'all', filePath: consentFilePath });

    expect(authorizeRefresh(deps, 'all')).toBeNull();
    expect(fs.existsSync(consentFilePath)).toBe(false);
    expect(authorizeRefresh(deps, 'all')).toBe('consent_required');
  });

  it('does not require a consent file in opencode local mode', () => {
    const consentFilePath = path.join(fixture.rootDir, 'refresh.consent');
    const deps: ToolDependencies = {
      rootDir: fixture.rootDir,
      allowRefresh: true,
      approvalMode: 'opencode',
      envFilePath: envPath,
      consentFilePath,
    };

    expect(authorizeRefresh(deps, 'all')).toBeNull();
    expect(fs.existsSync(consentFilePath)).toBe(false);
  });

  it('registers refresh_versions in opencode local mode and keeps the nine read-only tools', async () => {
    const harness = await connect({
      rootDir: fixture.rootDir,
      allowRefresh: true,
      approvalMode: 'opencode',
      envFilePath: envPath,
    });
    try {
      const { tools } = await harness.client.listTools();
      const names = tools.map(tool => tool.name).sort();

      expect(names).toEqual([
        'check_credentials',
        'compare_versions',
        'find_package_usage',
        'get_pipeline',
        'get_repository',
        'list_pipelines',
        'list_repositories',
        'query_dependencies',
        'refresh_versions',
        'scan_status',
      ]);

      const refresh = tools.find(tool => tool.name === 'refresh_versions');
      expect(refresh?.description).toContain('versionradar_refresh_versions');
    } finally {
      await harness.close();
    }
  });

  it('still hides refresh_versions in opencode mode when refresh is not enabled', async () => {
    const harness = await connect({
      rootDir: fixture.rootDir,
      allowRefresh: false,
      approvalMode: 'opencode',
      envFilePath: envPath,
    });
    try {
      const { tools } = await harness.client.listTools();
      expect(tools.map(tool => tool.name)).not.toContain('refresh_versions');
    } finally {
      await harness.close();
    }
  });

  it('runs exactly one scan per accepted call in opencode mode, without network access', async () => {
    // Empty repository lists keep the executed scan fully local: no repository
    // is contacted, so this test never performs a network scan.
    writeJson(path.join(fixture.rootDir, 'config', 'package-repositories.json'), {
      filePath: 'package.json',
      packageNames: [],
      repositories: [],
    });
    writeJson(path.join(fixture.rootDir, 'config', 'repositories.json'), {
      filePath: 'pipeline/Chart.yaml',
      valuesFilePath: 'pipeline/values.yaml',
      pipelineNames: [],
      repositories: [],
    });

    const harness = await connect({
      rootDir: fixture.rootDir,
      allowRefresh: true,
      approvalMode: 'opencode',
      envFilePath: envPath,
    });
    try {
      const result = parse(await harness.client.callTool({ name: 'refresh_versions', arguments: { target: 'all' } }));

      expect(result['approval']).toMatchObject({ mode: 'opencode', consentFile: 'not required' });
      expect(result['repositories']).toEqual({ total: 0, success: 0, errors: 0 });
      expect(result['pipelines']).toEqual({ total: 0, success: 0, errors: 0 });
      expect(JSON.stringify(result)).not.toContain(SENTINEL_SECRET);

      const writtenRepositories = JSON.parse(
        fs.readFileSync(path.join(fixture.rootDir, 'src', 'assets', 'data', 'repositories.json'), 'utf-8')
      ) as unknown[];
      expect(writtenRepositories).toEqual([]);

      const metadata = JSON.parse(
        fs.readFileSync(path.join(fixture.rootDir, 'src', 'assets', 'data', 'scan-metadata.json'), 'utf-8')
      ) as Record<string, Record<string, unknown>>;
      expect(metadata['repositories']).toMatchObject({ total: 0, succeeded: 0, failed: 0 });
      expect(metadata['pipelines']).toMatchObject({ total: 0, succeeded: 0, failed: 0 });
    } finally {
      await harness.close();
    }
  });

  it('does not run any scan in strict mode when the consent file is missing', async () => {
    const repositoriesPath = path.join(fixture.rootDir, 'src', 'assets', 'data', 'repositories.json');
    const before = fs.readFileSync(repositoriesPath, 'utf-8');

    const harness = await connect({
      rootDir: fixture.rootDir,
      allowRefresh: true,
      envFilePath: envPath,
      consentFilePath: path.join(fixture.rootDir, 'refresh.consent'),
    });
    try {
      const result = (await harness.client.callTool({
        name: 'refresh_versions',
        arguments: { target: 'all' },
      })) as { isError?: boolean };

      expect(result.isError).toBe(true);
      expect(parse(result)['error']).toBe('consent_required');
      expect(fs.readFileSync(repositoriesPath, 'utf-8')).toBe(before);
    } finally {
      await harness.close();
    }
  });
});
