/**
 * package.json / package-lock.json parsing and per-repository scanning.
 *
 * The parsing rules are the single source of truth and are reused by the CLI
 * fetch script and the MCP server. Nothing in this module writes to disk.
 */

import { FetchError, describeFetchError } from './fetch-error';
import { fetchRepositoryFile } from './remote';
import { PackageRepository, ScannerContext } from './scanner-context';
import { resolveNginxVersion } from '../nginx-version';

export type PackageVersions = Record<string, string | null>;

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface PackageLockDependency {
  version?: string;
  dependencies?: Record<string, PackageLockDependency>;
}

export interface PackageLockJson {
  packages?: Record<string, { version?: string }>;
  dependencies?: Record<string, PackageLockDependency>;
}

export interface PackageInfo {
  packageName: string;
  packageVersion: string;
  packageVersions: PackageVersions;
  allDependencies: Record<string, string>;
  lockDependencies: Record<string, string>;
}

export interface PackageScanResult {
  name: string;
  platform: string;
  project: string;
  repo: string;
  status: 'success' | 'error';
  packageVersions: PackageVersions;
  packageName?: string;
  packageVersion?: string;
  nginxVersion?: string | null;
  allDependencies?: Record<string, string>;
  lockDependencies?: Record<string, string>;
  error?: string;
}

export function getPackageLockPath(packageJsonPath: string): string {
  const slashIndex = packageJsonPath.lastIndexOf('/');
  return slashIndex >= 0
    ? `${packageJsonPath.slice(0, slashIndex + 1)}package-lock.json`
    : 'package-lock.json';
}

export function getDockerfilePath(repo: PackageRepository): string {
  if (repo.dockerFilePath) return repo.dockerFilePath;
  const slashIndex = repo.path.lastIndexOf('/');
  return slashIndex >= 0
    ? `${repo.path.slice(0, slashIndex + 1)}Dockerfile`
    : 'Dockerfile';
}

export function getPackageNameFromLockPath(lockPath: string): string | null {
  const parts = lockPath.split('node_modules/');
  return parts.length > 1 ? parts[parts.length - 1] : null;
}

export function collectLegacyLockDependencies(
  source: Record<string, PackageLockDependency>,
  target: Record<string, string>
): void {
  for (const [name, dependency] of Object.entries(source)) {
    if (dependency.version) {
      target[name] = dependency.version;
    }
    if (dependency.dependencies) {
      collectLegacyLockDependencies(dependency.dependencies, target);
    }
  }
}

export function extractPackageLockDependencies(lockContent: string): Record<string, string> {
  try {
    const packageLock: PackageLockJson = JSON.parse(lockContent);
    const dependencies: Record<string, string> = {};

    if (packageLock.packages) {
      for (const [lockPath, entry] of Object.entries(packageLock.packages)) {
        if (!lockPath || !entry.version) continue;
        const packageName = getPackageNameFromLockPath(lockPath);
        if (packageName) {
          dependencies[packageName] = entry.version;
        }
      }
    }

    if (Object.keys(dependencies).length === 0 && packageLock.dependencies) {
      collectLegacyLockDependencies(packageLock.dependencies, dependencies);
    }

    return dependencies;
  } catch {
    return {};
  }
}

export function extractPackageVersions(
  jsonContent: string,
  lockContent: string | null,
  packageNames: string[]
): PackageInfo {
  const packageJson: PackageJson = JSON.parse(jsonContent);

  const packageVersions: PackageVersions = {};
  const allDependencies: Record<string, string> = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  for (const packageName of packageNames) {
    packageVersions[packageName] = allDependencies[packageName] ?? null;
  }

  return {
    packageName: packageJson.name || 'N/A',
    packageVersion: packageJson.version || 'N/A',
    packageVersions,
    allDependencies,
    lockDependencies: lockContent ? extractPackageLockDependencies(lockContent) : {},
  };
}

export interface PackageScanOutcome {
  result: PackageScanResult;
  /** Raw package.json content, kept for diagnostics only (never persisted). */
  rawPackageJson?: string;
  /** Non-fatal issues such as a missing lock file. */
  warnings: string[];
}

function emptyVersions(packageNames: string[]): PackageVersions {
  return Object.fromEntries(packageNames.map(name => [name, null]));
}

/**
 * Scans one repository: package.json (required), package-lock.json and Dockerfile (optional).
 * Performs network reads only; the caller decides whether to persist anything.
 */
export async function scanPackageRepository(
  context: ScannerContext,
  repo: PackageRepository
): Promise<PackageScanOutcome> {
  const { packageNames, filePath } = context.packageConfig;
  const warnings: string[] = [];

  const base = {
    name: repo.name,
    platform: repo.platform,
    project: repo.project,
    repo: repo.repo,
  };

  const packageJson = await fetchRepositoryFile(context, repo, repo.path || filePath);
  if (!packageJson.ok) {
    return {
      result: {
        ...base,
        status: 'error',
        error: describeFetchError(packageJson.error as FetchError),
        packageVersions: emptyVersions(packageNames),
      },
      warnings,
    };
  }

  const lockFile = await fetchRepositoryFile(context, repo, getPackageLockPath(repo.path || filePath));
  if (!lockFile.ok) {
    warnings.push(`package-lock.json non disponible: ${describeFetchError(lockFile.error)}`);
  }

  let info: PackageInfo;
  try {
    info = extractPackageVersions(packageJson.content, lockFile.ok ? lockFile.content : null, packageNames);
  } catch {
    return {
      result: {
        ...base,
        status: 'error',
        error: 'Impossible de parser le fichier package.json',
        packageVersions: emptyVersions(packageNames),
      },
      rawPackageJson: packageJson.content,
      warnings,
    };
  }

  const dockerfile = await fetchRepositoryFile(context, repo, getDockerfilePath(repo));
  let nginxVersion: string | null = null;
  if (dockerfile.ok) {
    try {
      nginxVersion = resolveNginxVersion(dockerfile.content);
    } catch {
      nginxVersion = null;
    }
  }

  return {
    result: {
      ...base,
      status: 'success',
      packageVersions: info.packageVersions,
      packageName: info.packageName,
      packageVersion: info.packageVersion,
      nginxVersion,
      allDependencies: info.allDependencies,
      lockDependencies: info.lockDependencies,
    },
    warnings,
  };
}
