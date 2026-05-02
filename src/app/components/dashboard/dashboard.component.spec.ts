import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { DashboardComponent } from './dashboard.component';
import { VersionMonitoringService, RepositoryResult, PipelineResult, VersionData } from '../../services/version-monitoring.service';

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

function makeVersionData(
  repositories: RepositoryResult[] = [makeRepo()],
  pipelines: PipelineResult[] = [makePipeline()],
): VersionData {
  return {
    repositories,
    pipelines,
    timestamp: new Date('2026-05-01'),
    stats: {
      total: repositories.length,
      success: repositories.filter(r => r.status === 'success').length,
      errors: repositories.filter(r => r.status === 'error').length,
    },
    pipelineStats: {
      total: pipelines.length,
      success: pipelines.filter(r => r.status === 'success').length,
      errors: pipelines.filter(r => r.status === 'error').length,
    },
  };
}

function buildMockVersionService(initial: VersionData | null = null) {
  const dataSig = signal<VersionData | null>(initial);
  const loadingSig = signal<boolean>(false);
  const errorSig = signal<string | null>(null);

  return {
    data: dataSig.asReadonly(),
    loading: loadingSig.asReadonly(),
    error: errorSig.asReadonly(),
    loadVersionData: vi.fn(() => of(undefined as void)),
    _dataSig: dataSig,
    _loadingSig: loadingSig,
    _errorSig: errorSig,
  };
}

