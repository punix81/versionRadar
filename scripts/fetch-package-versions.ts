#!/usr/bin/env npx ts-node

/**
 * Récupère les versions de packages suivies (Oblique, Angular CDK, zone.js...)
 * depuis les fichiers package.json de plusieurs repos Azure DevOps et Bitbucket.
 *
 * Configuration:
 * - config/package-repositories.json : liste des repos à surveiller
 * - config/messages.json : messages et libellés
 * - ~/.config/opencode/versionRadar.env (ou VERSIONRADAR_ENV_FILE) : credentials
 *
 * USAGE:
 * ======
 * npm run fetch-packages
 *
 * Le parsing est partagé avec le serveur MCP (`scripts/lib/package-scan.ts`).
 */

import * as path from 'path';
import { loadScannerContext, PackageRepository, ScannerContext } from './lib/scanner-context';
import { PackageScanResult, scanPackageRepository } from './lib/package-scan';
import { writeJsonAtomic } from './lib/results';
import { buildScanRecord, recordScan } from './lib/scan-metadata';

interface DisplayMessages {
  display: { repoIcon: string; separator: string; separatorLength: number };
  status: { success: string; warning: string; notFound: string; error: string; fetching: string };
  summary: { icon: string; label: string; success: string; errors: string; on: string; repositories: string };
  table: {
    title: string;
    headers: { repository: string; status: string };
    statusOk: string;
    statusError: string;
  };
}

function displayRepoResults(
  context: ScannerContext,
  repo: PackageRepository,
  info: PackageScanResult,
  index: number
): void {
  const messages = context.messages as unknown as DisplayMessages;
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

  for (const packageName of context.packageConfig.packageNames) {
    const version = info.packageVersions[packageName];
    if (version) {
      console.log(`   ${status.success} ${packageName}: ${version}`);
    } else {
      console.log(`   ${status.warning}  ${packageName}: ${status.notFound}`);
    }
  }
}

function displaySummaryTable(context: ScannerContext, results: PackageScanResult[]): void {
  const messages = context.messages as unknown as DisplayMessages;
  const table = messages.table;
  const packageNames = context.packageConfig.packageNames;

  console.log('\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  const title = '📊 VERSIONS DES PACKAGES';
  const padding = Math.floor((78 - title.length) / 2);
  console.log('║' + ' '.repeat(padding) + title + ' '.repeat(78 - padding - title.length) + '║');
  console.log('╠' + '═'.repeat(78) + '╣');

  let headerLine = '║ Repository'.padEnd(23) + '│ ';
  for (const packageName of packageNames) {
    const shortName = packageName
      .replace('@oblique/oblique', '@oblique')
      .replace('@angular/cdk', '@ng/cdk');
    headerLine += shortName.padEnd(18) + '│ ';
  }
  headerLine += 'Status'.padEnd(14) + '║';
  console.log(headerLine);
  console.log('╠' + '─'.repeat(78) + '╣');

  for (const result of results) {
    const name = result.name.substring(0, 18).padEnd(21);
    let line = `║ ${name}│ `;

    for (const packageName of packageNames) {
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

async function main(): Promise<void> {
  let context: ScannerContext;
  try {
    context = loadScannerContext({ requireCredentials: true });
  } catch (error) {
    console.error(`❌ Erreur: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const startedAt = new Date().toISOString();
  const messages = context.messages as unknown as DisplayMessages;
  const status = messages.status;
  const summary = messages.summary;
  const repositories = context.packageConfig.repositories;

  console.log('');
  console.log(`🚀 VersionRadar - Fetch Package Versions`);
  console.log(`📅 Date: ${new Date().toLocaleDateString(context.dateLocale)}`);
  console.log(`📁 Fichier recherché: ${context.packageConfig.filePath}`);
  console.log(`🔢 Nombre de repositories: ${repositories.length}`);
  console.log(`📦 Packages recherchés: ${context.packageConfig.packageNames.join(', ')}`);
  console.log('');

  const results: PackageScanResult[] = [];

  for (const [index, repo] of repositories.entries()) {
    console.log(`\n${status.fetching} [${index + 1}/${repositories.length}] ${repo.name} [${repo.platform.toUpperCase()}]...`);

    const { result, rawPackageJson, warnings } = await scanPackageRepository(context, repo);
    for (const warning of warnings) {
      console.log(`   ⚠️  ${warning}`);
    }

    if (result.status === 'error') {
      console.log(`\n${status.error} Erreur pour ${repo.name}: ${result.error}`);
      if (rawPackageJson && rawPackageJson.length > 0) {
        console.log(`   📝 Debug: Premières lignes du contenu reçu:`);
        console.log(`   ${rawPackageJson.substring(0, 200)}...`);
      }
    } else {
      displayRepoResults(context, repo, result, index);
    }

    results.push(result);
  }

  displaySummaryTable(context, results);

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  console.log('');
  console.log(`${summary.icon} ${summary.label}: ${successCount} ${summary.success}, ${errorCount} ${summary.errors} ${summary.on} ${repositories.length} ${summary.repositories}`);
  console.log('');

  const outputPath = path.join(context.rootDir, 'src', 'assets', 'data', 'repositories.json');
  writeJsonAtomic(outputPath, results);

  const record = buildScanRecord({ startedAt, finishedAt: new Date().toISOString() }, results);
  recordScan(context.rootDir, 'repositories', record);
  console.log(`💾 Résultats sauvegardés: ${outputPath}`);
  console.log(`🗓️  Scan enregistré: ${record.status} (${record.succeeded}/${record.total})`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
