import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { lastValueFrom } from 'rxjs';

import {
  VersionMonitoringService,
  RepositoryResult,
  PipelineResult,
  VersionData,
} from './version-monitoring.service';


function makeRepo(overrides: Partial<RepositoryResult> = {}): RepositoryResult {
  return {
    name: 'my-app',
    platform: 'azure',
    project: 'MY_PROJECT',
    repo: 'my-repo',
    status: 'success',
    packageVersions: { '@oblique/oblique': '^11.0.0' },
    ...overrides,
  };
}

function makePipeline(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    name: 'my-pipeline',
    project: 'MY_PROJECT',
    repo: 'my-repo',
    status: 'success',
    pipelineVersions: { 'commons-pipeline': '1.2.3' },
    ...overrides,
  };
}

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(VersionMonitoringService);
  const http = TestBed.inject(HttpTestingController);
  return { service, http };
}

function flushLoad(
  http: HttpTestingController,
  repos: RepositoryResult[],
  pipelines: PipelineResult[],
) {
  http.expectOne('assets/data/repositories.json').flush(repos);
  http.expectOne('assets/data/pipelines.json').flush(pipelines);
}

describe('VersionMonitoringService', () => {

  afterEach(() => TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true }));

  describe('injection', () => {
    it('should be created', () => {
      const { service } = setup();
      expect(service).toBeTruthy();
    });

    it('should be injectable as providedIn root', () => {
      const { service } = setup();
      expect(service).toBeInstanceOf(VersionMonitoringService);
    });
  });


  describe('initial signal state', () => {
    it('data() should be null initially', () => {
      const { service } = setup();
      expect(service.data()).toBeNull();
    });

    it('loading() should be false initially', () => {
      const { service } = setup();
      expect(service.loading()).toBe(false);
    });

    it('error() should be null initially', () => {
      const { service } = setup();
      expect(service.error()).toBeNull();
    });
  });

  describe('loadVersionData() – loading flag', () => {
    it('should set loading to true while fetching', () => {
      const { service, http } = setup();
      service.loadVersionData().subscribe();
      expect(service.loading()).toBe(true);
      flushLoad(http, [makeRepo()], [makePipeline()]);
    });

    it('should set loading to false after success', async () => {
      const { service, http } = setup();
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, [makeRepo()], [makePipeline()]);
      await done;
      expect(service.loading()).toBe(false);
    });

    it('should set loading to false after HTTP error', async () => {
      const { service, http } = setup();
      const done = lastValueFrom(service.loadVersionData());
      http.expectOne('assets/data/repositories.json').error(new ProgressEvent('error'));
      http.match('assets/data/pipelines.json');
      await done;
      expect(service.loading()).toBe(false);
    });
  });

  describe('loadVersionData() – success path', () => {
    it('should populate data() with repositories and pipelines', async () => {
      const { service, http } = setup();
      const repos = [makeRepo({ name: 'app-a' }), makeRepo({ name: 'app-b' })];
      const pipes = [makePipeline({ name: 'pipe-a' })];
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, repos, pipes);
      await done;

      const data = service.data();
      expect(data).not.toBeNull();
      expect(data!.repositories).toHaveLength(2);
      expect(data!.pipelines).toHaveLength(1);
    });

    it('should compute stats.total as the number of repositories', async () => {
      const { service, http } = setup();
      const repos = [makeRepo(), makeRepo({ name: 'app-b' }), makeRepo({ name: 'app-c' })];
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, repos, []);
      await done;
      expect(service.data()!.stats.total).toBe(3);
    });

    it('should compute stats.success correctly', async () => {
      const { service, http } = setup();
      const repos = [makeRepo({ status: 'success' }), makeRepo({ name: 'app-b', status: 'error' })];
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, repos, []);
      await done;
      expect(service.data()!.stats.success).toBe(1);
    });

    it('should compute stats.errors correctly', async () => {
      const { service, http } = setup();
      const repos = [makeRepo({ status: 'error' }), makeRepo({ name: 'app-b', status: 'error' })];
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, repos, []);
      await done;
      expect(service.data()!.stats.errors).toBe(2);
    });

    it('should compute pipelineStats.total correctly', async () => {
      const { service, http } = setup();
      const pipes = [makePipeline(), makePipeline({ name: 'p-b' })];
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, [], pipes);
      await done;
      expect(service.data()!.pipelineStats.total).toBe(2);
    });

    it('should compute pipelineStats.success correctly', async () => {
      const { service, http } = setup();
      const pipes = [makePipeline({ status: 'success' }), makePipeline({ name: 'p-b', status: 'error' })];
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, [], pipes);
      await done;
      expect(service.data()!.pipelineStats.success).toBe(1);
    });

    it('should compute pipelineStats.errors correctly', async () => {
      const { service, http } = setup();
      const pipes = [makePipeline({ status: 'error' }), makePipeline({ name: 'p-b', status: 'error' })];
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, [], pipes);
      await done;
      expect(service.data()!.pipelineStats.errors).toBe(2);
    });

    it('should set a timestamp on the data', async () => {
      const { service, http } = setup();
      const before = new Date();
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, [makeRepo()], []);
      await done;
      const after = new Date();
      const ts = service.data()!.timestamp;
      expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(ts.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should clear error() on successful load', async () => {
      const { service, http } = setup();
      // First trigger an error (forkJoin cancels sibling)
      const done1 = lastValueFrom(service.loadVersionData());
      http.expectOne('assets/data/repositories.json').error(new ProgressEvent('error'));
      http.match('assets/data/pipelines.json'); // absorb cancelled sibling
      await done1;
      expect(service.error()).not.toBeNull();

      // Then load successfully
      const done2 = lastValueFrom(service.loadVersionData());
      flushLoad(http, [makeRepo()], []);
      await done2;
      expect(service.error()).toBeNull();
    });
  });

  describe('loadVersionData() – empty data', () => {
    it('should set an error when both arrays are empty', async () => {
      const { service, http } = setup();
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, [], []);
      await done;
      expect(service.error()).not.toBeNull();
      expect(service.data()).toBeNull();
    });

    it('should still succeed when only repositories is empty', async () => {
      const { service, http } = setup();
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, [], [makePipeline()]);
      await done;
      expect(service.data()).not.toBeNull();
    });

    it('should still succeed when only pipelines is empty', async () => {
      const { service, http } = setup();
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, [makeRepo()], []);
      await done;
      expect(service.data()).not.toBeNull();
    });
  });

  describe('loadVersionData() – error path', () => {
    it('should set error() on HTTP failure', async () => {
      const { service, http } = setup();
      const done = lastValueFrom(service.loadVersionData());
      http.expectOne('assets/data/repositories.json').error(new ProgressEvent('network error'));
      http.match('assets/data/pipelines.json'); // absorb cancelled sibling
      await done;
      expect(service.error()).not.toBeNull();
    });

    it('should leave data() as null after HTTP failure', async () => {
      const { service, http } = setup();
      const done = lastValueFrom(service.loadVersionData());
      http.expectOne('assets/data/repositories.json').error(new ProgressEvent('network error'));
      http.match('assets/data/pipelines.json'); // absorb cancelled sibling
      await done;
      expect(service.data()).toBeNull();
    });
  });

  describe('getStatsByPlatform()', () => {
    it('should return zeroes when data is null', () => {
      const { service } = setup();
      expect(service.getStatsByPlatform()).toEqual({ azure: 0, bitbucket: 0 });
    });

    it('should count azure repos correctly', async () => {
      const { service, http } = setup();
      const repos = [makeRepo({ platform: 'azure' }), makeRepo({ name: 'app-b', platform: 'azure' })];
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, repos, []);
      await done;
      expect(service.getStatsByPlatform().azure).toBe(2);
    });

    it('should count bitbucket repos correctly', async () => {
      const { service, http } = setup();
      const repos = [makeRepo({ platform: 'bitbucket' }), makeRepo({ name: 'app-b', platform: 'azure' })];
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, repos, []);
      await done;
      expect(service.getStatsByPlatform().bitbucket).toBe(1);
    });

    it('should return zeroes for both when repos have neither platform', async () => {
      const { service, http } = setup();
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, [makeRepo({ platform: 'github' })], []);
      await done;
      expect(service.getStatsByPlatform()).toEqual({ azure: 0, bitbucket: 0 });
    });
  });

  describe('getVersionsForPackage()', () => {
    it('should return empty Map when data is null', () => {
      const { service } = setup();
      expect(service.getVersionsForPackage('@oblique/oblique').size).toBe(0);
    });

    it('should count occurrences of each version', async () => {
      const { service, http } = setup();
      const repos = [
        makeRepo({ packageVersions: { '@oblique/oblique': '^11.0.0' } }),
        makeRepo({ name: 'app-b', packageVersions: { '@oblique/oblique': '^11.0.0' } }),
        makeRepo({ name: 'app-c', packageVersions: { '@oblique/oblique': '^10.0.0' } }),
      ];
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, repos, []);
      await done;
      const map = service.getVersionsForPackage('@oblique/oblique');
      expect(map.get('11.0.0')).toBe(2);
      expect(map.get('10.0.0')).toBe(1);
    });

    it('should strip ^ and ~ prefixes from version keys', async () => {
      const { service, http } = setup();
      const repos = [
        makeRepo({ packageVersions: { 'rxjs': '^7.8.0' } }),
        makeRepo({ name: 'app-b', packageVersions: { 'rxjs': '~7.8.0' } }),
      ];
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, repos, []);
      await done;
      const map = service.getVersionsForPackage('rxjs');
      expect(map.has('^7.8.0')).toBe(false);
      expect(map.has('~7.8.0')).toBe(false);
      expect(map.get('7.8.0')).toBe(2);
    });

    it('should ignore repos where the package is absent', async () => {
      const { service, http } = setup();
      const repos = [
        makeRepo({ packageVersions: { '@oblique/oblique': '^11.0.0' } }),
        makeRepo({ name: 'app-b', packageVersions: {} }),
      ];
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, repos, []);
      await done;
      const map = service.getVersionsForPackage('@oblique/oblique');
      expect(map.size).toBe(1);
    });

    it('should ignore repos where the package version is null', async () => {
      const { service, http } = setup();
      const repos = [
        makeRepo({ packageVersions: { 'pkg': null as any } }),
      ];
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, repos, []);
      await done;
      expect(service.getVersionsForPackage('pkg').size).toBe(0);
    });

    it('should return empty Map for an unknown package name', async () => {
      const { service, http } = setup();
      const done = lastValueFrom(service.loadVersionData());
      flushLoad(http, [makeRepo()], []);
      await done;
      expect(service.getVersionsForPackage('unknown-pkg').size).toBe(0);
    });
  });
});

