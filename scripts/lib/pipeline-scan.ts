/**
 * Chart.yaml / values.yaml parsing and per-repository pipeline scanning.
 *
 * Reused by the CLI fetch script and the MCP server. Read-only.
 */

import * as yaml from 'js-yaml';
import { describeFetchError } from './fetch-error';
import { fetchRepositoryFile } from './remote';
import { PipelineRepository, ScannerContext } from './scanner-context';
import { resolveNodeVersion } from '../node-version';

export type PipelineVersions = Record<string, string | null>;

export interface ChartDependency {
  name: string;
  version?: string;
  repository?: string;
}

export interface ChartContainer {
  name?: string;
  image?: string;
}

export interface ChartYaml {
  apiVersion?: string;
  name?: string;
  description?: string;
  type?: string;
  version?: string;
  appVersion?: string;
  dependencies?: ChartDependency[];
  containers?: ChartContainer[];
}

export interface ChartInfo {
  chartName: string;
  chartVersion: string;
  appVersion: string;
  pipelineVersions: PipelineVersions;
  allDependencies: ChartDependency[];
}

export interface PipelineScanResult {
  name: string;
  project: string;
  repo: string;
  status: 'success' | 'error';
  pipelineVersions: PipelineVersions;
  chartName?: string;
  chartVersion?: string;
  nodeVersion?: string | null;
  allDependencies?: ChartDependency[];
  error?: string;
}

function emptyVersions(pipelineNames: string[]): PipelineVersions {
  return Object.fromEntries(pipelineNames.map(name => [name, null]));
}

export function extractPipelineVersions(yamlContent: string, pipelineNames: string[]): ChartInfo {
  const chart = yaml.load(yamlContent) as ChartYaml | null;

  if (!chart || typeof chart !== 'object') {
    throw new Error('Impossible de parser le fichier Chart.yaml');
  }

  const pipelineVersions: PipelineVersions = {};
  for (const pipelineName of pipelineNames) {
    pipelineVersions[pipelineName] = null;
  }

  if (Array.isArray(chart.dependencies)) {
    for (const dependency of chart.dependencies) {
      if (dependency && typeof dependency.name === 'string' && pipelineNames.includes(dependency.name)) {
        pipelineVersions[dependency.name] = dependency.version ?? null;
      }
    }
  }

  if (Array.isArray(chart.containers)) {
    for (const container of chart.containers) {
      for (const pipelineName of pipelineNames) {
        if (container?.name && container.name.includes(pipelineName)) {
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
    allDependencies: Array.isArray(chart.dependencies) ? chart.dependencies : [],
  };
}

/** Scans one pipeline repository: Chart.yaml (required) and values.yaml (optional). */
export async function scanPipelineRepository(
  context: ScannerContext,
  repo: PipelineRepository
): Promise<PipelineScanResult> {
  const { pipelineNames, filePath, valuesFilePath } = context.pipelineConfig;
  const base = { name: repo.name, project: repo.project, repo: repo.repo };

  const chartFile = await fetchRepositoryFile(
    context,
    { platform: 'bitbucket', project: repo.project, repo: repo.repo, name: repo.name, path: filePath, branch: repo.branch },
    filePath
  );

  if (!chartFile.ok) {
    return {
      ...base,
      status: 'error',
      error: describeFetchError(chartFile.error),
      pipelineVersions: emptyVersions(pipelineNames),
    };
  }

  let info: ChartInfo;
  try {
    info = extractPipelineVersions(chartFile.content, pipelineNames);
  } catch {
    return {
      ...base,
      status: 'error',
      error: 'Impossible de parser le fichier Chart.yaml',
      pipelineVersions: emptyVersions(pipelineNames),
    };
  }

  const valuesFile = await fetchRepositoryFile(
    context,
    { platform: 'bitbucket', project: repo.project, repo: repo.repo, name: repo.name, path: valuesFilePath || 'values.yaml', branch: repo.branch },
    valuesFilePath || 'values.yaml'
  );

  let nodeVersion: string | null = null;
  if (valuesFile.ok) {
    try {
      nodeVersion = resolveNodeVersion(yaml.load(valuesFile.content));
    } catch {
      nodeVersion = null;
    }
  }

  return {
    ...base,
    status: 'success',
    pipelineVersions: info.pipelineVersions,
    chartName: info.chartName,
    chartVersion: info.chartVersion,
    nodeVersion,
    allDependencies: info.allDependencies,
  };
}
