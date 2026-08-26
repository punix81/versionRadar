import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { WelcomeComponent } from './components/welcome/welcome.component';
import { ConfigurationComponent } from './components/configuration/configuration.component';
import { firstRunRedirectGuard } from './guards/first-run.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: WelcomeComponent, canActivate: [firstRunRedirectGuard] },
  { path: 'welcome', component: WelcomeComponent },
  { path: 'configuration', component: ConfigurationComponent },
  { path: 'dashboard', component: DashboardComponent }
];
