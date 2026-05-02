import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ConfigService,
  PipelineConfig,
  PipelineRepository,
  PackageConfig,
  PackageRepository,
} from '../../services/config.service';

type Tab = 'pipelines' | 'packages';

function emptyPipelineRepo(): PipelineRepository {
  return { project: '', repo: '', name: '', branch: '' };
}

function emptyPackageRepo(): PackageRepository {
  return { platform: 'bitbucket', project: '', repo: '', name: '', path: '', collection: '', branch: '' };
}

@Component({
  selector: 'app-config-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './config-admin.component.html',
  styleUrl: './config-admin.component.scss',
})
export class ConfigAdminComponent implements OnInit {
  private readonly configService = inject(ConfigService);

  isOpen = signal(false);
  activeTab = signal<Tab>('pipelines');

  // ── Pipeline state ─────────────────────────────────────────────────────────
  pipelineConfig = signal<PipelineConfig | null>(null);
  pipelineLoading = signal(false);
  pipelineSaving = signal(false);
  pipelineError = signal<string | null>(null);
  pipelineSuccess = signal(false);
  pipelineEditingIndex = signal<number | null>(null);
  pipelineAddingNew = signal(false);
  pipelineNewRepo = signal<PipelineRepository>(emptyPipelineRepo());
  newPipelineName = signal('');
  pipelineUrlInput = signal('');
  pipelineUrlParseError = signal<string | null>(null);
  pipelineUrlParsed = signal(false);

  // ── Package state ──────────────────────────────────────────────────────────
  packageConfig = signal<PackageConfig | null>(null);
  packageLoading = signal(false);
  packageSaving = signal(false);
  packageError = signal<string | null>(null);
  packageSuccess = signal(false);
  packageEditingIndex = signal<number | null>(null);
  packageAddingNew = signal(false);
  packageNewRepo = signal<PackageRepository>(emptyPackageRepo());
  newPackageName = signal('');
  packageUrlInput = signal('');
  packageUrlParseError = signal<string | null>(null);
  packageUrlParsed = signal(false);

  ngOnInit(): void {
    this.loadPipelineConfig();
    this.loadPackageConfig();
  }

  togglePanel(): void { this.isOpen.update(v => !v); }
  setTab(tab: Tab): void { this.activeTab.set(tab); }

  // ── Pipeline methods ────────────────────────────────────────────────────────

  loadPipelineConfig(): void {
    this.pipelineLoading.set(true);
    this.pipelineError.set(null);
    this.configService.getPipelineConfig().subscribe({
      next: cfg => { this.pipelineConfig.set(JSON.parse(JSON.stringify(cfg))); this.pipelineLoading.set(false); },
      error: err => { this.pipelineError.set('Erreur chargement : ' + String(err?.message ?? err)); this.pipelineLoading.set(false); },
    });
  }

  addPipelineName(): void {
    const name = this.newPipelineName().trim();
    if (!name) return;
    const cfg = this.pipelineConfig();
    if (!cfg) return;
    cfg.pipelineNames = [...cfg.pipelineNames, name];
    this.pipelineConfig.set({ ...cfg });
    this.newPipelineName.set('');
  }

  removePipelineName(index: number): void {
    const cfg = this.pipelineConfig();
    if (!cfg) return;
    cfg.pipelineNames = cfg.pipelineNames.filter((_, i) => i !== index);
    this.pipelineConfig.set({ ...cfg });
  }

  startEditPipeline(index: number): void { this.pipelineEditingIndex.set(index); this.pipelineAddingNew.set(false); }

  cancelEditPipeline(): void {
    this.pipelineEditingIndex.set(null);
    this.pipelineAddingNew.set(false);
    this.pipelineNewRepo.set(emptyPipelineRepo());
    this.pipelineUrlInput.set('');
    this.pipelineUrlParsed.set(false);
    this.pipelineUrlParseError.set(null);
  }

  confirmEditPipeline(): void { this.pipelineEditingIndex.set(null); this.autoSavePipeline(); }

  deletePipelineRepo(index: number): void {
    const cfg = this.pipelineConfig();
    if (!cfg) return;
    cfg.repositories = cfg.repositories.filter((_, i) => i !== index);
    this.pipelineConfig.set({ ...cfg });
    this.autoSavePipeline();
  }

