#!/usr/bin/env npx ts-node

/**
 * Script pour récupérer les versions de commons-pipeline et angular-pipeline
 * depuis les fichiers Chart.yaml de plusieurs repos Bitbucket
 *
 * Configuration:
 * - config/repositories.json : Liste des repos et pipelines à surveiller
 * - config/messages.json : Messages et libellés affichés en console
 * - .env : Credentials et paramètres de connexion
 *
 * USAGE:
 * ======
 * npm run fetch-pipelines
 */

import 'dotenv/config';
import * as https from 'https';
import * as http from 'http';
import * as tls from 'tls';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import type { Duplex } from 'stream';

// Charger les fichiers de configuration
const configDir = path.join(__dirname, '..', 'config');
const repositoriesConfig = JSON.parse(
  fs.readFileSync(path.join(configDir, 'repositories.json'), 'utf-8')
);
const messages = JSON.parse(
  fs.readFileSync(path.join(configDir, 'messages.json'), 'utf-8')
);

// Types et Interfaces
interface Repository {
  project: string;
  repo: string;
  name: string;
  branch?: string;
}

interface Credentials {
  username: string;
  token: string;
}

interface PipelineVersions {
  [key: string]: string | null;
}

interface ChartDependency {
  name: string;
  version?: string;
  repository?: string;
}

interface ChartContainer {
  name?: string;
  image?: string;
}

interface ChartYaml {
  apiVersion?: string;
  name?: string;
  description?: string;
  type?: string;
  version?: string;
  appVersion?: string;
  dependencies?: ChartDependency[];
  containers?: ChartContainer[];
}

interface ChartInfo {
  chartName: string;
  chartVersion: string;
  appVersion: string;
  pipelineVersions: PipelineVersions;
  allDependencies: ChartDependency[];
}

interface RepositoryResult {
  name: string;
  project: string;
  repo: string;
  status: 'success' | 'error';
  pipelineVersions: PipelineVersions;
  chartName?: string;
  chartVersion?: string;
  allDependencies?: ChartDependency[];
  error?: string;
}

// Configuration depuis .env
const BITBUCKET_BASE_URL = process.env['BITBUCKET_BASE_URL'] || 'https://bitbucket.bit.admin.ch';
const REQUEST_TIMEOUT_MS = parseInt(process.env['REQUEST_TIMEOUT_MS'] || '30000', 10);
const DATE_LOCALE = process.env['DATE_LOCALE'] || 'fr-CH';
const HTTPS_PROXY = process.env['HTTPS_PROXY'] || process.env['https_proxy'] || process.env['HTTP_PROXY'] || process.env['http_proxy'];
const HOST_IP_OVERRIDES = parseHostIpOverrides(process.env['HOST_IP_OVERRIDES'] || '');
const BITBUCKET_AUTH_SCHEME = (process.env['BITBUCKET_AUTH_SCHEME'] || 'bearer').toLowerCase();

// Configuration depuis repositories.json
const REPOSITORIES: Repository[] = repositoriesConfig.repositories;
const FILE_PATH: string = repositoriesConfig.filePath;
const PIPELINE_NAMES: string[] = repositoriesConfig.pipelineNames;

class HttpsProxyAgent extends https.Agent {
  constructor(private readonly proxyUrl: string) {
    super();
  }

  override createConnection(
    options: https.RequestOptions,
    callback?: (err: Error | null, stream: Duplex) => void
  ): Duplex | null | undefined {
    const proxy = new URL(this.proxyUrl);
    const targetHost = String(options.host || options.hostname);
    const targetPort = options.port || 443;
    let callbackDone = false;

    const done = (err: Error | null, socket?: tls.TLSSocket) => {
      if (callbackDone) return;
      callbackDone = true;
      if (callback) callback(err, socket as Duplex);
    };

    const connectReq = http.request({
      hostname: proxy.hostname,
      port: Number(proxy.port || 80),
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers: {
        Host: `${targetHost}:${targetPort}`
      }
    });

    connectReq.once('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        done(new Error(`Proxy CONNECT HTTP ${res.statusCode}`));
        return;
      }

      const tlsSocket = tls.connect({
        socket,
        servername: targetHost,
        rejectUnauthorized: false
      }, () => done(null, tlsSocket));

      tlsSocket.once('error', error => done(error));
    });

    connectReq.once('error', error => done(error));
    connectReq.end();

    return undefined;
  }
}

const proxyAgent = HTTPS_PROXY ? new HttpsProxyAgent(HTTPS_PROXY) : undefined;

function createHttpsOptions(url: URL, headers: Record<string, string>): https.RequestOptions {
  const hostIp = HOST_IP_OVERRIDES.get(url.hostname);

  return {
    hostname: hostIp || url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: 'GET',
    headers: {
      Host: url.hostname,
      ...headers
    },
    rejectUnauthorized: false,
    servername: url.hostname,
    agent: hostIp ? undefined : proxyAgent
  };
}

