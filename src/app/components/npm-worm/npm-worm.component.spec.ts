import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTranslateService } from '@ngx-translate/core';
import { NpmWormComponent } from './npm-worm.component';
import { RepositoryResult } from '../../services/version-monitoring.service';
import { ConfigService } from '../../services/config.service';

function makeRepo(overrides: Partial<RepositoryResult> = {}): RepositoryResult {
  return {
    name: 'my-app',
    platform: 'bitbucket',
    project: 'MY_PROJECT',
    repo: 'my-repo',
    status: 'success',
    packageVersions: {},
    allDependencies: {
      'safe-package': '^1.0.0',
      'bad-package': '^2.3.4'
    },
    ...overrides
  };
}

async function setup(repositories: RepositoryResult[] = [makeRepo()]): Promise<ComponentFixture<NpmWormComponent>> {
  await TestBed.configureTestingModule({
    imports: [NpmWormComponent],
    providers: [provideTranslateService({ fallbackLang: 'fr' })]
  }).compileComponents();

  const config = TestBed.inject(ConfigService);
  config.clearMaliciousPackagesCsv();

  const fixture = TestBed.createComponent(NpmWormComponent);
  fixture.componentInstance.repositories = repositories;
  fixture.detectChanges();
  return fixture;
}

describe('NpmWormComponent', () => {
  it('should create', async () => {
    const fixture = await setup();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should count contaminated lockfile packages by exact normalized version', async () => {
    const fixture = await setup([
      makeRepo({ lockDependencies: { 'bad-package': '^2.3.4' } })
    ]);
    fixture.componentInstance.config.loadMaliciousPackagesCsvContent('test.csv', 'package,version\nbad-package,2.3.4');
    fixture.detectChanges();

    expect(fixture.componentInstance.projectResults()[0].contaminatedPackageCount).toBe(1);
    expect(fixture.componentInstance.contaminatedPackageCount()).toBe(1);
  });

  it('should not match a different malicious version', async () => {
    const fixture = await setup([
      makeRepo({ lockDependencies: { 'bad-package': '^2.3.4' } })
    ]);
    fixture.componentInstance.config.loadMaliciousPackagesCsvContent('test.csv', 'package,version\nbad-package,2.3.5');
    fixture.detectChanges();

    expect(fixture.componentInstance.projectResults()[0].contaminatedPackageCount).toBe(0);
    expect(fixture.componentInstance.contaminatedPackageCount()).toBe(0);
  });

  it('should render the project summary table when repositories have lockfile data', async () => {
    const fixture = await setup([
      makeRepo({ lockDependencies: { 'bad-package': '^2.3.4', 'safe-package': '1.0.0' } })
    ]);
    fixture.componentInstance.config.loadMaliciousPackagesCsvContent('test.csv', 'package,version\nbad-package,2.3.4');
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('tbody tr'));
    expect(rows).toHaveLength(1);
    expect(rows[0].nativeElement.textContent).toContain('MY_PROJECT');
    expect(rows[0].nativeElement.textContent).toContain('npm_worm.not_secure');
  });

  it('should build one summary row per project', async () => {
    const fixture = await setup([
      makeRepo({ name: 'app-a', project: 'PROJECT_A', lockDependencies: { 'bad-package': '2.3.4', 'safe-package': '1.0.0' } }),
      makeRepo({ name: 'app-b', project: 'PROJECT_B', lockDependencies: { 'bad-package': '2.3.4' } }),
      makeRepo({ name: 'app-c', project: 'PROJECT_A', lockDependencies: { 'other-package': '3.0.0' } })
    ]);
    fixture.componentInstance.config.loadMaliciousPackagesCsvContent('test.csv', 'package,version\nbad-package,2.3.4');
    fixture.detectChanges();

    const results = fixture.componentInstance.projectResults();
    expect(results).toHaveLength(2);
    expect(results.find(result => result.project === 'PROJECT_A')).toEqual({
      project: 'PROJECT_A',
      lockPackageCount: 3,
      contaminatedPackageCount: 1,
      isSecure: false
    });
    expect(results.find(result => result.project === 'PROJECT_B')?.contaminatedPackageCount).toBe(1);
  });

  it('should render results in one project summary table', async () => {
    const fixture = await setup([
      makeRepo({ name: 'app-a', project: 'PROJECT_A', lockDependencies: { 'bad-package': '2.3.4' } }),
      makeRepo({ name: 'app-b', project: 'PROJECT_B', lockDependencies: { 'safe-package': '1.0.0' } })
    ]);
    fixture.componentInstance.config.loadMaliciousPackagesCsvContent('test.csv', 'package,version\nbad-package,2.3.4');
    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(By.css('.worm-table'))).toHaveLength(1);
    const firstHeader = fixture.debugElement.query(By.css('thead th')).nativeElement.textContent.trim();
    expect(firstHeader).toBe('table.project');
    const projectCells = fixture.debugElement.queryAll(By.css('.project-cell'));
    expect(projectCells.map(cell => cell.nativeElement.textContent.trim())).toEqual(['PROJECT_A', 'PROJECT_B']);
  });

  it('should match package-only CSV entries against any installed version', async () => {
    const fixture = await setup([
      makeRepo({ lockDependencies: { 'bad-package': '2.3.4' } })
    ]);
    fixture.componentInstance.config.loadMaliciousPackagesCsvContent('test.csv', 'package\nbad-package');
    fixture.detectChanges();

    expect(fixture.componentInstance.contaminatedPackageCount()).toBe(1);
  });

  it('should scan package-lock dependencies', async () => {
    const fixture = await setup([
      makeRepo({
        allDependencies: {},
        lockDependencies: {
          'transitive-bad-package': '9.9.9'
        }
      })
    ]);
    fixture.componentInstance.config.loadMaliciousPackagesCsvContent(
      'test.csv',
      'package;version\ntransitive-bad-package;9.9.9'
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.projectResults()[0].lockPackageCount).toBe(1);
    expect(fixture.componentInstance.projectResults()[0].contaminatedPackageCount).toBe(1);
  });

  it('should ignore package.json dependencies for contaminated counts', async () => {
    const fixture = await setup([
      makeRepo({
        allDependencies: { 'bad-package': '2.3.4' },
        lockDependencies: {}
      })
    ]);
    fixture.componentInstance.config.loadMaliciousPackagesCsvContent('test.csv', 'package,version\nbad-package,2.3.4');
    fixture.detectChanges();

    expect(fixture.componentInstance.projectResults()[0].lockPackageCount).toBe(0);
    expect(fixture.componentInstance.projectResults()[0].contaminatedPackageCount).toBe(0);
  });
});
