/**
 * Project context shared by the CLI fetch scripts and the MCP server.
 * Configuration comes from `config/*.json`; credentials come from the external env file.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TlsConfig, resolveTlsConfig } from '../http-utils';
import { loadEnvironment } from './env';

export interface PackageRepository {
  platform: 'azure' | 'bitbucket';
  collection?: string;
  project: string;
  repo: string;
  name: string;
  path: string;
  branch?: string;
  dockerFilePath?: string;
}

export interface PipelineRepository {
  project: string;
  repo: string;
  name: string;
  branch?: string;
}

export interface PackageConfig {
  filePath: string;
  packageNames: string[];
  repositories: PackageRepository[];
}

export interface PipelineConfig {
  filePath: string;
  valuesFilePath?: string;
  pipelineNames: string[];
  repositories: PipelineRepository[];
}

export interface Messages {
  errors: { missingCredentials: string; parseError: string; timeout: string };
  [key: string]: unknown;
}

export interface Credentials {
  azure: { user: string; token: string; collectionTokens: Record<string, string> };
  bitbucket: { user: string; token: string };
}

export interface ScannerContext {
  rootDir: string;
  packageConfig: PackageConfig;
  pipelineConfig: PipelineConfig;
  messages: Messages;
  credentials: Credentials;
  azureBaseUrl: string;
  bitbucketBaseUrl: string;
  bitbucketAuthScheme: 'bearer' | 'basic';
  requestTimeoutMs: number;
  dateLocale: string;
  tls: TlsConfig;
}

// No internal host is hard-coded here: every on-premise installation must set
// AZUREDEVOPS_BASE_URL and BITBUCKET_BASE_URL in its own credential file.
const DEFAULT_AZURE_BASE_URL = 'https://dev.azure.com';
const DEFAULT_BITBUCKET_BASE_URL = 'https://bitbucket.example.internal';

/** Walks up from `startDir` until the VersionRadar root (config + package.json) is found. */
export function findProjectRoot(startDir: string = __dirname): string {
  const override = process.env['VERSIONRADAR_ROOT']?.trim();
  if (override) return path.resolve(override);

  let current = path.resolve(startDir);
  for (let depth = 0; depth < 8; depth += 1) {
    // A fresh clone has no runtime config yet (gitignored): the examples are enough.
    if (
      fs.existsSync(path.join(current, 'package.json')) &&
      fs.existsSync(path.join(current, 'config'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`VersionRadar root not found from ${startDir}`);
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid configuration: ${label} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new Error(`Invalid configuration: ${label} must be a string array`);
  }
  return value;
}

export function loadPackageConfig(rootDir: string): PackageConfig {
  const raw = readJsonFile<Record<string, unknown>>(path.join(rootDir, 'config', 'package-repositories.json'));
  const repositories = raw['repositories'];
  if (!Array.isArray(repositories)) {
    throw new Error('Invalid configuration: package repositories must be an array');
  }
  for (const repo of repositories as Array<Record<string, unknown>>) {
    requireString(repo['project'], 'package repository project');
    requireString(repo['repo'], 'package repository repo');
    requireString(repo['name'], 'package repository name');
    requireString(repo['path'], 'package repository path');
    if (repo['platform'] !== 'azure' && repo['platform'] !== 'bitbucket') {
      throw new Error('Invalid configuration: package repository platform must be "azure" or "bitbucket"');
    }
  }
  return {
    filePath: requireString(raw['filePath'], 'filePath'),
    packageNames: requireStringArray(raw['packageNames'], 'packageNames'),
    repositories: repositories as PackageRepository[],
  };
}

export function loadPipelineConfig(rootDir: string): PipelineConfig {
  const raw = readJsonFile<Record<string, unknown>>(path.join(rootDir, 'config', 'repositories.json'));
  const repositories = raw['repositories'];
  if (!Array.isArray(repositories)) {
    throw new Error('Invalid configuration: pipeline repositories must be an array');
  }
  for (const repo of repositories as Array<Record<string, unknown>>) {
    requireString(repo['project'], 'pipeline repository project');
    requireString(repo['repo'], 'pipeline repository repo');
    requireString(repo['name'], 'pipeline repository name');
  }
  const config: PipelineConfig = {
    filePath: requireString(raw['filePath'], 'filePath'),
    pipelineNames: requireStringArray(raw['pipelineNames'], 'pipelineNames'),
    repositories: repositories as PipelineRepository[],
  };
  if (typeof raw['valuesFilePath'] === 'string') {
    config.valuesFilePath = raw['valuesFilePath'];
  }
  return config;
}

export function loadMessages(rootDir: string): Messages {
  return readJsonFile<Messages>(path.join(rootDir, 'config', 'messages.json'));
}

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  return (raw?.trim() || fallback).replace(/\/+$/, '');
}

/**
 * Builds the scanner context.
 * `requireCredentials` is false for read-only usage of generated data.
 */
export function loadScannerContext(options: { rootDir?: string; requireCredentials?: boolean } = {}): ScannerContext {
  loadEnvironment({ path: process.env['VERSIONRADAR_ENV_FILE'] });
  const rootDir = options.rootDir ?? findProjectRoot();
  const messages = loadMessages(rootDir);

  const azureUser = process.env['AZUREDEVOPS_USER'] ?? '';
  const azureToken = process.env['AZUREDEVOPS_TOKEN'] ?? '';
  const azureCollection18Token = process.env['AZUREDEVOPS_TOKEN_DEFAULTCOLLECTION18'] ?? '';
  const bitbucketUser = process.env['BITBUCKET_USER'] ?? '';
  const bitbucketToken = process.env['BITBUCKET_TOKEN'] ?? '';

  if (options.requireCredentials) {
    const needsAzure = loadPackageConfig(rootDir).repositories.some(repo => repo.platform === 'azure');
    if (needsAzure && (!azureUser || !azureToken)) {
      throw new Error('Variables AZUREDEVOPS_USER et AZUREDEVOPS_TOKEN requises');
    }
    if (!bitbucketUser || !bitbucketToken) {
      throw new Error(messages.errors.missingCredentials);
    }
  }

  const authSchemeRaw = (process.env['BITBUCKET_AUTH_SCHEME'] ?? 'bearer').toLowerCase();
  const requestTimeoutMs = Number.parseInt(process.env['REQUEST_TIMEOUT_MS'] ?? '30000', 10);

  return {
    rootDir,
    packageConfig: loadPackageConfig(rootDir),
    pipelineConfig: loadPipelineConfig(rootDir),
    messages,
    credentials: {
      azure: {
        user: azureUser,
        token: azureToken,
        collectionTokens: azureCollection18Token ? { DefaultCollection18: azureCollection18Token } : {},
      },
      bitbucket: { user: bitbucketUser, token: bitbucketToken },
    },
    azureBaseUrl: normalizeBaseUrl(process.env['AZUREDEVOPS_BASE_URL'], DEFAULT_AZURE_BASE_URL),
    bitbucketBaseUrl: normalizeBaseUrl(process.env['BITBUCKET_BASE_URL'], DEFAULT_BITBUCKET_BASE_URL),
    bitbucketAuthScheme: authSchemeRaw === 'basic' ? 'basic' : 'bearer',
    requestTimeoutMs: Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0 ? requestTimeoutMs : 30_000,
    dateLocale: process.env['DATE_LOCALE'] ?? 'fr-CH',
    tls: resolveTlsConfig(),
  };
}
