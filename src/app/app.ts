import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule, MatMenuModule, MatSidenavModule, MatToolbarModule, MatTooltipModule, TranslateModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly document = inject(DOCUMENT);
  private readonly themeStorageKey = 'versionRadar.theme';
  protected readonly title = signal('versionRadar');
  protected readonly navigationOpen = signal(false);
  protected readonly darkTheme = signal(this.getStoredTheme() === 'dark');
  private readonly translate = inject(TranslateService);

  constructor() { this.applyTheme(this.darkTheme()); }

  protected switchLanguage(language: string): void { this.translate.use(language); }

  protected toggleNavigation(): void { this.navigationOpen.update(value => !value); }

  protected toggleTheme(): void {
    this.darkTheme.update(isDark => {
      const nextTheme = !isDark;
      this.applyTheme(nextTheme);
      return nextTheme;
    });
  }

  private getStoredTheme(): 'light' | 'dark' {
    return localStorage.getItem(this.themeStorageKey) === 'dark' ? 'dark' : 'light';
  }

  private applyTheme(isDark: boolean): void {
    const theme = isDark ? 'dark' : 'light';
    this.document.documentElement.dataset['theme'] = theme;
    localStorage.setItem(this.themeStorageKey, theme);
  }
}