  startAddPipelineRepo(): void {
    this.pipelineNewRepo.set(emptyPipelineRepo());
    this.pipelineUrlInput.set('');
    this.pipelineUrlParseError.set(null);
    this.pipelineUrlParsed.set(false);
    this.pipelineAddingNew.set(true);
    this.pipelineEditingIndex.set(null);
  }

  parsePipelineUrl(): void {
    const raw = this.pipelineUrlInput().trim().replace(/\.git$/, '').replace(/\.$/, '').replace(/\/$/, '');
    this.pipelineUrlParseError.set(null);
    let project = ''; let repo = '';
    let m = raw.match(/ssh:\/\/[^/]+\/([^/]+)\/([^/\s]+)$/);
    if (m) { project = m[1]; repo = m[2]; }
    if (!project) { m = raw.match(/git@[^:]+:([^/]+)\/([^/\s]+)$/); if (m) { project = m[1]; repo = m[2]; } }
    if (!project) { m = raw.match(/\/projects\/([^/]+)\/repos\/([^/\s]+)/); if (m) { project = m[1]; repo = m[2]; } }
    if (!project) { m = raw.match(/^([^/\s]+)\/([^/\s]+)$/); if (m) { project = m[1]; repo = m[2]; } }
    if (!project || !repo) { this.pipelineUrlParseError.set('URL non reconnue. Formats supportés : SSH, HTTPS Bitbucket ou project/repo'); return; }
    this.pipelineNewRepo.set({ project, repo, name: repo, branch: '' });
    this.pipelineUrlParsed.set(true);
  }

  resetPipelineUrlParse(): void { this.pipelineUrlParsed.set(false); this.pipelineUrlParseError.set(null); }

  confirmAddPipelineRepo(): void {
    const cfg = this.pipelineConfig();
    if (!cfg) return;
    const repo = { ...this.pipelineNewRepo() };
    if (!repo.branch) delete repo.branch;
    cfg.repositories = [...cfg.repositories, repo];
    this.pipelineConfig.set({ ...cfg });
    this.pipelineAddingNew.set(false);
    this.pipelineNewRepo.set(emptyPipelineRepo());
    this.pipelineUrlInput.set('');
    this.pipelineUrlParsed.set(false);
    this.autoSavePipeline();
  }

  private autoSavePipeline(): void {
    const cfg = this.pipelineConfig();
    if (!cfg) return;
    this.pipelineSaving.set(true);
    this.pipelineSuccess.set(false);
    this.pipelineError.set(null);
    this.configService.savePipelineConfig(cfg).subscribe({
      next: () => { this.pipelineSaving.set(false); this.pipelineSuccess.set(true); setTimeout(() => this.pipelineSuccess.set(false), 2500); },
      error: err => { this.pipelineError.set('Erreur sauvegarde : ' + String(err?.message ?? err)); this.pipelineSaving.set(false); },
    });
  }

  // ── Package methods ────────────────────────────────────────────────────────

  loadPackageConfig(): void {
    this.packageLoading.set(true);
    this.packageError.set(null);
    this.configService.getPackageConfig().subscribe({
      next: cfg => { this.packageConfig.set(JSON.parse(JSON.stringify(cfg))); this.packageLoading.set(false); },
      error: err => { this.packageError.set('Erreur chargement : ' + String(err?.message ?? err)); this.packageLoading.set(false); },
    });
  }

  addPackageName(): void {
    const name = this.newPackageName().trim();
    if (!name) return;
    const cfg = this.packageConfig();
    if (!cfg) return;
    cfg.packageNames = [...cfg.packageNames, name];
    this.packageConfig.set({ ...cfg });
    this.newPackageName.set('');
  }

  removePackageName(index: number): void {
    const cfg = this.packageConfig();
    if (!cfg) return;
    cfg.packageNames = cfg.packageNames.filter((_, i) => i !== index);
    this.packageConfig.set({ ...cfg });
  }

  startEditPackage(index: number): void { this.packageEditingIndex.set(index); this.packageAddingNew.set(false); }

  cancelEditPackage(): void {
    this.packageEditingIndex.set(null);
    this.packageAddingNew.set(false);
    this.packageNewRepo.set(emptyPackageRepo());
    this.packageUrlInput.set('');
    this.packageUrlParsed.set(false);
    this.packageUrlParseError.set(null);
  }

