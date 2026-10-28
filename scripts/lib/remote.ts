/**
 * Read-only retrieval of repository files from Azure DevOps and Bitbucket Server.
 *
 * Security rules:
 * - only repositories declared in `config/*.json` are reachable (allowlist);
 * - every path segment is URL-encoded;
 * - authorization headers are built in memory and never logged;
 * - TLS validation follows the shared policy (secure by default).
 */

import { httpsGetText } from '../http-utils';
import { FetchError, FetchOutcome } from './fetch-error';
import { PackageRepository, ScannerContext } from './scanner-context';

const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._@%~+-]+$/;

/** Rejects traversal and control characters before a path reaches a URL. */
export function normalizeRepositoryPath(input: string): string {
  const trimmed = input.trim().replace(/^\/+/, '');
  if (!trimmed) throw new Error('empty_path');
  const segments = trimmed.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..' || !SAFE_PATH_SEGMENT.test(segment)) {
      throw new Error(`unsafe_path_segment: ${segment}`);
    }
  }
  return segments.join('/');
}

export function encodePathSegments(repositoryPath: string): string {
  return repositoryPath.split('/').map(encodeURIComponent).join('/');
}

function createBasicAuthHeader(user: string, token: string): string {
  return `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`;
}

function azureTokenForCollection(context: ScannerContext, collection: string): string {
  return context.credentials.azure.collectionTokens[collection] ?? context.credentials.azure.token;
}

function bitbucketAuthHeader(context: ScannerContext): string {
  const { user, token } = context.credentials.bitbucket;
  return context.bitbucketAuthScheme === 'basic' ? createBasicAuthHeader(user, token) : `Bearer ${token}`;
}

export function buildAzureFileUrl(context: ScannerContext, repo: PackageRepository, filePath: string): URL {
  const collection = repo.collection ?? 'DefaultCollection';
  const url = new URL(
    `${context.azureBaseUrl}/${encodeURIComponent(collection)}/${encodeURIComponent(repo.project)}` +
    `/_apis/git/repositories/${encodeURIComponent(repo.repo)}/items`
  );
  url.searchParams.set('path', `/${normalizeRepositoryPath(filePath)}`);
  url.searchParams.set('api-version', '6.0');
  return url;
}

export function buildBitbucketRawUrl(context: ScannerContext, repo: PackageRepository, filePath: string): URL {
  const url = new URL(
    `${context.bitbucketBaseUrl}/rest/api/1.0/projects/${encodeURIComponent(repo.project)}` +
    `/repos/${encodeURIComponent(repo.repo)}/raw/${encodePathSegments(normalizeRepositoryPath(filePath))}`
  );
  if (repo.branch) {
    url.searchParams.set('at', `refs/heads/${normalizeRepositoryPath(repo.branch)}`);
  }
  return url;
}

function toFetchError(error: unknown): FetchError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('request_timeout')) return { kind: 'timeout' };
  if (message.includes('response_too_large')) return { kind: 'invalid', detail: 'response_too_large' };
  return { kind: 'network', detail: message.replace(/^request_failed:\s*/, '') };
}

/** Retrieves one file. Returns an outcome instead of throwing, so callers can model failures. */
export async function fetchRepositoryFile(
  context: ScannerContext,
  repo: PackageRepository,
  filePath: string
): Promise<FetchOutcome> {
  let url: URL;
  let headers: Record<string, string>;

  try {
    if (repo.platform === 'azure') {
      const collection = repo.collection ?? 'DefaultCollection';
      url = buildAzureFileUrl(context, repo, filePath);
      headers = {
        Authorization: createBasicAuthHeader(context.credentials.azure.user, azureTokenForCollection(context, collection)),
        Accept: 'text/plain',
        'User-Agent': 'VersionRadar/1.0',
      };
    } else {
      url = buildBitbucketRawUrl(context, repo, filePath);
      headers = {
        Authorization: bitbucketAuthHeader(context),
        Accept: 'text/plain, application/json',
        'User-Agent': 'VersionRadar/1.0',
        'X-Atlassian-Token': 'no-check',
      };
    }
  } catch (error) {
    return { ok: false, error: { kind: 'invalid', detail: error instanceof Error ? error.message : 'invalid_path' } };
  }

  try {
    const response = await httpsGetText(url, headers, {
      timeoutMs: context.requestTimeoutMs,
      tls: context.tls,
    });

    if (response.status === 404) return { ok: false, error: { kind: 'not_found', status: 404 } };
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, error: { kind: 'http', status: response.status } };
    }
    return { ok: true, content: response.body };
  } catch (error) {
    return { ok: false, error: toFetchError(error) };
  }
}
