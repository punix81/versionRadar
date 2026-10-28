/**
 * Local runtime files: monitored repository inventory and generated scan results.
 *
 * They are intentionally NOT tracked by Git (see .gitignore): they contain internal
 * repository names, versions and scan results that must not be published. A fresh
 * clone seeds empty, valid files from the committed examples.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface SeedResult {
  created: string[];
  skipped: string[];
}

interface Seed {
  target: string;
  /** Committed example copied when the target is missing. */
  example?: string;
  /** Fallback content when no example exists. */
  content?: string;
}

const SEEDS: Seed[] = [
  { target: path.join('config', 'repositories.json'), example: path.join('config', 'repositories.example.json') },
  { target: path.join('config', 'package-repositories.json'), example: path.join('config', 'package-repositories.example.json') },
  { target: path.join('src', 'assets', 'data', 'repositories.json'), content: '[]\n' },
  { target: path.join('src', 'assets', 'data', 'pipelines.json'), content: '[]\n' },
];

/** Creates missing runtime files. Never overwrites an existing file. */
export function ensureLocalRuntimeFiles(rootDir: string): SeedResult {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const seed of SEEDS) {
    const targetPath = path.join(rootDir, seed.target);
    if (fs.existsSync(targetPath)) {
      skipped.push(seed.target);
      continue;
    }

    const examplePath = seed.example ? path.join(rootDir, seed.example) : null;
    const content = examplePath && fs.existsSync(examplePath)
      ? fs.readFileSync(examplePath, 'utf-8')
      : seed.content ?? '';

    if (!content) {
      skipped.push(seed.target);
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf-8');
    created.push(seed.target);
  }

  return { created, skipped };
}
