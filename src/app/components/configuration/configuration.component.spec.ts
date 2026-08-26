import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';

import { ConfigurationComponent } from './configuration.component';
import { ConfigService, PipelineConfig, PackageConfig } from '../../services/config.service';

function makePipelineConfig(count: number): PipelineConfig {
  const repositories = Array.from({ length: count }, () => ({ project: 'P', repo: 'R', name: 'N' }));
  return { filePath: 'pipeline/Chart.yaml', pipelineNames: [], repositories };
}

function makePackageConfig(count: number): PackageConfig {
  const repositories = Array.from({ length: count }, () => ({ platform: 'azure', project: 'P', repo: 'R', name: 'N', path: 'package.json' }));
  return { filePath: 'package.json', packageNames: [], repositories };
}

function buildMockConfigService(pipelineRepos = 0, packageRepos = 0) {
  return {
    savedVersion: signal(0).asReadonly(),
    maliciousPackages: signal([{ name: 'x', version: null }]).asReadonly(),
    maliciousCsvFileName: signal<string | null>(null).asReadonly(),
    maliciousCsvSkippedRows: signal(0).asReadonly(),
    maliciousCsvError: signal<string | null>(null).asReadonly(),
    getPipelineConfig: () => of(makePipelineConfig(pipelineRepos)),
    getPackageConfig: () => of(makePackageConfig(packageRepos)),
    getEnvConfig: () => of({}),
    savePipelineConfig: () => of({ success: true }),
    savePackageConfig: () => of({ success: true }),
    saveEnvConfig: () => of({ success: true }),
    loadMaliciousPackagesCsvFile: () => Promise.resolve(),
    clearMaliciousPackagesCsv: () => undefined,
  };
}

async function setup(mockConfig = buildMockConfigService()) {
  await TestBed.configureTestingModule({
    imports: [ConfigurationComponent],
    providers: [
      provideRouter([]),
      provideTranslateService({ fallbackLang: 'fr' }),
      { provide: ConfigService, useValue: mockConfig },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ConfigurationComponent);
  const component = fixture.componentInstance as ConfigurationComponent & { onSaved: () => void };
  fixture.detectChanges();
  const router = TestBed.inject(Router);
  return { fixture, component, router };
}

describe('ConfigurationComponent', () => {
  it('should be created', async () => {
    const { component } = await setup();
    expect(component).toBeTruthy();
  });

  it('should navigate to the dashboard after the first repository is saved', async () => {
    const { component, router } = await setup(buildMockConfigService(0, 0));
    const spy = vi.spyOn(router, 'navigate');
    component.onSaved();
    expect(spy).toHaveBeenCalledWith(['/dashboard']);
  });

  it('should not navigate to the dashboard when repositories were already configured', async () => {
    const { component, router } = await setup(buildMockConfigService(0, 1));
    const spy = vi.spyOn(router, 'navigate');
    component.onSaved();
    expect(spy).not.toHaveBeenCalled();
  });
});
