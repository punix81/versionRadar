import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';

const PORT = 3001;
/** Local-only admin API: never bind to a LAN/public interface. */
const HOST = '127.0.0.1';
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const ASSETS_DIR = path.join(__dirname, '..', 'src', 'assets', 'data');
const ROOT_DIR = path.join(__dirname, '..');

/** Angular dev server origins allowed to talk to this API. */
const ALLOWED_ORIGINS = ['http://localhost:4200', 'http://127.0.0.1:4200'];

/** Credentials: write-only through the API, never returned. */
export const SECRET_KEYS = [
  'AZUREDEVOPS_TOKEN',
  'AZUREDEVOPS_TOKEN_DEFAULTCOLLECTION18',
  'BITBUCKET_TOKEN',
] as const;

/** Non-secret identity values, editable and readable. */
export const USER_KEYS = ['AZUREDEVOPS_USER', 'BITBUCKET_USER'] as const;

/** Non-secret script settings, editable and readable. */
export const SETTING_KEYS = [
  'BITBUCKET_BASE_URL',
  'BITBUCKET_AUTH_SCHEME',
  'REQUEST_TIMEOUT_MS',
  'DATE_LOCALE',
  'HOST_IP_OVERRIDES',
  'VERSIONRADAR_TLS_INSECURE',
  'VERSIONRADAR_CA_FILE',
] as const;

type SecretKey = (typeof SECRET_KEYS)[number];
type UserKey = (typeof USER_KEYS)[number];
type SettingKey = (typeof SETTING_KEYS)[number];

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// Returns how many repositories are configured in a given config file (0 if absent/unreadable).
function configuredRepoCount(fileName: string, configDir: string = CONFIG_DIR): number {
  const filePath = path.join(configDir, fileName);
  if (!fs.existsSync(filePath)) return 0;
  try {
    const cfg = readJson<{ repositories?: unknown[] }>(filePath);
    return Array.isArray(cfg.repositories) ? cfg.repositories.length : 0;
  } catch {
    return 0;
  }
}

// ── Types (mirrors Angular interfaces) ───────────────────────────────────────

interface PipelineConfigRepo { project: string; repo: string; name: string; branch?: string }
interface PipelineConfig { filePath: string; pipelineNames: string[]; repositories: PipelineConfigRepo[] }
interface PipelineResult { name: string; project: string; repo: string; status: string; pipelineVersions: Record<string, string | null>; [k: string]: unknown }

interface PackageConfigRepo { platform: string; project: string; repo: string; name: string; path: string; collection?: string; branch?: string }
interface PackageConfig { filePath: string; packageNames: string[]; repositories: PackageConfigRepo[] }
interface PackageResult { name: string; project: string; repo: string; status: string; packageVersions: Record<string, string | null>; [k: string]: unknown }

// ── Sync: pipeline config → assets/data/pipelines.json ───────────────────────

function syncPipelinesAsset(config: PipelineConfig, assetsDir: string = ASSETS_DIR): void {
  const assetPath = path.join(assetsDir, 'pipelines.json');
  if (!fs.existsSync(assetPath)) return;

  // Case-insensitive key lookup: "project::repo" (lowercased)
  const configKeyMap = new Map<string, PipelineConfigRepo>();
  for (const r of config.repositories) {
    configKeyMap.set(`${r.project.toLowerCase()}::${r.repo.toLowerCase()}`, r);
  }

  const data = readJson<PipelineResult[]>(assetPath);

  // Keep existing entries that still match, updating their pipelineVersions columns
  const kept = data
    .filter(r => configKeyMap.has(`${r.project.toLowerCase()}::${r.repo.toLowerCase()}`))
    .map(r => {
      const newVersions: Record<string, string | null> = {};
      for (const name of config.pipelineNames) {
        newVersions[name] = r.pipelineVersions[name] ?? null;
      }
      return { ...r, pipelineVersions: newVersions };
    });

  // Keys already present in the asset
  const keptKeys = new Set(kept.map(r => `${r.project.toLowerCase()}::${r.repo.toLowerCase()}`));

  // Add stub entries for repos in config that have NO asset data yet
  const stubs: PipelineResult[] = [];
  for (const [key, cfgRepo] of configKeyMap) {
    if (!keptKeys.has(key)) {
      const stub: PipelineResult = {
        name: cfgRepo.name,
        project: cfgRepo.project,
        repo: cfgRepo.repo,
        status: 'pending',
        pipelineVersions: Object.fromEntries(config.pipelineNames.map(n => [n, null])),
      };
      stubs.push(stub);
      console.log(`  ➕ Stub added for new repo: ${cfgRepo.name}`);
    }
  }

  const result = [...kept, ...stubs];
  writeJson(assetPath, result);
  console.log(`🔄 Synced pipelines.json: ${kept.length} kept + ${stubs.length} new stubs (was ${data.length})`);
}

