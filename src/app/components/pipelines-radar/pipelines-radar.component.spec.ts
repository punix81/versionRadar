import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { PipelinesRadarComponent, PipelineStats } from './pipelines-radar.component';
import { VersionDisplayService } from '../../services/version-display.service';
import { PipelineResult } from '../../services/version-monitoring.service';

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

function makeStats(overrides: Partial<PipelineStats> = {}): PipelineStats {
  return { total: 0, success: 0, errors: 0, ...overrides };
}

async function setup(
  pipelines: PipelineResult[] = [],
  pipelineStats: PipelineStats = makeStats(),
) {
  await TestBed.configureTestingModule({
    imports: [PipelinesRadarComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTranslateService({ fallbackLang: 'fr' }),
      ...provideTranslateHttpLoader({ prefix: './assets/i18n/', suffix: '.json' }),
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(PipelinesRadarComponent);
  const component = fixture.componentInstance;
  component.pipelines = pipelines;
  component.pipelineStats = pipelineStats;
  fixture.detectChanges();
  return { fixture, component };
}

describe('PipelinesRadarComponent', () => {

  describe('component creation', () => {
    it('should be created', async () => {
      const { component } = await setup();
      expect(component).toBeTruthy();
    });

    it('should inject VersionDisplayService', async () => {
      const { component } = await setup();
      expect(component.display).toBeInstanceOf(VersionDisplayService);
    });

    it('should have empty pipelines by default', async () => {
      const { component } = await setup();
      expect(component.pipelines).toEqual([]);
    });

    it('should have zero stats by default', async () => {
      const { component } = await setup();
      expect(component.pipelineStats).toEqual({ total: 0, success: 0, errors: 0 });
    });
  });

  describe('@Input pipelines', () => {
    it('should accept a list of pipelines', async () => {
      const pipes = [makePipeline({ name: 'p-a' }), makePipeline({ name: 'p-b' })];
      const { component } = await setup(pipes);
      expect(component.pipelines).toHaveLength(2);
    });

    it('should render one table row per pipeline', async () => {
      const pipes = [makePipeline({ name: 'p-a' }), makePipeline({ name: 'p-b' }), makePipeline({ name: 'p-c' })];
      const { fixture } = await setup(pipes);
      const rows = fixture.debugElement.queryAll(By.css('tbody tr'));
      expect(rows).toHaveLength(3);
    });

    it('should render no rows when pipelines is empty', async () => {
      const { fixture } = await setup([]);
      const rows = fixture.debugElement.queryAll(By.css('tbody tr'));
      expect(rows).toHaveLength(0);
    });
  });

  describe('@Input pipelineStats', () => {
    it('should display the total count', async () => {
      const { fixture } = await setup([], makeStats({ total: 5, success: 3, errors: 2 }));
      const statItems = fixture.debugElement.queryAll(By.css('.stat-item'));
      expect(statItems[0].nativeElement.textContent).toContain('5');
    });

    it('should display the success count', async () => {
      const { fixture } = await setup([], makeStats({ total: 5, success: 3, errors: 2 }));
      const statItems = fixture.debugElement.queryAll(By.css('.stat-item'));
      expect(statItems[1].nativeElement.textContent).toContain('3');
    });

    it('should display the errors count', async () => {
      const { fixture } = await setup([], makeStats({ total: 5, success: 3, errors: 2 }));
      const statItems = fixture.debugElement.queryAll(By.css('.stat-item'));
      expect(statItems[2].nativeElement.textContent).toContain('2');
    });

    it('should apply "success" class on the success stat item', async () => {
      const { fixture } = await setup([], makeStats());
      const statItems = fixture.debugElement.queryAll(By.css('.stat-item'));
      expect(statItems[1].nativeElement.classList).toContain('success');
    });

    it('should apply "error" class on the errors stat item', async () => {
      const { fixture } = await setup([], makeStats());
      const statItems = fixture.debugElement.queryAll(By.css('.stat-item'));
      expect(statItems[2].nativeElement.classList).toContain('error');
    });
  });

  describe('dynamic column headers', () => {
    it('should render one th per pipeline key from the first pipeline', async () => {
      const pipes = [makePipeline({ pipelineVersions: { 'p1': '1.0.0', 'p2': '2.0.0', 'p3': '3.0.0' } })];
      const { fixture } = await setup(pipes);
      const headers = fixture.debugElement.queryAll(By.css('thead th'));
      expect(headers).toHaveLength(6);
    });

    it('should display each pipeline key as a column header', async () => {
      const pipes = [makePipeline({ pipelineVersions: { 'commons-pipeline': '1.0.0', 'angular-pipeline': '2.0.0' } })];
      const { fixture } = await setup(pipes);
      const headerTexts = fixture.debugElement
        .queryAll(By.css('thead th'))
        .map(el => el.nativeElement.textContent.trim());
      expect(headerTexts).toContain('commons-pipeline');
      expect(headerTexts).toContain('angular-pipeline');
    });

    it('should render only fixed headers when pipelines is empty', async () => {
      const { fixture } = await setup([]);
      const headers = fixture.debugElement.queryAll(By.css('thead th'));
      expect(headers).toHaveLength(3);
    });
  });

  describe('version badges', () => {
    it('should render a link for each pipeline version', async () => {
      const { fixture } = await setup([makePipeline()]);
      const links = fixture.debugElement.queryAll(By.css('a.version-badge'));
      expect(links).toHaveLength(2);
    });

    it('should build the correct Bitbucket Chart.yaml URL', async () => {
      const { fixture } = await setup([
        makePipeline({ project: 'FEDPOLPWA', repo: 'fedpol-pwa-app-gitops' }),
      ]);
      const link: HTMLAnchorElement = fixture.debugElement.query(By.css('a.version-badge')).nativeElement;
      expect(link.href).toBe(
        'https://bitbucket.bit.admin.ch/projects/FEDPOLPWA/repos/fedpol-pwa-app-gitops/browse/pipeline/Chart.yaml',
      );
    });

    it('should open version links in a new tab', async () => {
      const { fixture } = await setup([makePipeline()]);
      fixture.debugElement.queryAll(By.css('a.version-badge')).forEach(link => {
        expect(link.nativeElement.getAttribute('target')).toBe('_blank');
      });
    });

    it('should show a dash when a pipeline version is missing', async () => {
      const { fixture } = await setup([
        makePipeline({ pipelineVersions: { 'commons-pipeline': null as any } }),
      ]);
      const dash = fixture.debugElement.query(By.css('td.version .no-version'));
      expect(dash).not.toBeNull();
      expect(dash.nativeElement.textContent.trim()).toBe('-');
    });

    it('should apply "pipeline-version" CSS class on version badges', async () => {
      const { fixture } = await setup([makePipeline()]);
      const badge = fixture.debugElement.query(By.css('.version-badge.pipeline-version'));
      expect(badge).not.toBeNull();
    });
  });

  describe('chart badge', () => {
    it('should display chartName and chartVersion when present', async () => {
      const { fixture } = await setup([
        makePipeline({ chartName: 'my-chart', chartVersion: '3.2.1' }),
      ]);
      const badge = fixture.debugElement.query(By.css('.chart-badge'));
      expect(badge).not.toBeNull();
      expect(badge.nativeElement.textContent).toContain('my-chart');
      expect(badge.nativeElement.textContent).toContain('3.2.1');
    });

    it('should show a dash when chartName is absent', async () => {
      const { fixture } = await setup([makePipeline({ chartName: undefined })]);
      const dash = fixture.debugElement.query(By.css('.chart-info .no-version'));
      expect(dash).not.toBeNull();
    });
  });


  describe('status row classes', () => {
    it('should apply status-success class on successful pipelines', async () => {
      const { fixture } = await setup([makePipeline({ status: 'success' })]);
      const row = fixture.debugElement.query(By.css('tbody tr'));
      expect(row.nativeElement.classList).toContain('status-success');
    });

    it('should apply status-error class on failed pipelines', async () => {
      const { fixture } = await setup([makePipeline({ status: 'error' })]);
      const row = fixture.debugElement.query(By.css('tbody tr'));
      expect(row.nativeElement.classList).toContain('status-error');
    });
  });

  describe('status badges', () => {
    it('should show a success badge for successful pipelines', async () => {
      const { fixture } = await setup([makePipeline({ status: 'success' })]);
      expect(fixture.debugElement.query(By.css('.status-badge.success'))).not.toBeNull();
    });

    it('should show an error badge for failed pipelines', async () => {
      const { fixture } = await setup([makePipeline({ status: 'error', error: 'Timeout' })]);
      expect(fixture.debugElement.query(By.css('.status-badge.error'))).not.toBeNull();
    });

    it('should display the error message in the badge title attribute', async () => {
      const { fixture } = await setup([makePipeline({ status: 'error', error: 'Timeout' })]);
      const badge = fixture.debugElement.query(By.css('.status-badge.error'));
      expect(badge.nativeElement.getAttribute('title')).toBe('Timeout');
    });
  });

  describe('project and repo display', () => {
    it('should display the pipeline name in bold', async () => {
      const { fixture } = await setup([makePipeline({ name: 'special-pipeline' })]);
      const strong = fixture.debugElement.query(By.css('.repo-info strong'));
      expect(strong.nativeElement.textContent.trim()).toBe('special-pipeline');
    });

    it('should display project/repo as subtitle', async () => {
      const { fixture } = await setup([makePipeline({ project: 'PROJ', repo: 'repo-x' })]);
      const small = fixture.debugElement.query(By.css('.repo-info small'));
      expect(small.nativeElement.textContent).toContain('PROJ');
      expect(small.nativeElement.textContent).toContain('repo-x');
    });
  });

  describe('VersionDisplayService delegation', () => {
    it('getPipelineNames returns keys from pipelineVersions', async () => {
      const { component } = await setup();
      const pipeline = makePipeline({ pipelineVersions: { 'p1': '1.0.0', 'p2': '2.0.0' } });
      expect(component.display.getPipelineNames(pipeline)).toEqual(['p1', 'p2']);
    });

    it('getPipelineUrl builds the correct Chart.yaml URL', async () => {
      const { component } = await setup();
      const pipeline = makePipeline({ project: 'MYPROJ', repo: 'my-repo' });
      expect(component.display.getPipelineUrl(pipeline)).toBe(
        'https://bitbucket.bit.admin.ch/projects/MYPROJ/repos/my-repo/browse/pipeline/Chart.yaml',
      );
    });

    it('getPipelineNames returns empty array for pipeline with no versions', async () => {
      const { component } = await setup();
      const pipeline = makePipeline({ pipelineVersions: {} });
      expect(component.display.getPipelineNames(pipeline)).toEqual([]);
    });
  });
});

