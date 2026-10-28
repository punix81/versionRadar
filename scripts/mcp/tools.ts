/**
 * MCP tool definitions for VersionRadar.
 *
 * Read-only by default: tools never write to disk and never perform network
 * access unless `refresh_versions` is explicitly enabled and consented to.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  PipelineEntry,
  RepositoryEntry,
  Snapshot,
  findPipeline,
  findRepository,
  normalizeState,
  readSnapshot,
} from '../lib/data-store';
import { getCredentialStatus } from '../lib/env';
import { loadScannerContext } from '../lib/scanner-context';
import { scanPackageRepository } from '../lib/package-scan';
import { scanPipelineRepository } from '../lib/pipeline-scan';
import { writeJsonAtomic } from '../lib/results';
import { buildScanRecord, recordScan } from '../lib/scan-metadata';
import { parseConstraint } from '../lib/version-compare';

/**
 * How `refresh_versions` authorizes an execution.
 *
 * - `strict` (default): a local single-use consent file created by the human
 *   operator is required. Intended for unknown clients.
 * - `opencode`: the consent file is not required; the host client (OpenCode) is
 *   expected to prompt the user before every invocation through its own
 *   permission rule (`versionradar_refresh_versions`, effect `ask`).
 *
 * This mode is an explicit delegation of trust to the local host. It is never
 * enabled by default and never enabled by a value sent by the model.
 */
export type RefreshApprovalMode = 'strict' | 'opencode';

export const DEFAULT_APPROVAL_MODE: RefreshApprovalMode = 'strict';

export interface ToolDependencies {
  rootDir: string;
  /** When false (default), `refresh_versions` is not registered at all. */
  allowRefresh: boolean;
  /** Authorization mode for `refresh_versions` (default `strict`). */
  approvalMode?: RefreshApprovalMode;
  /** Consent file path, defaults to ~/.config/opencode/versionradar-refresh.consent */
  consentFilePath?: string;
  envFilePath?: string;
}

/**
 * Parses the `VERSIONRADAR_MCP_APPROVAL_MODE` value.
 *
 * Fails closed: anything other than an exact known value falls back to `strict`
 * and reports an error so the server can log it.
 */
export function resolveApprovalMode(raw: string | undefined): {
  mode: RefreshApprovalMode;
  error: string | null;
} {
  const value = raw?.trim();
  if (!value || value === DEFAULT_APPROVAL_MODE) return { mode: DEFAULT_APPROVAL_MODE, error: null };
  if (value === 'opencode') return { mode: 'opencode', error: null };
  return {
    mode: DEFAULT_APPROVAL_MODE,
    error: `unknown VERSIONRADAR_MCP_APPROVAL_MODE "${value}", falling back to strict`,
  };
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_ITEMS = 50;

type ToolResponse = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function jsonResult(payload: unknown): ToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(message: string, details?: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...details }, null, 2) }],
    isError: true,
  };
}

function clampLimit(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value)));
}

function paginate<T>(items: T[], limit: number, offset: number): {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
} {
  const total = items.length;
  const safeOffset = Math.max(0, Math.trunc(offset));
  const slice = items.slice(safeOffset, safeOffset + limit);
  const hasMore = safeOffset + slice.length < total;
  return {
    items: slice,
    total,
    offset: safeOffset,
    limit,
    hasMore,
    nextOffset: hasMore ? safeOffset + slice.length : null,
  };
}

function statusCounts(entries: Array<{ status: string }>): Record<string, number> {
  const counts: Record<string, number> = { available: 0, failed: 0, pending: 0, missing: 0, unknown: 0 };
  for (const entry of entries) {
    counts[normalizeState(entry.status)] += 1;
  }
  return counts;
}

function repositorySummary(entry: RepositoryEntry): Record<string, unknown> {
  return {
    name: entry.name,
    platform: entry.platform,
    project: entry.project,
    repo: entry.repo,
    state: normalizeState(entry.status),
    packageVersions: entry.packageVersions ?? {},
    nginxVersion: entry.nginxVersion ?? null,
    lockfileEntries: Object.keys(entry.lockDependencies ?? {}).length,
    error: entry.error ?? null,
  };
}

