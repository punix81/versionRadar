import { describe, expect, it } from 'vitest';
import { buildAzureFileUrl, buildBitbucketRawUrl, fetchRepositoryFile, normalizeRepositoryPath } from './remote';
import { ScannerContext } from './scanner-context';

const context = {
  rootDir: '/tmp/fixture',
  packageConfig: { filePath: 'package.json', packageNames: [], repositories: [] },
  pipelineConfig: { filePath: 'pipeline/Chart.yaml', pipelineNames: [], repositories: [] },
  messages: { errors: { missingCredentials: '', parseError: '', timeout: '' } },
  credentials: {
    azure: { user: 'user', token: 'token', collectionTokens: {} },
    bitbucket: { user: 'user', token: 'token' },
  },
  azureBaseUrl: 'https://azure.example.invalid',
  bitbucketBaseUrl: 'https://bitbucket.example.invalid',
  bitbucketAuthScheme: 'bearer' as const,
  requestTimeoutMs: 1000,
  dateLocale: 'fr-CH',
  tls: { insecure: false },
} satisfies ScannerContext;

describe('normalizeRepositoryPath', () => {
  it('accepts normal nested paths', () => {
    expect(normalizeRepositoryPath('/frontend/package.json')).toBe('frontend/package.json');
    expect(normalizeRepositoryPath('pipeline/Chart.yaml')).toBe('pipeline/Chart.yaml');
  });

  it.each([['../secret'], ['a/../../b'], [''], ['a//b'], ['a/\u0000b'], ['a/ b']])(
    'rejects unsafe path %s',
    input => {
      expect(() => normalizeRepositoryPath(input)).toThrow();
    }
  );
});

describe('buildAzureFileUrl', () => {
  it('encodes segments and passes the path as a query parameter', () => {
    const url = buildAzureFileUrl(
      context,
      { platform: 'azure', project: 'PROJECT A', repo: 'repo', name: 'r', path: 'frontend/package.json' },
      'frontend/package.json'
    );

    expect(url.origin).toBe('https://azure.example.invalid');
    expect(url.pathname).toContain('/PROJECT%20A/_apis/git/repositories/repo/items');
    expect(url.searchParams.get('path')).toBe('/frontend/package.json');
    expect(url.searchParams.get('api-version')).toBe('6.0');
  });
});

describe('buildBitbucketRawUrl', () => {
  it('encodes the path and the branch', () => {
    const url = buildBitbucketRawUrl(
      context,
      { platform: 'bitbucket', project: 'PROJECT', repo: 'repo', name: 'r', path: 'package.json', branch: 'feature/x' },
      'package.json'
    );

    expect(url.pathname).toBe('/rest/api/1.0/projects/PROJECT/repos/repo/raw/package.json');
    expect(url.searchParams.get('at')).toBe('refs/heads/feature/x');
  });
});

describe('fetchRepositoryFile', () => {
  it('returns an invalid outcome for an unsafe path without performing a request', async () => {
    const outcome = await fetchRepositoryFile(
      context,
      { platform: 'bitbucket', project: 'PROJECT', repo: 'repo', name: 'r', path: '../etc/passwd' },
      '../etc/passwd'
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.kind).toBe('invalid');
    }
  });
});
