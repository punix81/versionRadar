/**
 * Single credential source for VersionRadar.
 *
 * The env file lives outside the repository (default: ~/.config/opencode/versionRadar.env),
 * must be readable by the current user only (0600), and its values are never logged
 * nor returned by any API or MCP tool.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const DEFAULT_ENV_RELATIVE_PATH = path.join('.config', 'opencode', 'versionRadar.env');

/** Credentials used to reach Azure DevOps and Bitbucket. Values must never be exposed. */
export const SECRET_KEYS = [
  'AZUREDEVOPS_TOKEN',
  'AZUREDEVOPS_TOKEN_DEFAULTCOLLECTION18',
  'BITBUCKET_TOKEN',
] as const;

/** Non-secret identity values. */
export const USER_KEYS = ['AZUREDEVOPS_USER', 'BITBUCKET_USER'] as const;

/** Non-secret settings. */
export const SETTING_KEYS = [
  'BITBUCKET_BASE_URL',
  'BITBUCKET_AUTH_SCHEME',
  'REQUEST_TIMEOUT_MS',
  'DATE_LOCALE',
  'HOST_IP_OVERRIDES',
  'VERSIONRADAR_TLS_INSECURE',
  'VERSIONRADAR_CA_FILE',
] as const;

export interface EnvFileStatus {
  path: string;
  exists: boolean;
  /** True when no group/other permission bit is set (0600 or stricter). */
  restrictivePermissions: boolean;
  /** Octal permission string, e.g. "600". Never contains any value. */
  mode: string | null;
  /** Names of the variables defined in the file. Never their values. */
  keys: string[];
}

export interface CredentialStatus {
  azure: {
    userConfigured: boolean;
    tokenConfigured: boolean;
    defaultCollection18TokenConfigured: boolean;
  };
  bitbucket: {
    userConfigured: boolean;
    tokenConfigured: boolean;
  };
  envFile: EnvFileStatus;
}

export function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

/** Resolves the env file path. `VERSIONRADAR_ENV_FILE` wins, then the OpenCode config directory. */
export function resolveEnvFilePath(explicitPath?: string): string {
  const candidate = explicitPath?.trim() || process.env['VERSIONRADAR_ENV_FILE']?.trim();
  if (candidate) return expandHome(candidate);
  return path.join(os.homedir(), DEFAULT_ENV_RELATIVE_PATH);
}

/** Parses a dotenv-style file. Invalid keys are ignored, values are not interpreted. */
export function parseEnvFile(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Reads the env file and applies its non-empty values to `process.env`.
 *
 * The external file is the single source of truth: a non-empty value replaces a
 * stale process value, so a token added or rotated while the MCP server is running
 * is picked up on the next tool call. Empty values in the file are ignored and
 * never erase an inherited variable.
 *
 * Returns metadata only: no value is ever returned by this function.
 */
export function loadEnvironment(options: { path?: string; warn?: (message: string) => void } = {}): EnvFileStatus {
  const envPath = resolveEnvFilePath(options.path);
  const warn = options.warn ?? ((message: string) => process.stderr.write(`[versionradar] ${message}\n`));

  if (!fs.existsSync(envPath)) {
    return { path: envPath, exists: false, restrictivePermissions: false, mode: null, keys: [] };
  }

  const raw = fs.readFileSync(envPath, 'utf-8');
  const parsed = parseEnvFile(raw);

  let mode: string | null = null;
  let restrictive = false;
  try {
    const stat = fs.statSync(envPath);
    const permBits = stat.mode & 0o777;
    mode = permBits.toString(8).padStart(3, '0');
    restrictive = (permBits & 0o077) === 0;
  } catch {
    // Permission metadata is best-effort: reading already succeeded.
  }

  if (!restrictive && mode) {
    warn(`env file ${envPath} has permissions ${mode}; chmod 600 is required.`);
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (value.trim().length === 0) continue;
    process.env[key] = value;
  }

  return { path: envPath, exists: true, restrictivePermissions: restrictive, mode, keys: Object.keys(parsed) };
}

/** Reports which credentials are present. Never returns a value, prefix or suffix. */
export function getCredentialStatus(options: { path?: string } = {}): CredentialStatus {
  const status = loadEnvironment({ path: options.path });
  const value = (key: string): string => (process.env[key] ?? '').trim();

  return {
    azure: {
      userConfigured: value('AZUREDEVOPS_USER').length > 0,
      tokenConfigured: value('AZUREDEVOPS_TOKEN').length > 0,
      defaultCollection18TokenConfigured: value('AZUREDEVOPS_TOKEN_DEFAULTCOLLECTION18').length > 0,
    },
    bitbucket: {
      userConfigured: value('BITBUCKET_USER').length > 0,
      tokenConfigured: value('BITBUCKET_TOKEN').length > 0,
    },
    envFile: status,
  };
}
