#!/usr/bin/env npx ts-node

/**
 * Script pour récupérer les versions d'Oblique et Angular
 * depuis les fichiers package.json de plusieurs repos Azure DevOps et Bitbucket
 *
 * Configuration:
 * - config/package-repositories.json : Liste des repos à surveiller
 * - config/messages.json : Messages et libellés
 * - .env : Credentials pour Azure DevOps et Bitbucket
 *
 * USAGE:
 * ======
 * npm run fetch-packages
 */

import 'dotenv/config';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { signal } from '@angular/core';

// Charger les fichiers de configuration
const configDir = path.join(__dirname, '..', 'config');
const repositoriesConfig = JSON.parse(
  fs.readFileSync(path.join(configDir, 'package-repositories.json'), 'utf-8')
);
const messages = JSON.parse(
  fs.readFileSync(path.join(configDir, 'messages.json'), 'utf-8')
);

// Types et Interfaces
interface Repository {
  platform: 'azure' | 'bitbucket';
  collection?: string;
  project: string;
  repo: string;
  name: string;
  path: string;
  branch?: string;
}

interface Credentials {
  azure: {
    user: string;
    token: string;
  };
  bitbucket: {
    user: string;
    token: string;
  };
}

interface PackageVersions {
  [key: string]: string | null;
}

interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: { [key: string]: string };
  devDependencies?: { [key: string]: string };
}

interface PackageInfo {
  packageName: string;
  packageVersion: string;
  packageVersions: PackageVersions;
  allDependencies: { [key: string]: string };
}

interface RepositoryResult {
  name: string;
  platform: string;
  project: string;
  repo: string;
  status: 'success' | 'error';
  packageVersions: PackageVersions;
  packageName?: string;
  packageVersion?: string;
  allDependencies?: { [key: string]: string };
  error?: string;
}

// Configuration depuis .env
const AZURE_BASE_URL = 'https://devops-server.admin.ch';
const BITBUCKET_BASE_URL = process.env['BITBUCKET_BASE_URL'] || 'https://bitbucket.bit.admin.ch';
const REQUEST_TIMEOUT_MS = parseInt(process.env['REQUEST_TIMEOUT_MS'] || '30000', 10);
const DATE_LOCALE = process.env['DATE_LOCALE'] || 'fr-CH';

// Configuration depuis package-repositories.json
const REPOSITORIES: Repository[] = repositoriesConfig.repositories;
const FILE_PATH: string = repositoriesConfig.filePath;
const PACKAGE_NAMES: string[] = repositoriesConfig.packageNames;

/**
 * Récupérer les credentials depuis le fichier .env
 */
function getCredentials(): Credentials {
  const azureUser = process.env['AZUREDEVOPS_USER'];
  const azureToken = process.env['AZUREDEVOPS_TOKEN'];
  const bitbucketUser = process.env['BITBUCKET_USER'];
  const bitbucketToken = process.env['BITBUCKET_TOKEN'];

  if (!azureUser || !azureToken) {
    console.error('❌ Erreur: Variables AZUREDEVOPS_USER et AZUREDEVOPS_TOKEN requises dans .env');
    process.exit(1);
  }

  if (!bitbucketUser || !bitbucketToken) {
    console.error(messages.errors.missingCredentials);
    process.exit(1);
  }

  return {
    azure: { user: azureUser, token: azureToken },
    bitbucket: { user: bitbucketUser, token: bitbucketToken }
  };
}

/**
 * Créer l'en-tête d'authentification Basic Auth
 */
function createAuthHeader(username: string, token: string): string {
  const auth = Buffer.from(`${username}:${token}`).toString('base64');
  return `Basic ${auth}`;
}

/**
 * Récupérer le fichier depuis Azure DevOps
 * API: https://devops-server.admin.ch/{collection}/{project}/_apis/git/repositories/{repositoryId}/items?path={path}&api-version=6.0
 */