function parseHostIpOverrides(raw: string): Map<string, string> {
  const overrides = new Map<string, string>();

  for (const entry of raw.split(',')) {
    const [host, ip] = entry.split('=').map(part => part?.trim());
    if (host && ip) {
      overrides.set(host, ip);
    }
  }

  return overrides;
}

/**
 * Récupérer les credentials depuis le fichier .env
 */
function getCredentials(): Credentials {
  const username = process.env['BITBUCKET_USER'];
  const token = process.env['BITBUCKET_TOKEN'];

  if (!username || !token) {
    console.error(messages.errors.missingCredentials);
    process.exit(1);
  }

  return { username, token };
}

/**
 * Utilise l'approche Renovate pour l'authentification Bitbucket Server
 * Renovate utilise Basic Auth avec username:token
 */
function createAuthHeader(username: string, token: string): string {
  const auth = Buffer.from(`${username}:${token}`).toString('base64');
  return `Basic ${auth}`;
}

function createBitbucketAuthHeader(username: string, token: string): string {
  return BITBUCKET_AUTH_SCHEME === 'basic' ? createAuthHeader(username, token) : `Bearer ${token}`;
}

/**
 * Récupérer le fichier brut depuis Bitbucket Server
 * API: /rest/api/1.0/projects/{projectKey}/repos/{repositorySlug}/raw/{path}
 * Utilise une approche callback avec signaux pour la réactivité
 */
function fetchRawFile(
  projectKey: string,
  repoSlug: string,
  branch: string | null = null,
  onComplete: (data: string | null, error: string | null) => void
): void {
  const { username, token } = getCredentials();

  let apiUrl = `${BITBUCKET_BASE_URL}/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}/raw/${FILE_PATH}`;

  if (branch) {
    apiUrl += `?at=refs/heads/${branch}`;
  }

  const url = new URL(apiUrl);

  const options = createHttpsOptions(url, {
      'Authorization': createBitbucketAuthHeader(username, token),
      'Accept': 'text/plain, application/json',
      'User-Agent': 'VersionRadar/1.0',
      'X-Atlassian-Token': 'no-check'
    });

  const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk: Buffer) => data += chunk);

    res.on('end', () => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        onComplete(data, null);
      } else {
        // Ne pas afficher le contenu de la réponse qui pourrait contenir des infos sensibles
        const statusMsg = `HTTP ${res.statusCode}`;
        onComplete(null, statusMsg);
      }
    });
  });

  req.on('error', (error) => {
    // Masquer les erreurs de connexion qui pourraient contenir des infos sensibles
    onComplete(null, `${messages.errors.timeout} (${error.message})`);
  });

  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    req.destroy();
    onComplete(null, messages.errors.timeout);
  });

  req.end();
}

/**
 * Parser le fichier Chart.yaml et extraire les versions des pipelines
 */
function extractPipelineVersions(yamlContent: string): ChartInfo {
  const chart = yaml.load(yamlContent) as ChartYaml | null;

  if (!chart) {
    throw new Error(messages.errors.parseError);
  }

  const pipelineVersions: PipelineVersions = {};

  // Initialiser toutes les pipelines à null
  for (const pipelineName of PIPELINE_NAMES) {
    pipelineVersions[pipelineName] = null;
  }

  // Chercher dans les dépendances
  if (chart.dependencies && Array.isArray(chart.dependencies)) {
    for (const dep of chart.dependencies) {
      if (PIPELINE_NAMES.includes(dep.name)) {
        pipelineVersions[dep.name] = dep.version || null;
      }
    }
  }

  // Chercher aussi dans les containers si présent
  if (chart.containers && Array.isArray(chart.containers)) {
    for (const container of chart.containers) {
      for (const pipelineName of PIPELINE_NAMES) {
        if (container.name && container.name.includes(pipelineName)) {
          const versionMatch = container.image?.match(/:([^:]+)$/);
          if (versionMatch && !pipelineVersions[pipelineName]) {
            pipelineVersions[pipelineName] = versionMatch[1];
          }
        }
      }
    }
  }

  return {
    chartName: chart.name || 'N/A',
    chartVersion: chart.version || 'N/A',
    appVersion: chart.appVersion || 'N/A',
    pipelineVersions,
    allDependencies: chart.dependencies || []
  };
}

/**
 * Afficher les résultats d'un repository en console
 */
function displayRepoResults(repoConfig: Repository, info: ChartInfo, index: number): void {
  const { display, status } = messages;
  const separator = display.separator.repeat(display.separatorLength);

  if (index > 0) console.log('');
  console.log(separator);
  console.log(`${display.repoIcon} ${repoConfig.name} (${repoConfig.project}/${repoConfig.repo})`);
  console.log(separator);

  console.log(`   ${display.chartLabel}: ${info.chartName} v${info.chartVersion}`);

  for (const pipelineName of PIPELINE_NAMES) {
    const version = info.pipelineVersions[pipelineName];
    if (version) {
      console.log(`   ${status.success} ${pipelineName}: ${version}`);
    } else {
      console.log(`   ${status.warning}  ${pipelineName}: ${status.notFound}`);
    }
  }
}