function pipelineSummary(entry: PipelineEntry): Record<string, unknown> {
  return {
    name: entry.name,
    project: entry.project,
    repo: entry.repo,
    state: normalizeState(entry.status),
    pipelineVersions: entry.pipelineVersions ?? {},
    nodeVersion: entry.nodeVersion ?? null,
    chartVersion: entry.chartVersion ?? null,
    error: entry.error ?? null,
  };
}

function loadSnapshot(deps: ToolDependencies): Snapshot {
  return readSnapshot({ rootDir: deps.rootDir });
}

// ── Collections ──────────────────────────────────────────────────────────────

function collectDeclaredDependencies(snapshot: Snapshot): Array<{ repository: string; package: string; version: string }> {
  const rows: Array<{ repository: string; package: string; version: string }> = [];
  for (const repository of snapshot.repositories) {
    for (const [packageName, version] of Object.entries(repository.allDependencies ?? {})) {
      if (typeof version === 'string' && version.trim().length > 0) {
        rows.push({ repository: repository.name, package: packageName, version });
      }
    }
  }
  return rows;
}

function collectLockfileDependencies(snapshot: Snapshot): Array<{ repository: string; package: string; version: string }> {
  const rows: Array<{ repository: string; package: string; version: string }> = [];
  for (const repository of snapshot.repositories) {
    for (const [packageName, version] of Object.entries(repository.lockDependencies ?? {})) {
      if (typeof version === 'string' && version.trim().length > 0) {
        rows.push({ repository: repository.name, package: packageName, version });
      }
    }
  }
  return rows;
}

