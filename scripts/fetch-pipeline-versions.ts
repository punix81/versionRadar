#!/usr/bin/env npx ts-node

/**
 * Récupère les versions des pipelines (Chart.yaml) et la version Node (values.yaml)
 * depuis plusieurs repos Bitbucket.
 *
 * Configuration:
 * - config/repositories.json : liste des repos et pipelines à surveiller
 * - config/messages.json : messages et libellés
 * - ~/.config/opencode/versionRadar.env (ou VERSIONRADAR_ENV_FILE) : credentials
 *
 * USAGE:
 * ======
 * npm run fetch-pipelines
 *
 * Le parsing est partagé avec le serveur MCP (`scripts/lib/pipeline-scan.ts`).
 */

import * as path from 'path';
import { loadScannerContext, PipelineRepository, ScannerContext } from './lib/scanner-context';
import { PipelineScanResult, scanPipelineRepository } from './lib/pipeline-scan';
import { writeJsonAtomic } from './lib/results';
import { buildScanRecord, recordScan } from './lib/scan-metadata';

interface DisplayMessages {
  app: { title: string; subtitle: string; dateLabel: string; fileLabel: string; repoCountLabel: string };
  display: { repoIcon: string; separator: string; separatorLength: number; chartLabel: string };
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
  repo: PipelineRepository,
  result: PipelineScanResult,
  index: number
): void {
  const messages = context.messages as unknown as DisplayMessages;
  const { display, status } = messages;
  const separator = display.separator.repeat(display.separatorLength);

  if (index > 0) console.log('');
  console.log(separator);
  console.log(`${display.repoIcon} ${repo.name} (${repo.project}/${repo.repo})`);
  console.log(separator);

  console.log(`   ${display.chartLabel}: ${result.chartName} v${result.chartVersion}`);
  if (result.nodeVersion) {
    console.log(`   ${status.success} Node: ${result.nodeVersion}`);
  }

  for (const pipelineName of context.pipelineConfig.pipelineNames) {
    const version = result.pipelineVersions[pipelineName];
    if (version) {
      console.log(`   ${status.success} ${pipelineName}: ${version}`);
    } else {
      console.log(`   ${status.warning}  ${pipelineName}: ${status.notFound}`);
    }
  }
}

function displaySummaryTable(context: ScannerContext, results: PipelineScanResult[]): void {
  const messages = context.messages as unknown as DisplayMessages;
  const { table } = messages;
  const pipelineNames = context.pipelineConfig.pipelineNames;

  console.log('');
  console.log('');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(25) + table.title + ' '.repeat(29) + '║');
  console.log('╠' + '═'.repeat(78) + '╣');

  let headerLine = '║ ' + table.headers.repository.padEnd(20) + '│ ';
  for (const pipelineName of pipelineNames) {
    headerLine += pipelineName.padEnd(18) + '│ ';
  }
  headerLine += table.headers.status.padEnd(14) + '║';
  console.log(headerLine);
  console.log('╠' + '─'.repeat(78) + '╣');

  results.forEach(result => {
    const name = result.name.substring(0, 18).padEnd(20);
    let line = `║ ${name}│ `;

    for (const pipelineName of pipelineNames) {
      const version = result.pipelineVersions[pipelineName] || '-';
      line += version.padEnd(18) + '│ ';
    }

    const statusText = result.status === 'success' ? table.statusOk : table.statusError;
    line += statusText.padEnd(14) + '║';
    console.log(line);
  });

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
  const { app, status, summary } = messages;
  const repositories = context.pipelineConfig.repositories;

  console.log('');
  console.log(`${app.title} ${app.subtitle}`);
  console.log(`${app.dateLabel}: ${new Date().toLocaleDateString(context.dateLocale)}`);
  console.log(`${app.fileLabel}: ${context.pipelineConfig.filePath}`);
  console.log(`${app.repoCountLabel}: ${repositories.length}`);
  console.log('');

  const results: PipelineScanResult[] = [];

  for (const [index, repo] of repositories.entries()) {
    console.log(`\n${status.fetching} [${index + 1}/${repositories.length}] ${repo.name}...`);

    const result = await scanPipelineRepository(context, repo);

    if (result.status === 'error') {
      console.log(`\n${status.error} Erreur pour ${repo.name}: ${result.error}`);
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

  const outputPath = path.join(context.rootDir, 'src', 'assets', 'data', 'pipelines.json');
  writeJsonAtomic(outputPath, results);

  const record = buildScanRecord({ startedAt, finishedAt: new Date().toISOString() }, results);
  recordScan(context.rootDir, 'pipelines', record);
  console.log(`💾 Résultats sauvegardés: ${outputPath}`);
  console.log(`🗓️  Scan enregistré: ${record.status} (${record.succeeded}/${record.total})`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