async function setup(mockService = buildMockVersionService()) {
  await TestBed.configureTestingModule({
    imports: [DashboardComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTranslateService({ fallbackLang: 'fr' }),
      ...provideTranslateHttpLoader({ prefix: './assets/i18n/', suffix: '.json' }),
      { provide: VersionMonitoringService, useValue: mockService },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(DashboardComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component, mockService };
}

describe('DashboardComponent', () => {

  describe('component creation', () => {
    it('should be created', async () => {
      const { component } = await setup();
      expect(component).toBeTruthy();
    });

    it('should call loadVersionData on init', async () => {
      const mockService = buildMockVersionService();
      await setup(mockService);
      expect(mockService.loadVersionData).toHaveBeenCalledOnce();
    });

    it('should default currentLang to "fr"', async () => {
      const { component } = await setup();
      expect(component.currentLang).toBe('fr');
    });
  });

  describe('loading state', () => {
    it('should expose loading signal from service', async () => {
      const mockService = buildMockVersionService();
      const { component } = await setup(mockService);
      expect(component.loading()).toBe(false);

      mockService._loadingSig.set(true);
      expect(component.loading()).toBe(true);
    });
  });


  describe('error state', () => {
    it('should expose error signal from service', async () => {
      const mockService = buildMockVersionService();
      const { component } = await setup(mockService);
      expect(component.error()).toBeNull();

      mockService._errorSig.set('Something went wrong');
      expect(component.error()).toBe('Something went wrong');
    });
  });

  describe('switchLang()', () => {
    it('should update currentLang', async () => {
      const { component } = await setup();
      component.switchLang('en');
      expect(component.currentLang).toBe('en');
    });

    it('should call translate.use() with the chosen lang', async () => {
      const { component } = await setup();
      const translate = TestBed.inject(TranslateService);
      vi.spyOn(translate, 'use');
      component.switchLang('en');
      expect(translate.use).toHaveBeenCalledWith('en');
    });
  });

  describe('refresh()', () => {
    it('should call loadVersionData again', async () => {
      const mockService = buildMockVersionService();
      const { component } = await setup(mockService);
      component.refresh();
      expect(mockService.loadVersionData).toHaveBeenCalledTimes(2);
    });
  });

  describe('charts when no data', () => {
    it('should have empty packageChartOptions initially', async () => {
      const { component } = await setup(buildMockVersionService(null));
      expect(component.packageChartOptions).toEqual([]);
    });

    it('should have empty pipelineChartOptions initially', async () => {
      const { component } = await setup(buildMockVersionService(null));
      expect(component.pipelineChartOptions).toEqual([]);
    });
  });

  describe('charts with data', () => {
    async function setupWithData() {
      const versionData = makeVersionData(
        [
          makeRepo({ name: 'app-a', packageVersions: { '@oblique/oblique': '^11.0.0', '@angular/cdk': '^17.0.0' } }),
          makeRepo({ name: 'app-b', packageVersions: { '@oblique/oblique': '^10.0.0', '@angular/cdk': '^17.0.0' } }),
        ],
        [
          makePipeline({ name: 'pipe-a', pipelineVersions: { 'commons-pipeline': '1.0.0', 'angular-pipeline': '2.0.0' } }),
          makePipeline({ name: 'pipe-b', pipelineVersions: { 'commons-pipeline': '1.0.0', 'angular-pipeline': '3.0.0' } }),
        ],
      );
      const mockService = buildMockVersionService(versionData);
      return setup(mockService);
    }

    it('should generate one packageChartOption per package key', async () => {
      const { component } = await setupWithData();
      expect(component.packageChartOptions).toHaveLength(2);
      expect(component.packageChartOptions.map(c => c.name)).toEqual(['@oblique/oblique', '@angular/cdk']);
    });

    it('should generate one pipelineChartOption per pipeline key', async () => {
      const { component } = await setupWithData();
      expect(component.pipelineChartOptions).toHaveLength(2);
      expect(component.pipelineChartOptions.map(c => c.name)).toEqual(['commons-pipeline', 'angular-pipeline']);
    });

    it('should populate statsChartOption series data', async () => {
      const { component } = await setupWithData();
      const series = (component.statsChartOption as any).series[0].data as { value: number; name: string }[];
      const success = series.find(d => d.name === 'Succès');
      const errors = series.find(d => d.name === 'Erreurs');
      expect(success?.value).toBe(2);
      expect(errors?.value).toBe(0);
    });

    it('should populate platformChartOption with azure/bitbucket counts', async () => {
      const mockService = buildMockVersionService(
        makeVersionData([
          makeRepo({ platform: 'azure' }),
          makeRepo({ platform: 'bitbucket' }),
        ]),
      );
      const { component } = await setup(mockService);
      const series = (component.platformChartOption as any).series[0].data as { value: number; name: string }[];
      expect(series.find(d => d.name === 'Azure DevOps')?.value).toBe(1);
      expect(series.find(d => d.name === 'Bitbucket')?.value).toBe(1);
    });

    it('package chart options should strip version prefixes (^ ~)', async () => {
      const mockService = buildMockVersionService(
        makeVersionData([
          makeRepo({ packageVersions: { '@oblique/oblique': '^11.0.0' } }),
        ]),
      );
      const { component } = await setup(mockService);
      const xData: string[] = (component.packageChartOptions[0].option as any).xAxis.data;
      expect(xData).toContain('11.0.0');
      expect(xData.some(v => v.startsWith('^') || v.startsWith('~'))).toBe(false);
    });

    it('pipeline chart options should group versions by count', async () => {
      const mockService = buildMockVersionService(
        makeVersionData(
          [],
          [
            makePipeline({ pipelineVersions: { 'commons-pipeline': '1.0.0' } }),
            makePipeline({ pipelineVersions: { 'commons-pipeline': '1.0.0' } }),
            makePipeline({ pipelineVersions: { 'commons-pipeline': '2.0.0' } }),
          ],
        ),
      );
      const { component } = await setup(mockService);
      const barData: { value: number }[] = (component.pipelineChartOptions[0].option as any).series[0].data;
      expect(barData[0].value).toBe(2);
      expect(barData[1].value).toBe(1);
    });
  });

  describe('reactive effect', () => {
    it('should update charts when data signal changes', async () => {
      const mockService = buildMockVersionService(null);
      const { component, fixture } = await setup(mockService);

      expect(component.packageChartOptions).toHaveLength(0);

      mockService._dataSig.set(makeVersionData());
      fixture.detectChanges();

      expect(component.packageChartOptions.length).toBeGreaterThan(0);
    });
  });
});

