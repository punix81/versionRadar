import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { WelcomeComponent } from './welcome.component';

async function setup() {
  await TestBed.configureTestingModule({
    imports: [WelcomeComponent],
    providers: [
      provideRouter([]),
      provideTranslateService({ fallbackLang: 'fr' }),
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(WelcomeComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component };
}

describe('WelcomeComponent', () => {
  it('should be created', async () => {
    const { component } = await setup();
    expect(component).toBeTruthy();
  });

  it('should render the VersionRadar logo', async () => {
    const { fixture } = await setup();
    const img = fixture.nativeElement.querySelector('img.welcome-logo');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toContain('versionradar_logo_with_text.png');
  });

  it('should render an "Add repository" button linking to the configuration page', async () => {
    const { fixture } = await setup();
    const link = fixture.nativeElement.querySelector('a[href*="configuration"]');
    expect(link).toBeTruthy();
    expect(link.classList.contains('mdc-button')).toBe(true);
  });
});
