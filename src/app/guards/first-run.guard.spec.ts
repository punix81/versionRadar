import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { firstRunRedirectGuard } from './first-run.guard';
import { ConfigService } from '../services/config.service';

function buildMock(repos: number) {
  return {
    getPipelineConfig: () =>
      of({
        filePath: 'pipeline/Chart.yaml',
        pipelineNames: [],
        repositories: Array.from({ length: repos }, () => ({ project: 'P', repo: 'R', name: 'N' })),
      }),
    getPackageConfig: () => of({ filePath: 'package.json', packageNames: [], repositories: [] }),
  };
}

async function runGuard(mockConfig: ReturnType<typeof buildMock>): Promise<string> {
  await TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: ConfigService, useValue: mockConfig }],
  }).compileComponents();
  const url = await TestBed.runInInjectionContext(() => firstRunRedirectGuard().toPromise());
  return url!.toString();
}

describe('firstRunRedirectGuard', () => {
  it('redirects to /welcome when no repositories are configured', async () => {
    expect(await runGuard(buildMock(0))).toBe('/welcome');
  });

  it('redirects to /dashboard when repositories are configured', async () => {
    expect(await runGuard(buildMock(2))).toBe('/dashboard');
  });
});
