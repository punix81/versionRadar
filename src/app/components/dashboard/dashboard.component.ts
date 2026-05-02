import { Component, OnInit, effect, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { NgxEchartsModule } from 'ngx-echarts';
import { EChartsOption } from 'echarts';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { VersionMonitoringService, RepositoryResult, PipelineResult } from '../../services/version-monitoring.service';
import { PackagesRadarComponent } from '../packages-radar/packages-radar.component';
import { PipelinesRadarComponent } from '../pipelines-radar/pipelines-radar.component';
import { ConfigAdminComponent } from '../config-admin/config-admin.component';
import { ConfigService } from '../../services/config.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, NgxEchartsModule, TranslateModule, PackagesRadarComponent, PipelinesRadarComponent, ConfigAdminComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  data;
  loading;
  error;

  statsChartOption: EChartsOption = {};
  platformChartOption: EChartsOption = {};
  timelineChartOption: EChartsOption = {};
  packageChartOptions: { name: string; option: EChartsOption }[] = [];
  pipelineChartOptions: { name: string; option: EChartsOption }[] = [];

  currentLang = 'fr';

  private readonly destroyRef = inject(DestroyRef);
  private readonly versionService = inject(VersionMonitoringService);
  private readonly translate = inject(TranslateService);
  private readonly configService = inject(ConfigService);

  constructor() {
    this.data = this.versionService.data;
    this.loading = this.versionService.loading;
    this.error = this.versionService.error;

    effect(() => {
      const currentData = this.data();
      if (currentData) {
        this.updateCharts(currentData.repositories);
        this.updatePipelineCharts(currentData.pipelines);
      }
    });

    // Reload dashboard data whenever admin saves a config change
    effect(() => {
      if (this.configService.savedVersion() > 0) {
        this.loadData();
      }
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.versionService.loadVersionData()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  refresh(): void {
    this.loadData();
  }

  switchLang(lang: string): void {
    this.currentLang = lang;
    this.translate.use(lang);
  }

  private updateCharts(repositories: RepositoryResult[]): void {
    this.updateStatsChart(repositories);
    this.updatePackageCharts(repositories);
    this.updatePlatformChart(repositories);
    this.updateTimelineChart(repositories);
  }

  private updateStatsChart(repositories: RepositoryResult[]): void {
    const success = repositories.filter(r => r.status === 'success').length;
    const errors = repositories.filter(r => r.status === 'error').length;

    this.statsChartOption = {
      title: {
        text: 'État des Repositories',
        left: 'center',
        textStyle: {
          fontSize: 18,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'item',
        formatter: '{a} <br/>{b}: {c} ({d}%)'
      },
      legend: {
        bottom: 10,
        left: 'center'
      },
      series: [
        {
          name: 'Status',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: false,
            position: 'center'
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 20,
              fontWeight: 'bold'
            }
          },
          labelLine: {
            show: false
          },
          data: [
            {
              value: success,
              name: 'Succès',
              itemStyle: { color: '#52c41a' }
            },
            {
              value: errors,
              name: 'Erreurs',
              itemStyle: { color: '#f5222d' }
            }
          ]
        }
      ]
    };
  }

  private updatePackageCharts(repositories: RepositoryResult[]): void {
    if (!repositories.length) return;
    const packageNames = Object.keys(repositories[0].packageVersions);
    const colors = ['#1890ff', '#722ed1', '#fa8c16', '#52c41a', '#f5222d', '#13c2c2'];

    this.packageChartOptions = packageNames.map((name, i) => {
      const versionMap = new Map<string, number>();
      repositories.forEach(repo => {
        const version = repo.packageVersions[name];
        if (version) {
          const clean = version.replace(/[\^~]/, '');
          versionMap.set(clean, (versionMap.get(clean) || 0) + 1);
        }
      });
      const sortedVersions = Array.from(versionMap.entries()).sort((a, b) => b[1] - a[1]);
      const color = colors[i % colors.length];

      return {
        name,
        option: {
          title: {
            text: `Versions ${name}`,
            left: 'center',
            textStyle: { fontSize: 18, fontWeight: 'bold' }
          },
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          xAxis: {
            type: 'category',
            data: sortedVersions.map(v => v[0]),
            axisLabel: { rotate: 45 }
          },
          yAxis: { type: 'value', name: 'Nombre de repos' },
          series: [{
            data: sortedVersions.map(v => ({ value: v[1], itemStyle: { color } })),
            type: 'bar',
            barWidth: '60%',
            label: { show: true, position: 'top' }
          }]
        } as EChartsOption
      };
    });
  }

  private updatePlatformChart(repositories: RepositoryResult[]): void {
    const azure = repositories.filter(r => r.platform === 'azure').length;
    const bitbucket = repositories.filter(r => r.platform === 'bitbucket').length;

    this.platformChartOption = {
      title: {
        text: 'Distribution par Plateforme',
        left: 'center',
        textStyle: {
          fontSize: 18,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'item'
      },
      legend: {
        bottom: 10,
        left: 'center'
      },
      series: [
        {
          name: 'Plateforme',
          type: 'pie',
          radius: '70%',
          data: [
            {
              value: azure,
              name: 'Azure DevOps',
              itemStyle: { color: '#0078d4' }
            },
            {
              value: bitbucket,
              name: 'Bitbucket',
              itemStyle: { color: '#0052cc' }
            }
          ],
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }
      ]
    };
  }

  private updateTimelineChart(repositories: RepositoryResult[]): void {
    const repoNames = repositories.map(r => r.name);
    const obliqueData = repositories.map(r => {
      const version = r.packageVersions['@oblique/oblique'];
      if (!version) return 0;
      const cleanVersion = version.replace(/[\^~]/, '');
      const major = parseInt(cleanVersion.split('.')[0], 10);
      return major || 0;
    });
    const angularData = repositories.map(r => {
      const version = r.packageVersions['@angular/cdk'];
      if (!version) return 0;
      const cleanVersion = version.replace(/[\^~]/, '');
      const major = parseInt(cleanVersion.split('.')[0], 10);
      return major || 0;
    });

    this.timelineChartOption = {
      title: {
        text: 'Comparaison des Versions Majeures',
        left: 'center',
        textStyle: {
          fontSize: 18,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        data: ['Oblique', 'Angular CDK'],
        bottom: 10
      },
      xAxis: {
        type: 'category',
        data: repoNames,
        axisLabel: {
          rotate: 45,
          interval: 0
        }
      },
      yAxis: {
        type: 'value',
        name: 'Version Majeure'
      },
      series: [
        {
          name: 'Oblique',
          type: 'line',
          data: obliqueData,
          smooth: true,
          itemStyle: { color: '#1890ff' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
                { offset: 1, color: 'rgba(24, 144, 255, 0.1)' }
              ]
            }
          }
        },
        {
          name: 'Angular CDK',
          type: 'line',
          data: angularData,
          smooth: true,
          itemStyle: { color: '#722ed1' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(114, 46, 209, 0.3)' },
                { offset: 1, color: 'rgba(114, 46, 209, 0.1)' }
              ]
            }
          }
        }
      ]
    };
  }

  private updatePipelineCharts(pipelines: PipelineResult[]): void {
    if (!pipelines.length) return;

    // Extract pipeline names dynamically from the first result's keys
    const pipelineNames = Object.keys(pipelines[0].pipelineVersions);
    const colors = ['#52c41a', '#fa8c16', '#1890ff', '#722ed1', '#f5222d', '#13c2c2'];

    this.pipelineChartOptions = pipelineNames.map((name, i) => {
      const versionMap = new Map<string, number>();
      pipelines.forEach(pipeline => {
        const version = pipeline.pipelineVersions[name];
        if (version) {
          versionMap.set(version, (versionMap.get(version) || 0) + 1);
        }
      });
      const sortedVersions = Array.from(versionMap.entries()).sort((a, b) => b[1] - a[1]);
      const color = colors[i % colors.length];

      return {
        name,
        option: {
          title: {
            text: `Versions ${name}`,
            left: 'center',
            textStyle: { fontSize: 18, fontWeight: 'bold' }
          },
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          xAxis: {
            type: 'category',
            data: sortedVersions.map(v => v[0]),
            axisLabel: { rotate: 45 }
          },
          yAxis: { type: 'value', name: 'Nombre de repos' },
          series: [{
            data: sortedVersions.map(v => ({ value: v[1], itemStyle: { color } })),
            type: 'bar',
            barWidth: '60%',
            label: { show: true, position: 'top' }
          }]
        } as EChartsOption
      };
    });
  }
}