/**
 * Afficher le tableau récapitulatif
 */
function displaySummaryTable(results: RepositoryResult[]): void {
  const { table } = messages;

  console.log('');
  console.log('');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(25) + table.title + ' '.repeat(29) + '║');
  console.log('╠' + '═'.repeat(78) + '╣');

  // En-têtes dynamiques basés sur les pipelines configurés
  let headerLine = '║ ' + table.headers.repository.padEnd(20) + '│ ';
  for (const pipelineName of PIPELINE_NAMES) {
    headerLine += pipelineName.padEnd(18) + '│ ';
  }
  headerLine += table.headers.status.padEnd(14) + '║';
  console.log(headerLine);
  console.log('╠' + '─'.repeat(78) + '╣');

  results.forEach(result => {
    const name = result.name.substring(0, 18).padEnd(20);
    let line = `║ ${name}│ `;

    for (const pipelineName of PIPELINE_NAMES) {
      const version = result.pipelineVersions[pipelineName] || '-';
      line += version.padEnd(18) + '│ ';
    }

    const statusText = result.status === 'success' ? table.statusOk : table.statusError;
    line += statusText.padEnd(14) + '║';
    console.log(line);
  });

  console.log('╚' + '═'.repeat(78) + '╝');
}

/**
 * Point d'entrée principal - traite les repositories séquentiellement avec callbacks
 */
function main(): void {
  const { app, status, summary } = messages;

  // Utiliser un simple tableau pour stocker les résultats
  const results: RepositoryResult[] = [];

  console.log('');
  console.log(`${app.title} ${app.subtitle}`);
  console.log(`${app.dateLabel}: ${new Date().toLocaleDateString(DATE_LOCALE)}`);
  console.log(`${app.fileLabel}: ${FILE_PATH}`);
  console.log(`${app.repoCountLabel}: ${REPOSITORIES.length}`);
  console.log('');

  /**
   * Traiter les repositories récursivement
   */
  function processNextRepository(index: number): void {
    const totalRepos = REPOSITORIES.length;

    if (index >= totalRepos) {
      // Fin du traitement
      displaySummaryTable(results);

      // Statistiques finales
      const successCount = results.filter(r => r.status === 'success').length;
      const errorCount = results.filter(r => r.status === 'error').length;

      console.log('');
      console.log(`${summary.icon} ${summary.label}: ${successCount} ${summary.success}, ${errorCount} ${summary.errors} ${summary.on} ${totalRepos} ${summary.repositories}`);
      console.log('');

      // Sauvegarder les résultats en JSON pour le dashboard Angular
      const outputPath = path.join(__dirname, '..', 'src', 'assets', 'data', 'pipelines.json');
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
      console.log(`💾 Résultats sauvegardés: ${outputPath}`);

      return;
    }

    const repoConfig = REPOSITORIES[index];

    console.log(`\n${status.fetching} [${index + 1}/${totalRepos}] ${repoConfig.name}...`);

    // Récupérer le fichier avec callback
    fetchRawFile(repoConfig.project, repoConfig.repo, repoConfig.branch || null, (data, error) => {
      if (error) {
        console.log(`\n${status.error} Erreur pour ${repoConfig.name}: ${error}`);

        const emptyVersions: PipelineVersions = {};
        for (const pipelineName of PIPELINE_NAMES) {
          emptyVersions[pipelineName] = null;
        }

        results.push({
          name: repoConfig.name,
          project: repoConfig.project,
          repo: repoConfig.repo,
          status: 'error',
          error: error,
          pipelineVersions: emptyVersions
        });
      } else if (data) {
        try {
          const info = extractPipelineVersions(data);
          displayRepoResults(repoConfig, info, index);

          results.push({
            name: repoConfig.name,
            project: repoConfig.project,
            repo: repoConfig.repo,
            status: 'success',
            pipelineVersions: info.pipelineVersions,
            chartName: info.chartName,
            chartVersion: info.chartVersion,
            allDependencies: info.allDependencies
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`\n${status.error} Erreur pour ${repoConfig.name}: ${errorMessage}`);

          const emptyVersions: PipelineVersions = {};
          for (const pipelineName of PIPELINE_NAMES) {
            emptyVersions[pipelineName] = null;
          }

          results.push({
            name: repoConfig.name,
            project: repoConfig.project,
            repo: repoConfig.repo,
            status: 'error',
            error: errorMessage,
            pipelineVersions: emptyVersions
          });
        }
      }

      // Passer au repository suivant
      processNextRepository(index + 1);
    });
  }

  // Démarrer le traitement avec le premier repository
  processNextRepository(0);
}

main();
