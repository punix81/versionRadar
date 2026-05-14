import express, { Request, Response } from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';

const app = express();
const PORT = 3001;
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const ASSETS_DIR = path.join(__dirname, '..', 'src', 'assets', 'data');
const ENV_PATH = path.join(__dirname, '..', '.env');

app.use(cors());
app.use(express.json());

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ── Types (mirrors Angular interfaces) ───────────────────────────────────────

interface PipelineConfigRepo { project: string; repo: string; name: string; branch?: string }
interface PipelineConfig { filePath: string; pipelineNames: string[]; repositories: PipelineConfigRepo[] }
interface PipelineResult { name: string; project: string; repo: string; status: string; pipelineVersions: Record<string, string | null>; [k: string]: unknown }

interface PackageConfigRepo { platform: string; project: string; repo: string; name: string; path: string; collection?: string; branch?: string }
interface PackageConfig { filePath: string; packageNames: string[]; repositories: PackageConfigRepo[] }
interface PackageResult { name: string; project: string; repo: string; status: string; packageVersions: Record<string, string | null>; [k: string]: unknown }

// ── Sync: pipeline config → assets/data/pipelines.json ───────────────────────

function syncPipelinesAsset(config: PipelineConfig): void {
  const assetPath = path.join(ASSETS_DIR, 'pipelines.json');
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

function syncRepositoriesAsset(config: PackageConfig): void {
  const assetPath = path.join(ASSETS_DIR, 'repositories.json');
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

function parseEnv(raw: string): EnvConfig {
  const result: EnvConfig = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    result[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return result;
}

function serializeEnv(data: EnvConfig): string {
  const azureKeys   = ['AZUREDEVOPS_TOKEN', 'AZUREDEVOPS_USER'];
  const bitbucketKeys = ['BITBUCKET_USER', 'BITBUCKET_TOKEN', 'BITBUCKET_BASE_URL'];
  const settingsKeys = ['REQUEST_TIMEOUT_MS', 'DATE_LOCALE'];

  const lines: string[] = [];
  lines.push('# Azure DevOps');
  for (const k of azureKeys) if (k in data) lines.push(`${k}=${data[k]}`);
  lines.push('');
  lines.push('# Bitbucket');
  for (const k of bitbucketKeys) if (k in data) lines.push(`${k}=${data[k]}`);
  lines.push('');
  lines.push('# Script settings');
  for (const k of settingsKeys) if (k in data) lines.push(`${k}=${data[k]}`);
  // preserve any extra keys not in the known groups
  const known = new Set([...azureKeys, ...bitbucketKeys, ...settingsKeys]);
  const extra = Object.keys(data).filter(k => !known.has(k));
  if (extra.length) {
    lines.push('');
    lines.push('# Other');
    for (const k of extra) lines.push(`${k}=${data[k]}`);
  }
  lines.push('');
  return lines.join('\n');
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/config/repositories', (_req: Request, res: Response) => {
  try { res.json(readJson(path.join(CONFIG_DIR, 'repositories.json'))); }
  catch (err) { res.status(500).json({ error: String(err) }); }
});

app.put('/api/config/repositories', (req: Request, res: Response) => {
  try {
    const config = req.body as PipelineConfig;
    writeJson(path.join(CONFIG_DIR, 'repositories.json'), config);
    syncPipelinesAsset(config);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.get('/api/config/package-repositories', (_req: Request, res: Response) => {
  try { res.json(readJson(path.join(CONFIG_DIR, 'package-repositories.json'))); }
  catch (err) { res.status(500).json({ error: String(err) }); }
});

app.put('/api/config/package-repositories', (req: Request, res: Response) => {
  try {
    const config = req.body as PackageConfig;
    writeJson(path.join(CONFIG_DIR, 'package-repositories.json'), config);
    syncRepositoriesAsset(config);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.get('/api/config/env', (_req: Request, res: Response) => {
  try {
    const raw = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
    res.json(parseEnv(raw));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.put('/api/config/env', (req: Request, res: Response) => {
  try {
    const data = req.body as EnvConfig;
    fs.writeFileSync(ENV_PATH, serializeEnv(data), 'utf-8');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.listen(PORT, () => {
  console.log(`✅ Config server running on http://localhost:${PORT}`);
});