// ── Sync: package config → assets/data/repositories.json ─────────────────────

function syncRepositoriesAsset(config: PackageConfig, assetsDir: string = ASSETS_DIR): void {
  const assetPath = path.join(assetsDir, 'repositories.json');
  if (!fs.existsSync(assetPath)) return;

  // Case-insensitive match by name
  const configNameMap = new Map<string, PackageConfigRepo>();
  for (const r of config.repositories) {
    configNameMap.set(r.name.toLowerCase(), r);
  }

  const data = readJson<PackageResult[]>(assetPath);

  const kept = data
    .filter(r => configNameMap.has(r.name.toLowerCase()))
    .map(r => {
      const newVersions: Record<string, string | null> = {};
      for (const name of config.packageNames) {
        newVersions[name] = r.packageVersions[name] ?? null;
      }
      return { ...r, packageVersions: newVersions };
    });

  const keptNames = new Set(kept.map(r => r.name.toLowerCase()));

  // Add stubs for new repos not yet in assets
  const stubs: PackageResult[] = [];
  for (const [key, cfgRepo] of configNameMap) {
    if (!keptNames.has(key)) {
      const stub: PackageResult = {
        name: cfgRepo.name,
        platform: cfgRepo.platform,
        project: cfgRepo.project,
        repo: cfgRepo.repo,
        status: 'pending',
        packageVersions: Object.fromEntries(config.packageNames.map(n => [n, null])),
      };
      stubs.push(stub);
      console.log(`  ➕ Stub added for new repo: ${cfgRepo.name}`);
    }
  }

  const result = [...kept, ...stubs];
  writeJson(assetPath, result);
  console.log(`🔄 Synced repositories.json: ${kept.length} kept + ${stubs.length} new stubs (was ${data.length})`);
}

// ── .env helpers ─────────────────────────────────────────────────────────────

type EnvConfig = Record<string, string>;

/**
 * Single credential source, shared with the MCP server and the CLI scripts.
 * Defaults to the OpenCode user configuration directory (outside the repository).
 */
export function resolveEnvPath(): string {
  const fromEnv = process.env['VERSIONRADAR_ENV_FILE']?.trim();
  if (fromEnv) return fromEnv;
  return path.join(os.homedir(), '.config', 'opencode', 'versionRadar.env');
}

export function parseEnv(raw: string): EnvConfig {
  const result: EnvConfig = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    result[key] = value;
  }
  return result;
}

export function serializeEnv(data: EnvConfig): string {
  const groups: Array<{ title: string; keys: string[] }> = [
    { title: 'Azure DevOps', keys: ['AZUREDEVOPS_USER', 'AZUREDEVOPS_TOKEN', 'AZUREDEVOPS_TOKEN_DEFAULTCOLLECTION18'] },
    { title: 'Bitbucket', keys: ['BITBUCKET_USER', 'BITBUCKET_TOKEN', ...SETTING_KEYS.filter(k => k.startsWith('BITBUCKET_'))] },
    { title: 'Script settings', keys: SETTING_KEYS.filter(k => !k.startsWith('BITBUCKET_')) },
  ];

  const written = new Set<string>();
  const lines: string[] = ['# VersionRadar credentials and settings.', '# Local file, never commit it. Keep permissions at 600.'];

  for (const group of groups) {
    const keys = group.keys.filter(k => k in data && !written.has(k));
    if (!keys.length) continue;
    lines.push('', `# ${group.title}`);
    for (const key of keys) {
      lines.push(`${key}=${data[key]}`);
      written.add(key);
    }
  }

  const extra = Object.keys(data).filter(k => !written.has(k));
  if (extra.length) {
    lines.push('', '# Other');
    for (const key of extra) lines.push(`${key}=${data[key]}`);
  }

  lines.push('');
  return lines.join('\n');
}

function readEnvFile(envPath: string): EnvConfig {
  if (!fs.existsSync(envPath)) return {};
  return parseEnv(fs.readFileSync(envPath, 'utf-8'));
}

/**
 * Writes the env file atomically with restrictive permissions.
 * Refuses to follow symbolic links so the API cannot be used to overwrite an arbitrary file.
 */
