import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { PackagesRadarComponent } from './packages-radar.component';
import { VersionDisplayService } from '../../services/version-display.service';
import { RepositoryResult } from '../../services/version-monitoring.service';

// ── Factories ─────────────────────────────────────────────────────────────────

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

// ── Setup helper ──────────────────────────────────────────────────────────────

async function setup(repositories: RepositoryResult[] = []) {
  await TestBed.configureTestingModule({
    imports: [PackagesRadarComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTranslateService({ fallbackLang: 'fr' }),
      ...provideTranslateHttpLoader({ prefix: './assets/i18n/', suffix: '.json' }),
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(PackagesRadarComponent);
  const component = fixture.componentInstance;
  component.repositories = repositories;
  fixture.detectChanges();
  return { fixture, component };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PackagesRadarComponent', () => {

  // ── Creation ─────────────────────────────────────────────────────────────────
  describe('component creation', () => {
    it('should be created', async () => {
      const { component } = await setup();
      expect(component).toBeTruthy();
    });

    it('should inject VersionDisplayService', async () => {
      const { component } = await setup();
      expect(component.display).toBeInstanceOf(VersionDisplayService);
    });

    it('should have empty repositories by default', async () => {
      const { component } = await setup();
      expect(component.repositories).toEqual([]);
    });
  });

  // ── @Input repositories ───────────────────────────────────────────────────────
  describe('@Input repositories', () => {
    it('should accept a list of repositories', async () => {
      const repos = [makeRepo({ name: 'app-a' }), makeRepo({ name: 'app-b' })];
      const { component } = await setup(repos);
      expect(component.repositories).toHaveLength(2);
    });

    it('should render one table row per repository', async () => {
      const repos = [makeRepo({ name: 'app-a' }), makeRepo({ name: 'app-b' }), makeRepo({ name: 'app-c' })];
      const { fixture } = await setup(repos);
      const rows = fixture.debugElement.queryAll(By.css('tbody tr'));
      expect(rows).toHaveLength(3);
    });

    it('should render no rows when repositories is empty', async () => {
      const { fixture } = await setup([]);
      const rows = fixture.debugElement.queryAll(By.css('tbody tr'));
      expect(rows).toHaveLength(0);
    });
  });

  // ── Table headers (dynamic columns) ──────────────────────────────────────────
  describe('dynamic column headers', () => {
    it('should render one th per package key from the first repository', async () => {
      const repos = [makeRepo({ packageVersions: { '@oblique/oblique': '^11.0.0', '@angular/cdk': '^17.0.0', '@angular/core': '^17.0.0' } })];
      const { fixture } = await setup(repos);
      // thead has: Repository | Platform | ...packageKeys | Status
      const headers = fixture.debugElement.queryAll(By.css('thead th'));
      // 3 package columns + 3 fixed (Repository | Platform | Status) = 6
      expect(headers).toHaveLength(6);
    });

    it('should display the package name in each column header', async () => {
      const repos = [makeRepo({ packageVersions: { '@oblique/oblique': '^11.0.0', '@angular/cdk': '^17.0.0' } })];
      const { fixture } = await setup(repos);
      const headerTexts = fixture.debugElement
        .queryAll(By.css('thead th'))
        .map(el => el.nativeElement.textContent.trim());
      expect(headerTexts).toContain('@oblique/oblique');
      expect(headerTexts).toContain('@angular/cdk');
    });

    it('should not render package headers when repositories is empty', async () => {
      const { fixture } = await setup([]);
      const headers = fixture.debugElement.queryAll(By.css('thead th'));
      // Only Repository | Platform | Status = 3 fixed headers
      expect(headers).toHaveLength(3);
    });
  });

  // ── Version badges ────────────────────────────────────────────────────────────
  describe('version badges', () => {
    it('should render a link for each package version', async () => {
      const { fixture } = await setup([makeRepo()]);
      const links = fixture.debugElement.queryAll(By.css('a.version-badge'));
      expect(links).toHaveLength(2);
    });

    it('should build correct npmjs URL for package versions', async () => {
      const { fixture } = await setup([
        makeRepo({ packageVersions: { '@oblique/oblique': '^11.2.3' } }),
      ]);
      const link: HTMLAnchorElement = fixture.debugElement.query(By.css('a.version-badge')).nativeElement;
      expect(link.href).toBe('https://www.npmjs.com/package/@oblique/oblique/v/11.2.3');
    });

    it('should open version links in a new tab', async () => {
      const { fixture } = await setup([makeRepo()]);
      const links = fixture.debugElement.queryAll(By.css('a.version-badge'));
      links.forEach(link => {
        expect(link.nativeElement.getAttribute('target')).toBe('_blank');
      });
    });

    it('should show a dash when a package version is missing', async () => {
      const { fixture } = await setup([
        makeRepo({ packageVersions: { '@oblique/oblique': null as any } }),
      ]);
      const noDash = fixture.debugElement.query(By.css('.no-version'));
      expect(noDash).not.toBeNull();
      expect(noDash.nativeElement.textContent.trim()).toBe('-');
    });
  });

  // ── Status row CSS classes ────────────────────────────────────────────────────
  describe('status row classes', () => {
    it('should apply status-success class on successful repos', async () => {
      const { fixture } = await setup([makeRepo({ status: 'success' })]);
      const row = fixture.debugElement.query(By.css('tbody tr'));
      expect(row.nativeElement.classList).toContain('status-success');
    });

    it('should apply status-error class on failed repos', async () => {
      const { fixture } = await setup([makeRepo({ status: 'error' })]);
      const row = fixture.debugElement.query(By.css('tbody tr'));
      expect(row.nativeElement.classList).toContain('status-error');
    });
  });

  // ── Platform badges ───────────────────────────────────────────────────────────
  describe('platform badges', () => {
    it('should apply "azure" CSS class for azure platform', async () => {
      const { fixture } = await setup([makeRepo({ platform: 'azure' })]);
      const badge = fixture.debugElement.query(By.css('.platform-badge'));
      expect(badge.nativeElement.classList).toContain('azure');
    });

    it('should apply "bitbucket" CSS class for bitbucket platform', async () => {
      const { fixture } = await setup([makeRepo({ platform: 'bitbucket' })]);
      const badge = fixture.debugElement.query(By.css('.platform-badge'));
      expect(badge.nativeElement.classList).toContain('bitbucket');
    });

    it('should display azure platform icon via VersionDisplayService', async () => {
      const { component } = await setup();
      expect(component.display.getPlatformIcon('azure')).toBe('☁️');
    });

    it('should display bitbucket platform icon via VersionDisplayService', async () => {
      const { component } = await setup();
      expect(component.display.getPlatformIcon('bitbucket')).toBe('🔷');
    });
  });

  // ── Status badges ─────────────────────────────────────────────────────────────
  describe('status badges', () => {
    it('should show a success badge for successful repos', async () => {
      const { fixture } = await setup([makeRepo({ status: 'success' })]);
      const badge = fixture.debugElement.query(By.css('.status-badge.success'));
      expect(badge).not.toBeNull();
    });

    it('should show an error badge for failed repos', async () => {
      const { fixture } = await setup([makeRepo({ status: 'error', error: 'HTTP 401' })]);
      const badge = fixture.debugElement.query(By.css('.status-badge.error'));
      expect(badge).not.toBeNull();
    });

    it('should display the error message in the error badge title', async () => {
      const { fixture } = await setup([makeRepo({ status: 'error', error: 'HTTP 401' })]);
      const badge = fixture.debugElement.query(By.css('.status-badge.error'));
      expect(badge.nativeElement.getAttribute('title')).toBe('HTTP 401');
    });
  });

  // ── VersionDisplayService delegation ─────────────────────────────────────────
  describe('VersionDisplayService delegation', () => {
    it('getPackageNames should return keys from packageVersions', async () => {
      const { component } = await setup();
      const repo = makeRepo({ packageVersions: { 'pkg-a': '1.0.0', 'pkg-b': '2.0.0' } });
      expect(component.display.getPackageNames(repo)).toEqual(['pkg-a', 'pkg-b']);
    });

    it('getPackageUrl strips ^ prefix', async () => {
      const { component } = await setup();
      const url = component.display.getPackageUrl('@oblique/oblique', '^11.0.0');
      expect(url).toBe('https://www.npmjs.com/package/@oblique/oblique/v/11.0.0');
    });

    it('getPackageUrl strips ~ prefix', async () => {
      const { component } = await setup();
      const url = component.display.getPackageUrl('@angular/cdk', '~17.3.0');
      expect(url).toBe('https://www.npmjs.com/package/@angular/cdk/v/17.3.0');
    });

    it('getStatusClass returns status-success for success', async () => {
      const { component } = await setup();
      expect(component.display.getStatusClass(makeRepo({ status: 'success' }))).toBe('status-success');
    });

    it('getStatusClass returns status-error for error', async () => {
      const { component } = await setup();
      expect(component.display.getStatusClass(makeRepo({ status: 'error' }))).toBe('status-error');
    });
  });
});