  confirmEditPackage(): void { this.packageEditingIndex.set(null); this.autoSavePackage(); }

  deletePackageRepo(index: number): void {
    const cfg = this.packageConfig();
    if (!cfg) return;
    cfg.repositories = cfg.repositories.filter((_, i) => i !== index);
    this.packageConfig.set({ ...cfg });
    this.autoSavePackage();
  }

  startAddPackageRepo(): void {
    this.packageNewRepo.set(emptyPackageRepo());
    this.packageUrlInput.set('');
    this.packageUrlParseError.set(null);
    this.packageUrlParsed.set(false);
    this.packageAddingNew.set(true);
    this.packageEditingIndex.set(null);
  }

  parsePackageUrl(): void {
    const raw = this.packageUrlInput().trim();
    this.packageUrlParseError.set(null);
    let parsed: Partial<PackageRepository> | null = null;

    // Bitbucket HTTPS: /projects/{project}/repos/{repo}/browse/{path}
    let m = raw.match(/\/projects\/([^/]+)\/repos\/([^/]+)\/browse\/(.+?)(?:\?.*)?$/);
    if (m) {
      parsed = { platform: 'bitbucket', project: m[1], repo: m[2], name: m[2], path: m[3], collection: '' };
    }

    // Azure DevOps — with project: /{collection}/{project}/_git/{repo}?path=...
    if (!parsed) {
      m = raw.match(/\/([^/]+)\/([^/]+)\/_git\/([^?/]+)/);
      if (m) {
        const pathParam = this.extractPathParam(raw);
        parsed = { platform: 'azure', collection: m[1], project: m[2], repo: m[3], name: m[3], path: pathParam };
      }
    }

    // Azure DevOps — without project: /{collection}/_git/{repo}?path=...
    if (!parsed) {
      m = raw.match(/\/([^/]+)\/_git\/([^?/]+)/);
      if (m) {
        const pathParam = this.extractPathParam(raw);
        parsed = { platform: 'azure', collection: m[1], project: m[2], repo: m[2], name: m[2], path: pathParam };
      }
    }

    if (!parsed) {
      this.packageUrlParseError.set('URL non reconnue. Formats supportés : HTTPS Bitbucket ou Azure DevOps');
      return;
    }

    this.packageNewRepo.set({ ...emptyPackageRepo(), ...parsed });
    this.packageUrlParsed.set(true);
  }

  private extractPathParam(url: string): string {
    const match = url.match(/[?&]path=([^&]+)/);
    if (!match) return 'package.json';
    const raw = decodeURIComponent(match[1]);
    return raw.startsWith('/') ? raw.slice(1) : raw;
  }

  resetPackageUrlParse(): void { this.packageUrlParsed.set(false); this.packageUrlParseError.set(null); }

  confirmAddPackageRepo(): void {
    const cfg = this.packageConfig();
    if (!cfg) return;
    const repo = { ...this.packageNewRepo() };
    if (!repo.branch) delete repo.branch;
    if (!repo.collection) delete repo.collection;
    cfg.repositories = [...cfg.repositories, repo];
    this.packageConfig.set({ ...cfg });
    this.packageAddingNew.set(false);
    this.packageNewRepo.set(emptyPackageRepo());
    this.packageUrlInput.set('');
    this.packageUrlParsed.set(false);
    this.autoSavePackage();
  }

  private autoSavePackage(): void {
    const cfg = this.packageConfig();
    if (!cfg) return;
    this.packageSaving.set(true);
    this.packageSuccess.set(false);
    this.packageError.set(null);
    this.configService.savePackageConfig(cfg).subscribe({
      next: () => { this.packageSaving.set(false); this.packageSuccess.set(true); setTimeout(() => this.packageSuccess.set(false), 2500); },
      error: err => { this.packageError.set('Erreur sauvegarde : ' + String(err?.message ?? err)); this.packageSaving.set(false); },
    });
  }

  updatePipelineFilePath(value: string): void {
    const cfg = this.pipelineConfig();
    if (cfg) this.pipelineConfig.set({ ...cfg, filePath: value });
  }

  updatePackageFilePath(value: string): void {
    const cfg = this.packageConfig();
    if (cfg) this.packageConfig.set({ ...cfg, filePath: value });
  }
}

