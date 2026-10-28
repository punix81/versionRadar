import { describe, expect, it } from 'vitest';
import {
  extractPackageLockDependencies,
  extractPackageVersions,
  getDockerfilePath,
  getPackageLockPath,
} from './package-scan';

const PACKAGE_NAMES = ['zone.js', '@oblique/oblique', '@angular/cdk'];

describe('getPackageLockPath', () => {
  it('places the lock file next to the package file', () => {
    expect(getPackageLockPath('package.json')).toBe('package-lock.json');
    expect(getPackageLockPath('frontend/package.json')).toBe('frontend/package-lock.json');
  });
});

describe('getDockerfilePath', () => {
  it('defaults to the sibling Dockerfile but honours an override', () => {
    expect(getDockerfilePath({ path: 'frontend/package.json' } as never)).toBe('frontend/Dockerfile');
    expect(getDockerfilePath({ path: 'package.json' } as never)).toBe('Dockerfile');
    expect(getDockerfilePath({ path: 'package.json', dockerFilePath: 'docker/Dockerfile' } as never)).toBe('docker/Dockerfile');
  });
});

describe('extractPackageVersions', () => {
  it('reads tracked packages and merges dependencies with devDependencies', () => {
    const info = extractPackageVersions(
      JSON.stringify({
        name: 'alpha-ui',
        version: '1.2.3',
        dependencies: { 'zone.js': '^0.15.1', '@angular/cdk': '^20.2.12' },
        devDependencies: { '@oblique/oblique': '~14.1.1' },
      }),
      null,
      PACKAGE_NAMES
    );

    expect(info.packageName).toBe('alpha-ui');
    expect(info.packageVersion).toBe('1.2.3');
    expect(info.packageVersions).toEqual({
      'zone.js': '^0.15.1',
      '@oblique/oblique': '~14.1.1',
      '@angular/cdk': '^20.2.12',
    });
    expect(info.allDependencies['@oblique/oblique']).toBe('~14.1.1');
    expect(info.lockDependencies).toEqual({});
  });

  it('reports missing tracked packages as null', () => {
    const info = extractPackageVersions(JSON.stringify({ name: 'x' }), null, PACKAGE_NAMES);
    expect(info.packageVersions['@oblique/oblique']).toBeNull();
  });

  it('throws on malformed package.json instead of inventing data', () => {
    expect(() => extractPackageVersions('{ not json', null, PACKAGE_NAMES)).toThrow();
  });
});

describe('extractPackageLockDependencies', () => {
  it('reads modern lockfiles through the packages map', () => {
    const lock = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { version: '1.0.0' },
        'node_modules/left-pad': { version: '1.3.0' },
        'node_modules/@scope/pkg': { version: '2.0.1' },
      },
    });
    expect(extractPackageLockDependencies(lock)).toEqual({ 'left-pad': '1.3.0', '@scope/pkg': '2.0.1' });
  });

  it('falls back to legacy nested dependencies', () => {
    const lock = JSON.stringify({
      lockfileVersion: 1,
      dependencies: {
        'left-pad': { version: '1.3.0', dependencies: { nested: { version: '0.0.1' } } },
      },
    });
    expect(extractPackageLockDependencies(lock)).toEqual({ 'left-pad': '1.3.0', nested: '0.0.1' });
  });

  it('returns an empty map on malformed input rather than failing the scan', () => {
    expect(extractPackageLockDependencies('<<<')).toEqual({});
  });
});