function fetchFromAzure(
  repo: Repository,
  credentials: Credentials,
  onComplete: (data: string | null, error: string | null) => void
): void {
  // Format de l'URL Azure DevOps
  const collection = repo.collection || 'DefaultCollection';
  const apiUrl = `${AZURE_BASE_URL}/${collection}/${repo.project}/_apis/git/repositories/${repo.repo}/items?path=/${repo.path}&api-version=6.0`;

  const url = new URL(apiUrl);

  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: 'GET',
    headers: {
      'Authorization': createAuthHeader(credentials.azure.user, credentials.azure.token),
      'Accept': 'text/plain',  // Important: demander le contenu brut
      'User-Agent': 'VersionRadar/1.0'
    },
    rejectUnauthorized: false
  };

  const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk: Buffer) => data += chunk);

    res.on('end', () => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        // Azure DevOps retourne le contenu directement
        onComplete(data, null);
      } else {
        const statusMsg = `HTTP ${res.statusCode}`;
        onComplete(null, statusMsg);
      }
    });
  });

  req.on('error', () => {
    onComplete(null, messages.errors.timeout);
  });

  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    req.destroy();
    onComplete(null, messages.errors.timeout);
  });

  req.end();
}

/**
 * Récupérer le fichier depuis Bitbucket Server
 * API: /rest/api/1.0/projects/{projectKey}/repos/{repositorySlug}/raw/{path}
 */
function fetchFromBitbucket(
  repo: Repository,
  credentials: Credentials,
  onComplete: (data: string | null, error: string | null) => void
): void {
  let apiUrl = `${BITBUCKET_BASE_URL}/rest/api/1.0/projects/${repo.project}/repos/${repo.repo}/raw/${repo.path}`;

  if (repo.branch) {
    apiUrl += `?at=refs/heads/${repo.branch}`;
  }

  const url = new URL(apiUrl);

  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: 'GET',
    headers: {
      'Authorization': createAuthHeader(credentials.bitbucket.user, credentials.bitbucket.token),
      'Accept': 'application/json',
      'User-Agent': 'VersionRadar/1.0',
      'X-Atlassian-Token': 'no-check'
    },
    rejectUnauthorized: false
  };

  const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk: Buffer) => data += chunk);

    res.on('end', () => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        onComplete(data, null);
      } else {
        const statusMsg = `HTTP ${res.statusCode}`;
        onComplete(null, statusMsg);
      }
    });
  });

  req.on('error', () => {
    onComplete(null, messages.errors.timeout);
  });

  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    req.destroy();
    onComplete(null, messages.errors.timeout);
  });

  req.end();
}

/**
 * Récupérer le fichier package.json selon la plateforme
 */
function fetchPackageJson(
  repo: Repository,
  credentials: Credentials,
  onComplete: (data: string | null, error: string | null) => void
): void {
  if (repo.platform === 'azure') {
    fetchFromAzure(repo, credentials, onComplete);
  } else {
    fetchFromBitbucket(repo, credentials, onComplete);
  }
}

/**
 * Parser le package.json et extraire les versions des packages
 */
function extractPackageVersions(jsonContent: string): PackageInfo {
  try {
    const packageJson: PackageJson = JSON.parse(jsonContent);

    const packageVersions: PackageVersions = {};
    const allDependencies: { [key: string]: string } = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    // Chercher les packages configurés
    for (const packageName of PACKAGE_NAMES) {
      packageVersions[packageName] = allDependencies[packageName] || null;
    }

    return {
      packageName: packageJson.name || 'N/A',
      packageVersion: packageJson.version || 'N/A',
      packageVersions,
      allDependencies
    };
  } catch (error) {
    throw new Error('Impossible de parser le fichier package.json');
  }
}

/**
 * Afficher les résultats d'un repository
 */
function displayRepoResults(repo: Repository, info: PackageInfo, index: number): void {
  const display = messages.display;
  const status = messages.status;
  const separator = display.separator.repeat(display.separatorLength);

  if (index > 0) {
    console.log();
  }
  console.log(separator);
  console.log(`${display.repoIcon} ${repo.name} [${repo.platform.toUpperCase()}] (${repo.project}/${repo.repo})`);
  console.log(separator);

  console.log(`   📦 Package: ${info.packageName} v${info.packageVersion}`);

  for (const packageName of PACKAGE_NAMES) {
    const version = info.packageVersions[packageName];
    if (version) {
      console.log(`   ${status.success} ${packageName}: ${version}`);
    } else {
      console.log(`   ${status.warning}  ${packageName}: ${status.notFound}`);
    }
  }
}

/**
 * Afficher le tableau récapitulatif
 */
