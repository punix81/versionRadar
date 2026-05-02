import express, { Request, Response } from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';

const app = express();
const PORT = 3001;
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const ASSETS_DIR = path.join(__dirname, '..', 'src', 'assets', 'data');

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

  const configKeys = new Set(config.repositories.map(r => `${r.project}::${r.repo}`));
  const data = readJson<PipelineResult[]>(assetPath);

  const filtered = data
    .filter(r => configKeys.has(`${r.project}::${r.repo}`))
    .map(r => {
      const newVersions: Record<string, string | null> = {};
      for (const name of config.pipelineNames) {
        newVersions[name] = r.pipelineVersions[name] ?? null;
      }
      return { ...r, pipelineVersions: newVersions };
    });

  writeJson(assetPath, filtered);
  console.log(`🔄 Synced pipelines.json: ${filtered.length}/${data.length} repos kept`);
}

// ── Sync: package config → assets/data/repositories.json ─────────────────────

function syncRepositoriesAsset(config: PackageConfig): void {
  const assetPath = path.join(ASSETS_DIR, 'repositories.json');
  if (!fs.existsSync(assetPath)) return;

  const configNames = new Set(config.repositories.map(r => r.name));
  const data = readJson<PackageResult[]>(assetPath);

  const filtered = data
    .filter(r => configNames.has(r.name))
    .map(r => {
      const newVersions: Record<string, string | null> = {};
      for (const name of config.packageNames) {
        newVersions[name] = r.packageVersions[name] ?? null;
      }
      return { ...r, packageVersions: newVersions };
    });

  writeJson(assetPath, filtered);
  console.log(`🔄 Synced repositories.json: ${filtered.length}/${data.length} repos kept`);
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

app.listen(PORT, () => {
  console.log(`✅ Config server running on http://localhost:${PORT}`);
});