export function writeEnvFile(envPath: string, data: EnvConfig): void {
  if (fs.existsSync(envPath) && fs.lstatSync(envPath).isSymbolicLink()) {
    throw new Error('env_file_is_symlink');
  }
  const dir = path.dirname(envPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = path.join(dir, `.${path.basename(envPath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, serializeEnv(data), { encoding: 'utf-8', mode: 0o600 });
  fs.chmodSync(tmpPath, 0o600);
  fs.renameSync(tmpPath, envPath);
  fs.chmodSync(envPath, 0o600);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// ── Input validation for configuration writes ────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isPlainObject(value) && Object.values(value).every(v => typeof v === 'string');
}

function assertPackageConfig(value: unknown): PackageConfig {
  if (!isPlainObject(value)) throw new Error('invalid_package_config');
  const cfg = value as unknown as PackageConfig;
  if (typeof cfg.filePath !== 'string' || !Array.isArray(cfg.packageNames) || !Array.isArray(cfg.repositories)) {
    throw new Error('invalid_package_config');
  }
  if (!cfg.packageNames.every(n => typeof n === 'string')) throw new Error('invalid_package_config');
  if (!cfg.repositories.every(r => r && typeof r.project === 'string' && typeof r.repo === 'string'
    && typeof r.name === 'string' && typeof r.path === 'string' && typeof r.platform === 'string')) {
    throw new Error('invalid_package_config');
  }
  return cfg;
}

function assertPipelineConfig(value: unknown): PipelineConfig {
  if (!isPlainObject(value)) throw new Error('invalid_pipeline_config');
  const cfg = value as unknown as PipelineConfig;
  if (typeof cfg.filePath !== 'string' || !Array.isArray(cfg.pipelineNames) || !Array.isArray(cfg.repositories)) {
    throw new Error('invalid_pipeline_config');
  }
  if (!cfg.pipelineNames.every(n => typeof n === 'string')) throw new Error('invalid_pipeline_config');
  if (!cfg.repositories.every(r => r && typeof r.project === 'string' && typeof r.repo === 'string'
    && typeof r.name === 'string')) {
    throw new Error('invalid_pipeline_config');
  }
  return cfg;
}

// ── Security middleware ──────────────────────────────────────────────────────

/**
 * Rejects cross-origin browser requests and requires a JSON body for writes.
 * CORS is a browser policy, not an authentication mechanism: this guard runs
 * regardless of CORS, and an optional admin token can be required for writes.
 */
export function securityGuard(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    res.status(403).json({ error: 'forbidden_origin' });
    return;
  }

  const isWrite = req.method !== 'GET' && req.method !== 'HEAD';
  if (isWrite && !req.is('application/json')) {
    res.status(415).json({ error: 'json_required' });
    return;
  }

  // Triggering a scan is a mutation even though it uses GET (EventSource).
  const isScanTrigger = req.originalUrl.split('?')[0].endsWith('/api/fetch/stream');

  if (isWrite || isScanTrigger) {
    const adminToken = process.env['VERSIONRADAR_ADMIN_TOKEN'];
    if (adminToken) {
      const provided = req.get('x-versionradar-admin') ?? (typeof req.query['token'] === 'string' ? req.query['token'] : undefined);
      if (provided !== adminToken) {
        res.status(401).json({ error: 'admin_token_required' });
        return;
      }
    }
  }

  next();
}

// ── App factory ──────────────────────────────────────────────────────────────

export interface AppOptions {
  configDir?: string;
  assetsDir?: string;
  envPath?: string;
  rootDir?: string;
}

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  const configDir = options.configDir ?? CONFIG_DIR;
  const assetsDir = options.assetsDir ?? ASSETS_DIR;
  const rootDir = options.rootDir ?? ROOT_DIR;
  const envPath = options.envPath ?? resolveEnvPath();

  app.use(cors({ origin: ALLOWED_ORIGINS }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', securityGuard);

  app.get('/api/config/repositories', (_req: Request, res: Response) => {
    try { res.json(readJson(path.join(configDir, 'repositories.json'))); }
    catch (err) { res.status(500).json({ error: String(err) }); }
  });

  app.put('/api/config/repositories', (req: Request, res: Response) => {
    try {
      const config = assertPipelineConfig(req.body);
      writeJson(path.join(configDir, 'repositories.json'), config);
      syncPipelinesAsset(config, assetsDir);
      res.json({ success: true });
    } catch (err) { res.status(400).json({ error: String(err) }); }
  });

  app.get('/api/config/package-repositories', (_req: Request, res: Response) => {
    try { res.json(readJson(path.join(configDir, 'package-repositories.json'))); }
    catch (err) { res.status(500).json({ error: String(err) }); }
  });

  app.put('/api/config/package-repositories', (req: Request, res: Response) => {
    try {
      const config = assertPackageConfig(req.body);
      writeJson(path.join(configDir, 'package-repositories.json'), config);
      syncRepositoriesAsset(config, assetsDir);
      res.json({ success: true });
    } catch (err) { res.status(400).json({ error: String(err) }); }
  });

  /**
   * Never returns credential values. Secrets are reported as booleans only;
   * users and non-secret settings remain readable for editing.
   */
  app.get('/api/config/env', (_req: Request, res: Response) => {
    try {
      const data = readEnvFile(envPath);
      res.json({
        envFilePath: envPath,
        settings: Object.fromEntries(SETTING_KEYS.map(k => [k, data[k] ?? ''])),
        users: Object.fromEntries(USER_KEYS.map(k => [k, data[k] ?? ''])),
        secrets: Object.fromEntries(SECRET_KEYS.map(k => [k, isNonEmptyString(data[k])])),
      });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  /**
   * Write-only credential updates: a secret is only replaced when a non-empty
   * value is supplied, and can be removed explicitly through `clearSecrets`.
   */
  app.put('/api/config/env', (req: Request, res: Response) => {
    try {
      const body = req.body as { settings?: unknown; users?: unknown; secrets?: unknown; clearSecrets?: unknown };
      const current = readEnvFile(envPath);
      const next: EnvConfig = { ...current };

      if (body.settings !== undefined) {
        if (!isStringRecord(body.settings)) throw new Error('invalid_settings');
        for (const key of SETTING_KEYS) {
          if (key in body.settings) next[key] = String(body.settings[key]).trim();
        }
      }

      if (body.users !== undefined) {
        if (!isStringRecord(body.users)) throw new Error('invalid_users');
        for (const key of USER_KEYS) {
          if (key in body.users) next[key] = String(body.users[key]).trim();
        }
      }

      if (body.secrets !== undefined) {
        if (!isStringRecord(body.secrets)) throw new Error('invalid_secrets');
        for (const key of SECRET_KEYS) {
          const value = body.secrets[key];
          if (isNonEmptyString(value)) next[key] = value.trim();
        }
      }

      if (body.clearSecrets !== undefined) {
        if (!Array.isArray(body.clearSecrets)) throw new Error('invalid_clear_secrets');
        for (const key of body.clearSecrets) {
          if (SECRET_KEYS.includes(key as SecretKey)) delete next[key];
        }
      }

      writeEnvFile(envPath, next);
      res.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(message.startsWith('invalid_') ? 400 : 500).json({ error: message });
    }
  });

  app.get('/api/fetch/stream', (req: Request, res: Response) => {
    const type = (req.query['type'] as string) || 'all';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (evtType: string, line: string) => {
      res.write(`data: ${JSON.stringify({ type: evtType, line })}\n\n`);
    };

    const tsNodeBin = path.join(rootDir, 'node_modules', 'ts-node', 'dist', 'bin.js');

    const runScript = (scriptPath: string): Promise<number> =>
      new Promise(resolve => {
        if (!fs.existsSync(tsNodeBin)) {
          send('error', 'ts-node introuvable : exécutez npm ci');
          resolve(1);
          return;
        }
        // No shell: the command and its arguments are fixed, never user-controlled.
        const proc = spawn(
          process.execPath,
          [tsNodeBin, '--project', 'tsconfig.scripts.json', scriptPath],
          {
            cwd: rootDir,
            env: { ...process.env, VERSIONRADAR_ENV_FILE: envPath },
            shell: false,
          }
        );
        proc.stdout?.on('data', (chunk: Buffer) =>
          chunk.toString().split('\n').filter(Boolean).forEach(l => send('stdout', l))
        );
        proc.stderr?.on('data', (chunk: Buffer) =>
          chunk.toString().split('\n').filter(Boolean).forEach(l => send('stderr', l))
        );
        proc.on('close', code => resolve(code ?? 0));
      });

    const scripts: string[] = [];
    if (type === 'packages') {
      scripts.push('scripts/fetch-package-versions.ts');
    } else if (type === 'pipelines') {
      scripts.push('scripts/fetch-pipeline-versions.ts');
    } else {
      // 'all': only run the script(s) for platforms that have configured repositories.
      if (configuredRepoCount('package-repositories.json', configDir) > 0) scripts.push('scripts/fetch-package-versions.ts');
      if (configuredRepoCount('repositories.json', configDir) > 0) scripts.push('scripts/fetch-pipeline-versions.ts');
    }

    (async () => {
      let allSuccess = true;
      for (const script of scripts) {
        send('info', `▶ Lancement de ${path.basename(script)}…`);
        const code = await runScript(script);
        if (code !== 0) { allSuccess = false; send('error', `✗ Terminé avec code ${code}`); }
        else { send('success', `✓ ${path.basename(script)} terminé avec succès`); }
      }
      res.write(`data: ${JSON.stringify({ type: 'done', success: allSuccess })}\n\n`);
      res.end();
    })().catch(err => {
      send('error', String(err));
      res.write(`data: ${JSON.stringify({ type: 'done', success: false })}\n\n`);
      res.end();
    });
  });

  return app;
}

export function startServer(): void {
  createApp().listen(PORT, HOST, () => {
    console.log(`✅ Config server running on http://${HOST}:${PORT} (local only)`);
  });
}

// Only listen when executed directly; importing the module must not open a socket.
if (require.main === module) {
  startServer();
}
