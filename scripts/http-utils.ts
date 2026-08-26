import * as https from 'https';

interface HostIpOverrides {
  [hostname: string]: string;
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
 * Construit les options HTTPS pour une requête GET.
 * - Désactive la vérification TLS (certificats internes auto-signés).
 * - Permet d'écraser le hostname par une adresse IP via HOST_IP_OVERRIDES
 *   (ex: '{"bitbucket.bit.admin.ch":"10.0.0.5"}') tout en conservant le SNI original.
 */
export function createHttpsOptions(url: URL, headers: Record<string, string>): https.RequestOptions {
  const overrides = loadHostIpOverrides();
  const hostOverride = overrides[url.hostname];

  const options: https.RequestOptions = {
    hostname: hostOverride ?? url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: 'GET',
    headers,
    rejectUnauthorized: false,
  };

  if (hostOverride) {
    options.servername = url.hostname;
    options.headers = { ...headers, Host: url.hostname };
  }

  return options;
}