function displaySummaryTable(results: RepositoryResult[]): void {
  const table = messages.table;

  console.log('\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  const title = '📊 VERSIONS DES PACKAGES';
  const padding = Math.floor((78 - title.length) / 2);
  console.log('║' + ' '.repeat(padding) + title + ' '.repeat(78 - padding - title.length) + '║');
  console.log('╠' + '═'.repeat(78) + '╣');

  // En-têtes
  let headerLine = '║ Repository'.padEnd(23) + '│ ';
  for (const packageName of PACKAGE_NAMES) {
    // Raccourcir les noms pour l'affichage
    const shortName = packageName
      .replace('@oblique/oblique', '@oblique')
      .replace('@angular/cdk', '@ng/cdk');
    headerLine += shortName.padEnd(18) + '│ ';
  }
  headerLine += 'Status'.padEnd(14) + '║';
  console.log(headerLine);
  console.log('╠' + '─'.repeat(78) + '╣');

  // Résultats
  for (const result of results) {
    const name = result.name.substring(0, 18).padEnd(21);
    let line = `║ ${name}│ `;

    for (const packageName of PACKAGE_NAMES) {
      const version = result.packageVersions[packageName] || '-';
      const displayVersion = version.replace(/[\^~]/, '').substring(0, 16);
      line += displayVersion.padEnd(18) + '│ ';
    }

    const statusText = result.status === 'success' ? table.statusOk : table.statusError;
    line += statusText.padEnd(14) + '║';
    console.log(line);
  }

  console.log('╚' + '═'.repeat(78) + '╝');
}

/**
 * Point d'entrée principal
 */
function main(): void {
  const status = messages.status;
  const summary = messages.summary;

  const results = signal<RepositoryResult[]>([]);
  const credentials = getCredentials();

  console.log('');
  console.log(`🚀 VersionRadar - Fetch Package Versions`);
  console.log(`📅 Date: ${new Date().toLocaleDateString(DATE_LOCALE)}`);
  console.log(`📁 Fichier recherché: ${FILE_PATH}`);
  console.log(`🔢 Nombre de repositories: ${REPOSITORIES.length}`);
  console.log(`📦 Packages recherchés: ${PACKAGE_NAMES.join(', ')}`);
  console.log('');

  function processNextRepository(index: number): void {
    const totalRepos = REPOSITORIES.length;

    if (index >= totalRepos) {
      // Fin du traitement
      displaySummaryTable(results());

      // Statistiques finales
      const successCount = results().filter(r => r.status === 'success').length;
      const errorCount = results().filter(r => r.status === 'error').length;

      console.log('');
      console.log(`${summary.icon} ${summary.label}: ${successCount} ${summary.success}, ${errorCount} ${summary.errors} ${summary.on} ${totalRepos} ${summary.repositories}`);
      console.log('');
      return;
    }

    const repo = REPOSITORIES[index];

    console.log(`\n${status.fetching} [${index + 1}/${totalRepos}] ${repo.name} [${repo.platform.toUpperCase()}]...`);

    fetchPackageJson(repo, credentials, (data, error) => {
      if (error) {
        console.log(`\n${status.error} Erreur pour ${repo.name}: ${error}`);

        const emptyVersions: PackageVersions = {};
        for (const packageName of PACKAGE_NAMES) {
          emptyVersions[packageName] = null;
        }

        results.update(prev => [...prev, {
          name: repo.name,
          platform: repo.platform,
          project: repo.project,
          repo: repo.repo,
          status: 'error',
          error: error,
          packageVersions: emptyVersions
        }]);
      } else if (data) {
        try {
          const info = extractPackageVersions(data);
          displayRepoResults(repo, info, index);

          results.update(prev => [...prev, {
            name: repo.name,
            platform: repo.platform,
            project: repo.project,
            repo: repo.repo,
            status: 'success',
            packageVersions: info.packageVersions,
            packageName: info.packageName,
            packageVersion: info.packageVersion,
            allDependencies: info.allDependencies
          }]);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`\n${status.error} Erreur pour ${repo.name}: ${errorMessage}`);

          // Debug: afficher les premières lignes du contenu reçu
          if (data.length > 0) {
            console.log(`   📝 Debug: Premières lignes du contenu reçu:`);
            console.log(`   ${data.substring(0, 200)}...`);
          }

          const emptyVersions: PackageVersions = {};
          for (const packageName of PACKAGE_NAMES) {
            emptyVersions[packageName] = null;
          }

          results.update(prev => [...prev, {
            name: repo.name,
            platform: repo.platform,
            project: repo.project,
            repo: repo.repo,
            status: 'error',
            error: errorMessage,
            packageVersions: emptyVersions
          }]);
        }
      }

      // Passer au repository suivant
      processNextRepository(index + 1);
    });
  }

  // Démarrer le traitement
  processNextRepository(0);
}

main();

