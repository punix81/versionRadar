import { TestBed } from '@angular/core/testing';
import { VersionDisplayService } from './version-display.service';
import { RepositoryResult, PipelineResult } from './version-monitoring.service';

function makeRepo(overrides: Partial<RepositoryResult> = {}): RepositoryResult {
  return {
    name: 'my-app',
    platform: 'azure',
    project: 'MY_PROJECT',
    repo: 'my-repo',
    status: 'success',
    packageVersions: {
      '@oblique/oblique': '^11.0.0',
      '@angular/cdk': '^17.0.0',
    },
    ...overrides,
  };
}

function makePipeline(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    name: 'my-pipeline',
    project: 'MY_PROJECT',
    repo: 'my-repo',
    status: 'success',
    pipelineVersions: {
      'commons-pipeline': '1.2.3',
      'angular-pipeline': '4.5.6',
    },
    ...overrides,
  };
}

function setup() {
  TestBed.configureTestingModule({});
  return TestBed.inject(VersionDisplayService);
}

describe('VersionDisplayService', () => {
  describe('injection', () => {
    it('should be created', () => {
      const service = setup();
      expect(service).toBeTruthy();
    });

    it('should be injectable as providedIn root', () => {
      const service = setup();
      expect(service).toBeInstanceOf(VersionDisplayService);
    });
  });

  describe('getPackageNames()', () => {
    it('should return all keys of packageVersions', () => {
      const service = setup();
      const repo = makeRepo({ packageVersions: { 'pkg-a': '1.0.0', 'pkg-b': '2.0.0' } });
      expect(service.getPackageNames(repo)).toEqual(['pkg-a', 'pkg-b']);
    });

    it('should return an empty array when packageVersions is empty', () => {
      const service = setup();
      const repo = makeRepo({ packageVersions: {} });
      expect(service.getPackageNames(repo)).toEqual([]);
    });

    it('should include keys with null values', () => {
      const service = setup();
      const repo = makeRepo({ packageVersions: { 'pkg-a': null as any, 'pkg-b': '1.0.0' } });
      expect(service.getPackageNames(repo)).toContain('pkg-a');
    });

    it('should preserve the insertion order of keys', () => {
      const service = setup();
      const repo = makeRepo({ packageVersions: { 'z-pkg': '1.0.0', 'a-pkg': '2.0.0', 'm-pkg': '3.0.0' } });
      expect(service.getPackageNames(repo)).toEqual(['z-pkg', 'a-pkg', 'm-pkg']);
    });
  });

  describe('getPipelineNames()', () => {
    it('should return all keys of pipelineVersions', () => {
      const service = setup();
      const pipeline = makePipeline({ pipelineVersions: { 'p1': '1.0.0', 'p2': '2.0.0' } });
      expect(service.getPipelineNames(pipeline)).toEqual(['p1', 'p2']);
    });

    it('should return an empty array when pipelineVersions is empty', () => {
      const service = setup();
      const pipeline = makePipeline({ pipelineVersions: {} });
      expect(service.getPipelineNames(pipeline)).toEqual([]);
    });

    it('should include keys with null values', () => {
      const service = setup();
      const pipeline = makePipeline({ pipelineVersions: { 'commons-pipeline': null as any } });
      expect(service.getPipelineNames(pipeline)).toContain('commons-pipeline');
    });
  });

  describe('getPackageUrl()', () => {
    it('should build a valid npmjs URL', () => {
      const service = setup();
      expect(service.getPackageUrl('@angular/cdk', '17.0.0')).toBe(
        'https://www.npmjs.com/package/@angular/cdk/v/17.0.0',
      );
    });

    it('should strip the ^ caret prefix from version', () => {
      const service = setup();
      expect(service.getPackageUrl('@oblique/oblique', '^11.2.3')).toBe(
        'https://www.npmjs.com/package/@oblique/oblique/v/11.2.3',
      );
    });

    it('should strip the ~ tilde prefix from version', () => {
      const service = setup();
      expect(service.getPackageUrl('@angular/cdk', '~17.3.0')).toBe(
        'https://www.npmjs.com/package/@angular/cdk/v/17.3.0',
      );
    });

    it('should not modify a version without prefix', () => {
      const service = setup();
      expect(service.getPackageUrl('rxjs', '7.8.0')).toBe(
        'https://www.npmjs.com/package/rxjs/v/7.8.0',
      );
    });

    it('should handle scoped package names with @', () => {
      const service = setup();
      const url = service.getPackageUrl('@ngx-translate/core', '^15.0.0');
      expect(url).toContain('@ngx-translate/core');
      expect(url).toContain('15.0.0');
    });
  });

  describe('getPipelineUrl()', () => {
    it('should build the Chart.yaml URL from project and repo', () => {
      const service = setup();
      const pipeline = makePipeline({ project: 'FEDPOLPWA', repo: 'fedpol-pwa-app-gitops' });
      expect(service.getPipelineUrl(pipeline)).toBe(
        'https://bitbucket.bit.admin.ch/projects/FEDPOLPWA/repos/fedpol-pwa-app-gitops/browse/pipeline/Chart.yaml',
      );
    });

    it('should use the base URL https://bitbucket.bit.admin.ch', () => {
      const service = setup();
      const url = service.getPipelineUrl(makePipeline());
      expect(url.startsWith('https://bitbucket.bit.admin.ch')).toBe(true);
    });

    it('should always end with /browse/pipeline/Chart.yaml', () => {
      const service = setup();
      const url = service.getPipelineUrl(makePipeline({ project: 'PROJ', repo: 'repo' }));
      expect(url.endsWith('/browse/pipeline/Chart.yaml')).toBe(true);
    });

    it('should embed the project in the URL path', () => {
      const service = setup();
      const url = service.getPipelineUrl(makePipeline({ project: 'MYPROJ', repo: 'any-repo' }));
      expect(url).toContain('/projects/MYPROJ/');
    });

    it('should embed the repo in the URL path', () => {
      const service = setup();
      const url = service.getPipelineUrl(makePipeline({ project: 'ANY', repo: 'specific-repo' }));
      expect(url).toContain('/repos/specific-repo/');
    });
  });

  describe('getStatusClass()', () => {
    it('should return "status-success" for status success', () => {
      const service = setup();
      expect(service.getStatusClass(makeRepo({ status: 'success' }))).toBe('status-success');
    });

    it('should return "status-error" for status error', () => {
      const service = setup();
      expect(service.getStatusClass(makeRepo({ status: 'error' }))).toBe('status-error');
    });
  });

  describe('getPlatformIcon()', () => {
    it('should return ☁️ for azure platform', () => {
      const service = setup();
      expect(service.getPlatformIcon('azure')).toBe('☁️');
    });

    it('should return 🔷 for bitbucket platform', () => {
      const service = setup();
      expect(service.getPlatformIcon('bitbucket')).toBe('🔷');
    });

    it('should return 🔷 for any unknown platform', () => {
      const service = setup();
      expect(service.getPlatformIcon('github')).toBe('🔷');
    });

    it('should return 🔷 for empty string platform', () => {
      const service = setup();
      expect(service.getPlatformIcon('')).toBe('🔷');
    });
  });
});