function compareValues(subject: string, values: Array<{ project: string; raw: string }>): Record<string, unknown> {
  const groups = new Map<string, string[]>();
  const incomparable: Array<{ project: string; value: string; reason: string }> = [];

  for (const value of values) {
    const parsed = parseConstraint(value.raw);
    if (!parsed.minVersion) {
      incomparable.push({ project: value.project, value: value.raw, reason: `non comparable (${parsed.kind})` });
      continue;
    }
    const bucket = groups.get(parsed.minVersion) ?? [];
    bucket.push(value.project);
    groups.set(parsed.minVersion, bucket);
  }

  const ordered = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));

  return {
    subject,
    comparedProjects: values.length,
    distinctVersions: ordered.length,
    allIdentical: ordered.length === 1 && incomparable.length === 0,
    groups: ordered.map(([version, projects]) => ({ version, projects: projects.sort() })),
    incomparable,
    note: 'Comparison between projects only. No reference version source is available, so "outdated" cannot be determined.',
  };
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerTools(server: McpServer, deps: ToolDependencies): void {
  server.registerTool(
    'scan_status',
    {
      title: 'VersionRadar scan status',
      description:
        'State and freshness of the generated VersionRadar data (last scan results). ' +
        'No network access. Returns file modification times, explicitly labelled as not being scan dates.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => {
      const snapshot = loadSnapshot(deps);
      return jsonResult({
        dataSource: 'generated-assets',
        scanMetadataAvailable: snapshot.scanMetadata.available,
        scanMetadataError: snapshot.scanMetadata.error,
        lastScanAt: {
          repositories: snapshot.freshness.repositories.lastScanAt,
          pipelines: snapshot.freshness.pipelines.lastScanAt,
        },
        files: {
          repositories: snapshot.freshness.repositories,
          pipelines: snapshot.freshness.pipelines,
        },
        repositories: { total: snapshot.counts.repositories, ...statusCounts(snapshot.repositories) },
        pipelines: { total: snapshot.counts.pipelines, ...statusCounts(snapshot.pipelines) },
        trackedPackages: loadTrackedPackages(deps),
        trackedPipelines: loadTrackedPipelines(deps),
        failures: [
          ...snapshot.repositories.filter(r => normalizeState(r.status) === 'failed').map(r => ({ name: r.name, error: r.error ?? null })),
          ...snapshot.pipelines.filter(p => normalizeState(p.status) === 'failed').map(p => ({ name: p.name, error: p.error ?? null })),
        ].slice(0, 10),
        warnings: snapshot.warnings,
      });
    }
  );

  server.registerTool(
    'list_repositories',
    {
      title: 'List monitored repositories',
      description: 'Lists the repositories monitored by VersionRadar with their declared versions, platform and state.',
      inputSchema: {
        platform: z.enum(['azure', 'bitbucket']).optional().describe('Filter by platform'),
        state: z.enum(['available', 'failed', 'pending', 'missing', 'unknown']).optional().describe('Filter by retrieval state'),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe('Page size (default 25)'),
        offset: z.number().int().min(0).optional().describe('Offset for pagination'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ platform, state, limit, offset }) => {
      const snapshot = loadSnapshot(deps);
      let rows = snapshot.repositories.map(repositorySummary);
      if (platform) rows = rows.filter(row => row['platform'] === platform);
      if (state) rows = rows.filter(row => row['state'] === state);
      const page = paginate(rows, clampLimit(limit), offset ?? 0);
      return jsonResult({
        dataSource: 'generated-assets',
        freshness: snapshot.freshness.repositories,
        ...page,
      });
    }
  );

  server.registerTool(
    'get_repository',
    {
      title: 'Repository details',
      description:
        'Detailed view of one monitored repository: tracked package versions, Nginx version, declared dependencies ' +
        '(limited to 50, with totals) and lockfile entry count.',
      inputSchema: {
        name: z.string().min(1).describe('Repository name as shown by list_repositories'),
        dependencyLimit: z.number().int().min(1).max(MAX_ITEMS).optional().describe('Declared dependencies to return (default 25)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ name, dependencyLimit }) => {
      const snapshot = loadSnapshot(deps);
      const entry = findRepository(snapshot, name);
      if (!entry) {
        return errorResult(`repository_not_found: ${name}`, { available: snapshot.repositories.map(r => r.name) });
      }
      const dependencies = Object.entries(entry.allDependencies ?? {});
      const limit = clampLimit(dependencyLimit);
      return jsonResult({
        dataSource: 'generated-assets',
        ...repositorySummary(entry),
        packageName: entry.packageName ?? null,
        packageVersion: entry.packageVersion ?? null,
        dependencies: Object.fromEntries(dependencies.slice(0, limit)),
        dependenciesTotal: dependencies.length,
        dependenciesTruncated: dependencies.length > limit,
        lockfileNote:
          Object.keys(entry.lockDependencies ?? {}).length > 0
            ? 'Lockfile data available; use query_dependencies with scope="lockfile".'
            : 'No lockfile data for this repository.',
      });
    }
  );

  server.registerTool(
    'query_dependencies',
    {
      title: 'Search npm dependencies',
      description:
        'Paginated search in declared dependencies (package.json) and/or lockfile entries. ' +
        'Results are sorted deterministically by repository then package.',
      inputSchema: {
        query: z.string().optional().describe('Case-insensitive substring on the package name'),
        repository: z.string().optional().describe('Restrict to one repository name'),
        scope: z.enum(['declared', 'lockfile', 'both']).optional().describe('Data set to search (default "declared")'),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe('Page size (default 25)'),
        offset: z.number().int().min(0).optional().describe('Offset for pagination'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ query, repository, scope, limit, offset }) => {
      const snapshot = loadSnapshot(deps);
      const selected = scope ?? 'declared';
      const rows = [
        ...(selected === 'declared' || selected === 'both' ? collectDeclaredDependencies(snapshot) : []),
        ...(selected === 'lockfile' || selected === 'both' ? collectLockfileDependencies(snapshot) : []),
      ];
      const needle = query?.trim().toLowerCase();
      const repositoryNeedle = repository?.trim().toLowerCase();
      const filtered = rows.filter(row => {
        if (needle && !row.package.toLowerCase().includes(needle)) return false;
        if (repositoryNeedle && row.repository.toLowerCase() !== repositoryNeedle) return false;
        return true;
      });
      filtered.sort((a, b) => a.repository.localeCompare(b.repository) || a.package.localeCompare(b.package));
      const page = paginate(filtered, clampLimit(limit), offset ?? 0);
      return jsonResult({ dataSource: 'generated-assets', scope: selected, query: query ?? null, ...page });
    }
  );

  server.registerTool(
    'find_package_usage',
    {
      title: 'Find package usage',
      description: 'Identifies which monitored repositories use a given npm package, and with which declared version.',
      inputSchema: {
        package: z.string().min(1).describe('Exact npm package name, e.g. "@angular/core"'),
        includeLockfile: z.boolean().optional().describe('Also search lockfile entries (default false)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ package: packageName, includeLockfile }) => {
      const snapshot = loadSnapshot(deps);
      const needle = packageName.trim().toLowerCase();

      const matches: Array<{ repository: string; version: string; scope: string }> = [];
      for (const repository of snapshot.repositories) {
        for (const [name, version] of Object.entries(repository.allDependencies ?? {})) {
          if (name.toLowerCase() === needle && version) {
            matches.push({ repository: repository.name, version, scope: 'declared' });
          }
        }
        if (includeLockfile) {
          for (const [name, version] of Object.entries(repository.lockDependencies ?? {})) {
            if (name.toLowerCase() === needle && version) {
              matches.push({ repository: repository.name, version, scope: 'lockfile' });
            }
          }
        }
      }

      const limited = matches.slice(0, MAX_ITEMS);
      return jsonResult({
        dataSource: 'generated-assets',
        package: packageName,
        matchCount: matches.length,
        truncated: matches.length > limited.length,
        matches: limited,
        comparison: compareValues(packageName, matches.filter(m => m.scope === 'declared').map(m => ({ project: m.repository, raw: m.version }))),
      });
    }
  );

  server.registerTool(
    'list_pipelines',
    {
      title: 'List pipelines',
      description: 'Lists the pipeline repositories with their pipeline versions and Node.js version.',
      inputSchema: {
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe('Page size (default 25)'),
        offset: z.number().int().min(0).optional().describe('Offset for pagination'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ limit, offset }) => {
      const snapshot = loadSnapshot(deps);
      const page = paginate(snapshot.pipelines.map(pipelineSummary), clampLimit(limit), offset ?? 0);
      return jsonResult({ dataSource: 'generated-assets', freshness: snapshot.freshness.pipelines, ...page });
    }
  );

  server.registerTool(
    'get_pipeline',
    {
      title: 'Pipeline details',
      description: 'Detailed view of one pipeline repository: Chart name/version, pipeline versions, Node.js version and all dependencies.',
      inputSchema: {
        name: z.string().min(1).describe('Pipeline repository name'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ name }) => {
      const snapshot = loadSnapshot(deps);
      const entry = findPipeline(snapshot, name);
      if (!entry) {
        return errorResult(`pipeline_not_found: ${name}`, { available: snapshot.pipelines.map(p => p.name) });
      }
      return jsonResult({
        dataSource: 'generated-assets',
        ...pipelineSummary(entry),
        chartName: entry.chartName ?? null,
        dependencies: (entry.allDependencies ?? []).slice(0, MAX_ITEMS),
        dependenciesTotal: (entry.allDependencies ?? []).length,
      });
    }
  );

  server.registerTool(
    'compare_versions',
    {
      title: 'Compare versions across projects',
      description:
        'Compares declared versions of a package, or a pipeline version, across monitored projects. ' +
        'Handles SemVer and npm ranges. Never states that a dependency is outdated: no reference source exists.',
      inputSchema: {
        package: z.string().optional().describe('npm package name or pipeline name. When omitted, every tracked subject is compared.'),
        scope: z.enum(['packages', 'pipelines', 'all']).optional().describe('Subjects to compare (default "all")'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ package: subject, scope }) => {
      const snapshot = loadSnapshot(deps);
      const selected = scope ?? 'all';

      if (subject) {
        const packageValues = collectDeclaredDependencies(snapshot)
          .filter(row => row.package.toLowerCase() === subject.trim().toLowerCase())
          .map(row => ({ project: row.repository, raw: row.version }));
        const pipelineValues = snapshot.pipelines
          .filter(p => p.pipelineVersions && subject in p.pipelineVersions)
          .map(p => ({ project: p.name, raw: p.pipelineVersions[subject] ?? '' }));

        const values = selected === 'pipelines' ? pipelineValues : selected === 'packages' ? packageValues : [...packageValues, ...pipelineValues];
        if (values.length === 0) {
          return errorResult(`subject_not_found: ${subject}`, {
            trackedPackages: loadTrackedPackages(deps),
            trackedPipelines: loadTrackedPipelines(deps),
          });
        }
        return jsonResult({ dataSource: 'generated-assets', ...compareValues(subject, values) });
      }

      const subjects: Array<Record<string, unknown>> = [];
      if (selected === 'packages' || selected === 'all') {
        for (const packageName of loadTrackedPackages(deps)) {
          const values = collectDeclaredDependencies(snapshot)
            .filter(row => row.package === packageName)
            .map(row => ({ project: row.repository, raw: row.version }));
          if (values.length) subjects.push(compareValues(packageName, values));
        }
      }
      if (selected === 'pipelines' || selected === 'all') {
        for (const pipelineName of loadTrackedPipelines(deps)) {
          const values = snapshot.pipelines.map(p => ({ project: p.name, raw: p.pipelineVersions?.[pipelineName] ?? '' }));
          if (values.length) subjects.push(compareValues(pipelineName, values));
        }
      }
      return jsonResult({ dataSource: 'generated-assets', subjects });
    }
  );

  server.registerTool(
    'check_credentials',
    {
      title: 'Check credential availability',
      description:
        'Reports whether the Azure DevOps and Bitbucket credentials are configured, and whether the env file has restrictive permissions. ' +
        'Never returns a credential value, prefix or suffix.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => {
      const status = getCredentialStatus({ path: deps.envFilePath });
      return jsonResult({
        ...status,
        valuesExposed: false,
        note: 'Only presence is reported. Credential values are never read back by the model.',
      });
    }
  );

  if (deps.allowRefresh) {
    registerRefreshTool(server, deps);
  }
}

// ── Refresh (explicit consent required) ──────────────────────────────────────

export function resolveConsentFilePath(deps: ToolDependencies): string {
  return deps.consentFilePath ?? path.join(os.homedir(), '.config', 'opencode', 'versionradar-refresh.consent');
}

export interface ConsentRecord {
  createdAt: string;
  expiresAt: string;
  target: 'packages' | 'pipelines' | 'all';
}

/**
 * Creates a single-use consent file.
 *
 * The authorization factor is the local file itself, created by the human
 * operator (chmod 600, outside the repository). Nothing is transmitted to the
 * model: `refresh_versions` takes no token argument.
 */
export function createConsent(options: {
  target: 'packages' | 'pipelines' | 'all';
  filePath?: string;
  ttlMinutes?: number;
}): { filePath: string; expiresAt: string; target: string } {
  const filePath = options.filePath ?? path.join(os.homedir(), '.config', 'opencode', 'versionradar-refresh.consent');
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + (options.ttlMinutes ?? 10) * 60_000).toISOString();
  const record: ConsentRecord = { createdAt, expiresAt, target: options.target };

  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, JSON.stringify(record), { encoding: 'utf-8', mode: 0o600 });
  fs.chmodSync(filePath, 0o600);

  return { filePath, expiresAt, target: options.target };
}

/**
 * Validates and consumes the consent file (single use).
 * A model-generated boolean is never accepted as proof of consent.
 */
export function consumeConsent(filePath: string, target: 'packages' | 'pipelines' | 'all'): string | null {
  if (!fs.existsSync(filePath)) return 'consent_required';

  let record: ConsentRecord;
  try {
    record = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ConsentRecord;
  } catch {
    return 'consent_invalid';
  }

  if (!record.expiresAt || !record.target) return 'consent_invalid';
  if (Date.parse(record.expiresAt) < Date.now()) {
    fs.rmSync(filePath, { force: true });
    return 'consent_expired';
  }
  if (record.target !== 'all' && record.target !== target) return 'consent_target_mismatch';

  // Single use: remove before running so a replay is impossible.
  fs.rmSync(filePath, { force: true });
  return null;
}

/**
 * Authorization gate for `refresh_versions`.
 *
 * Returns an error code, or `null` when the execution is authorized.
 * A model-provided argument is never accepted as proof of authorization.
 */
export function authorizeRefresh(
  deps: ToolDependencies,
  target: 'packages' | 'pipelines' | 'all'
): string | null {
  if ((deps.approvalMode ?? DEFAULT_APPROVAL_MODE) === 'opencode') {
    // Delegated to the host client. There is deliberately no file-based proof
    // here: the OpenCode permission rule is what prompts the human, and the
    // client refuses before this function is ever reached.
    return null;
  }
  return consumeConsent(resolveConsentFilePath(deps), target);
}

function registerRefreshTool(server: McpServer, deps: ToolDependencies): void {
  const mode = deps.approvalMode ?? DEFAULT_APPROVAL_MODE;
  const delegated = mode === 'opencode';

  server.registerTool(
    'refresh_versions',
    {
      title: 'Refresh VersionRadar data (privileged)',
      description:
        'Runs the existing VersionRadar fetchers against Azure DevOps and Bitbucket, then rewrites the generated JSON assets ' +
        'and records the real scan date in scan-metadata.json. ' +
        (delegated
          ? 'Registered in the local OpenCode approval mode: no consent file is required, but the host client MUST prompt the user ' +
            'before every call (permission action "versionradar_refresh_versions", effect "ask"). Never call it unattended and never ' +
            'retry it after a refusal.'
          : 'Requires a local single-use consent file created by the user (npm run mcp:allow-refresh); no token is passed through the conversation.') +
        ' Disabled unless the MCP server was started with VERSIONRADAR_MCP_ALLOW_REFRESH=1.',
      inputSchema: {
        target: z.enum(['packages', 'pipelines', 'all']).describe('Which scan to run'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ target }) => {
      const authorizationError = authorizeRefresh(deps, target);
      if (authorizationError) {
        return errorResult(authorizationError, {
          hint: 'Ask the user to run "npm run mcp:allow-refresh -- --target <target>" locally, then call this tool again.',
        });
      }

      // Audit trail on stderr only: stdout is the JSON-RPC stream. No credential
      // value, no request header and no scan result detail is written here.
      process.stderr.write(`[versionradar-mcp] refresh_versions target=${target} mode=${mode}\n`);

      let context;
      try {
        context = loadScannerContext({ rootDir: deps.rootDir, requireCredentials: true });
      } catch (error) {
        return errorResult('credentials_unavailable', { detail: error instanceof Error ? error.message : 'unknown' });
      }

      const summary: Record<string, unknown> = { target, startedAt: new Date().toISOString() };
      summary['approval'] = delegated
        ? {
            mode: 'opencode',
            consentFile: 'not required',
            enforcedBy: 'host client permission rule (expected: versionradar_refresh_versions -> ask)',
          }
        : { mode: 'strict', consentFile: 'consumed', enforcedBy: 'local single-use consent file' };

      if (target === 'packages' || target === 'all') {
        const startedAt = new Date().toISOString();
        const results = [];
        for (const repo of context.packageConfig.repositories) {
          const outcome = await scanPackageRepository(context, repo);
          results.push(outcome.result);
        }
        writeJsonAtomic(path.join(deps.rootDir, 'src', 'assets', 'data', 'repositories.json'), results);
        const record = buildScanRecord({ startedAt, finishedAt: new Date().toISOString() }, results);
        recordScan(deps.rootDir, 'repositories', record);
        summary['repositories'] = {
          total: results.length,
          success: results.filter(r => r.status === 'success').length,
          errors: results.filter(r => r.status === 'error').length,
        };
      }

      if (target === 'pipelines' || target === 'all') {
        const startedAt = new Date().toISOString();
        const results = [];
        for (const repo of context.pipelineConfig.repositories) {
          results.push(await scanPipelineRepository(context, repo));
        }
        writeJsonAtomic(path.join(deps.rootDir, 'src', 'assets', 'data', 'pipelines.json'), results);
        const record = buildScanRecord({ startedAt, finishedAt: new Date().toISOString() }, results);
        recordScan(deps.rootDir, 'pipelines', record);
        summary['pipelines'] = {
          total: results.length,
          success: results.filter(r => r.status === 'success').length,
          errors: results.filter(r => r.status === 'error').length,
        };
      }

      summary['finishedAt'] = new Date().toISOString();
      summary['note'] = 'Generated files were rewritten and scan-metadata.json now records the real scan date (lastScanAt is set only when every item succeeded).';
      return jsonResult(summary);
    }
  );
}

// ── Config-derived helpers ───────────────────────────────────────────────────

function readConfigArray(rootDir: string, file: string, field: string): string[] {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(rootDir, 'config', file), 'utf-8')) as Record<string, unknown>;
    const value = raw[field];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function loadTrackedPackages(deps: Pick<ToolDependencies, 'rootDir'>): string[] {
  return readConfigArray(deps.rootDir, 'package-repositories.json', 'packageNames');
}

export function loadTrackedPipelines(deps: Pick<ToolDependencies, 'rootDir'>): string[] {
  return readConfigArray(deps.rootDir, 'repositories.json', 'pipelineNames');
}
