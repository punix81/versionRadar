import { describe, expect, it } from 'vitest';
import { extractPipelineVersions } from './pipeline-scan';

const PIPELINES = ['commons-pipeline', 'angular-pipeline'];

describe('extractPipelineVersions', () => {
  it('reads versions from chart dependencies', () => {
    const chart = [
      'name: alpha-chart',
      'version: 1.0.0',
      'appVersion: "3.2.1"',
      'dependencies:',
      '  - name: commons-pipeline',
      '    version: 2.2.0',
      '  - name: other-chart',
      '    version: 9.9.9',
    ].join('\n');

    const info = extractPipelineVersions(chart, PIPELINES);

    expect(info.chartName).toBe('alpha-chart');
    expect(info.chartVersion).toBe('1.0.0');
    expect(info.appVersion).toBe('3.2.1');
    expect(info.pipelineVersions).toEqual({ 'commons-pipeline': '2.2.0', 'angular-pipeline': null });
    expect(info.allDependencies).toHaveLength(2);
  });

  it('falls back to container images when a pipeline is not a dependency', () => {
    const chart = [
      'name: beta-chart',
      'containers:',
      '  - name: angular-pipeline-container',
      '    image: registry.example.invalid/pipelines/angular-pipeline:2.3.0',
    ].join('\n');

    const info = extractPipelineVersions(chart, PIPELINES);
    expect(info.pipelineVersions['angular-pipeline']).toBe('2.3.0');
  });

  it('throws on empty or malformed content', () => {
    expect(() => extractPipelineVersions('', PIPELINES)).toThrow();
    expect(() => extractPipelineVersions('dependencies: [', PIPELINES)).toThrow();
  });

  it('ignores unexpected structures instead of reporting a false success', () => {
    const info = extractPipelineVersions('name: x\nversion: 1\ndependencies: not-a-list\n', PIPELINES);
    expect(info.pipelineVersions).toEqual({ 'commons-pipeline': null, 'angular-pipeline': null });
    expect(info.allDependencies).toEqual([]);
  });
});
