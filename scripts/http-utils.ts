import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

interface HostIpOverrides {
  [hostname: string]: string;
}

export interface TlsConfig {
  /** When true, certificate validation is disabled. Opt-in only, never the default. */
  insecure: boolean;
  /** Extra CA certificates (PEM) used to trust internal certificate authorities. */
  ca?: string[];
}

export interface HttpGetResult {
  status: number;
  body: string;
}

function loadHostIpOverrides(): HostIpOverrides {
  const raw = process.env['HOST_IP_OVERRIDES'];
  if (!raw) return {};
  try {
    return JSON.parse(raw) as HostIpOverrides;
  } catch {
    return {};
  }
}

/**
 * Resolves the TLS policy.
 *
 * Validation is enabled by default. Internal CAs are trusted through
 * `VERSIONRADAR_CA_FILE` (PEM bundle) or Node's own `NODE_EXTRA_CA_CERTS`.
 * `VERSIONRADAR_TLS_INSECURE=1` is an explicit, documented escape hatch and
 * must never be enabled by default.
 */
export function resolveTlsConfig(env: NodeJS.ProcessEnv = process.env): TlsConfig {
  const insecure = env['VERSIONRADAR_TLS_INSECURE'] === '1' || env['VERSIONRADAR_TLS_INSECURE'] === 'true';
  const caFile = env['VERSIONRADAR_CA_FILE']?.trim();

  if (insecure) {
    return { insecure: true };
  }

  if (!caFile) {
    return { insecure: false };
  }

  const resolved = caFile.startsWith('~/') ? path.join(process.env['HOME'] ?? '', caFile.slice(2)) : caFile;
  const pem = fs.readFileSync(resolved, 'utf-8');
  if (!pem.includes('BEGIN CERTIFICATE')) {
    throw new Error(`VERSIONRADAR_CA_FILE does not contain a PEM certificate: ${resolved}`);
  }
  return { insecure: false, ca: [pem] };
}

/**
 * Builds HTTPS request options for a GET.
 * - Certificate validation follows `tls` (secure by default).
 * - `HOST_IP_OVERRIDES` keeps the original hostname for TLS/SNI and HTTP headers
 *   while connecting to the configured IP (internal DNS workaround).
 */
export function buildHttpsOptions(
  url: URL,
  headers: Record<string, string>,
  tls: TlsConfig = { insecure: false },
  overrides: HostIpOverrides = loadHostIpOverrides()
): https.RequestOptions {
  const hostOverride = overrides[url.hostname];

  const options: https.RequestOptions = {
    hostname: hostOverride ?? url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: 'GET',
    headers,
    rejectUnauthorized: !tls.insecure,
  };

  if (tls.ca && tls.ca.length > 0) {
    options.ca = tls.ca;
  }

  if (hostOverride) {
    options.servername = url.hostname;
    options.headers = { ...headers, Host: url.hostname };
  }

  return options;
}

/** Backwards-compatible wrapper used by the CLI fetch scripts. */
export function createHttpsOptions(url: URL, headers: Record<string, string>): https.RequestOptions {
  return buildHttpsOptions(url, headers, resolveTlsConfig());
}

export interface HttpGetOptions {
  timeoutMs?: number;
  maxBytes?: number;
  tls?: TlsConfig;
  overrides?: HostIpOverrides;
}

/**
 * Performs a GET and buffers a size-limited text body.
 * Error messages never include request headers (they carry credentials).
 */
export function httpsGetText(
  url: URL,
  headers: Record<string, string>,
  options: HttpGetOptions = {}
): Promise<HttpGetResult> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxBytes = options.maxBytes ?? 20 * 1024 * 1024;
  const tls = options.tls ?? resolveTlsConfig();
  const requestOptions = buildHttpsOptions(url, headers, tls, options.overrides ?? loadHostIpOverrides());

  return new Promise((resolve, reject) => {
    const req = https.request(requestOptions, res => {
      const chunks: Buffer[] = [];
      let size = 0;

      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy();
          reject(new Error('response_too_large'));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') });
      });
    });

    req.on('error', error => reject(new Error(`request_failed: ${error.message}`)));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('request_timeout'));
    });
    req.end();
  });
}
