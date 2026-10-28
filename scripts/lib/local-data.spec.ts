import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureLocalRuntimeFiles } from './local-data';

let rootDir: string;

afterEach(() => {
  if (rootDir) fs.rmSync(rootDir, { recursive: true, force: true });
});

function createCloneLikeRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'versionradar-clone-'));
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'assets', 'data'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"fixture"}\n');
  fs.writeFileSync(
    path.join(dir, 'config', 'repositories.example.json'),
    JSON.stringify({ filePath: 'pipeline/Chart.yaml', pipelineNames: [], repositories: [] })
  );
  fs.writeFileSync(
    path.join(dir, 'config', 'package-repositories.example.json'),
    JSON.stringify({ filePath: 'package.json', packageNames: [], repositories: [] })
  );
  return dir;
}

describe('ensureLocalRuntimeFiles', () => {
  it('seeds missing runtime files from the committed examples', () => {
    rootDir = createCloneLikeRoot();

    const result = ensureLocalRuntimeFiles(rootDir);

    expect(result.created).toContain(path.join('config', 'repositories.json'));
    expect(result.created).toContain(path.join('config', 'package-repositories.json'));
    expect(result.created).toContain(path.join('src', 'assets', 'data', 'repositories.json'));
    expect(result.created).toContain(path.join('src', 'assets', 'data', 'pipelines.json'));

    const config = JSON.parse(fs.readFileSync(path.join(rootDir, 'config', 'repositories.json'), 'utf-8'));
    expect(config.repositories).toEqual([]);

    const assets = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'src', 'assets', 'data', 'repositories.json'), 'utf-8')
    );
    expect(assets).toEqual([]);
  });

  it('never overwrites an existing file', () => {
    rootDir = createCloneLikeRoot();
    const target = path.join(rootDir, 'config', 'repositories.json');
    fs.writeFileSync(target, JSON.stringify({ filePath: 'custom', pipelineNames: ['x'], repositories: [] }));

    const result = ensureLocalRuntimeFiles(rootDir);

    expect(result.created).not.toContain(path.join('config', 'repositories.json'));
    const content = JSON.parse(fs.readFileSync(target, 'utf-8'));
    expect(content.filePath).toBe('custom');
  });

  it('does not create a scan metadata file', () => {
    rootDir = createCloneLikeRoot();
    ensureLocalRuntimeFiles(rootDir);

    expect(fs.existsSync(path.join(rootDir, 'src', 'assets', 'data', 'scan-metadata.json'))).toBe(false);
  });
});
