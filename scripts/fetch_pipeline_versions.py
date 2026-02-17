#!/usr/bin/env python3

"""
Script pour récupérer les versions de commons-pipeline et angular-pipeline
depuis les fichiers Chart.yaml de plusieurs repos Bitbucket.

Configuration:
- config/repositories.json : Liste des repos et pipelines à surveiller
- config/messages.json : Messages et libellés affichés en console
- .env : Credentials et paramètres de connexion

USAGE:
======
python3 scripts/fetch_pipeline_versions.py
"""

import base64
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, TypedDict
from urllib.parse import urljoin

import requests
import yaml
from dotenv import load_dotenv

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(message)s'
)
logger = logging.getLogger(__name__)

# Charger les variables d'environnement
load_dotenv()

# Types et Classes
class Credentials(TypedDict):
    """Credentials pour l'authentification Bitbucket."""
    username: str
    token: str


class Repository(TypedDict):
    """Configuration d'un repository."""
    project: str
    repo: str
    name: str
    branch: str | None


class PipelineVersions(TypedDict, total=False):
    """Versions des pipelines."""
    pass  # Dynamique - clés basées sur PIPELINE_NAMES


class ChartDependency(TypedDict, total=False):
    """Dépendance dans Chart.yaml."""
    name: str
    version: str | None
    repository: str | None


class ChartContainer(TypedDict, total=False):
    """Container dans Chart.yaml."""
    name: str | None
    image: str | None


class ChartYaml(TypedDict, total=False):
    """Structure du fichier Chart.yaml."""
    apiVersion: str
    name: str
    description: str
    type: str
    version: str
    appVersion: str
    dependencies: list[ChartDependency]
    containers: list[ChartContainer]


class ChartInfo(TypedDict):
    """Informations extraites du Chart.yaml."""
    chart_name: str
    chart_version: str
    app_version: str
    pipeline_versions: PipelineVersions
    all_dependencies: list[ChartDependency]


class RepositoryResult(TypedDict, total=False):
    """Résultat du traitement d'un repository."""
    name: str
    project: str
    repo: str
    status: str  # 'success' | 'error'
    pipeline_versions: PipelineVersions
    chart_name: str
    chart_version: str
    all_dependencies: list[ChartDependency]
    error: str


# Configuration depuis .env
BITBUCKET_BASE_URL = os.getenv('BITBUCKET_BASE_URL', 'https://bitbucket.bit.admin.ch')
REQUEST_TIMEOUT_MS = int(os.getenv('REQUEST_TIMEOUT_MS', '30000')) / 1000
DATE_LOCALE = os.getenv('DATE_LOCALE', 'fr-CH')

# Charger les fichiers de configuration
config_dir = Path(__file__).parent.parent / 'config'

with open(config_dir / 'repositories.json', encoding='utf-8') as f:
    repositories_config = json.load(f)

with open(config_dir / 'messages.json', encoding='utf-8') as f:
    messages = json.load(f)

# Configuration depuis repositories.json
REPOSITORIES: list[Repository] = repositories_config['repositories']
FILE_PATH: str = repositories_config['filePath']
PIPELINE_NAMES: list[str] = repositories_config['pipelineNames']


def get_credentials() -> Credentials:
    """Récupérer les credentials depuis le fichier .env."""
    username = os.getenv('BITBUCKET_USER')
    token = os.getenv('BITBUCKET_TOKEN')

    if not username or not token:
        logger.error(messages['errors']['missingCredentials'])
        sys.exit(1)

    return {'username': username, 'token': token}


def create_auth_header(username: str, token: str) -> str:
    """
    Créer l'en-tête d'authentification Basic Auth.

    Utilise l'approche Renovate pour l'authentification Bitbucket Server.
    """
    auth_string = f'{username}:{token}'
    encoded = base64.b64encode(auth_string.encode()).decode()
    return f'Basic {encoded}'


def fetch_raw_file(
    project_key: str,
    repo_slug: str,
    branch: str | None = None,
    on_complete: Callable[[str | None, str | None], None] | None = None,
) -> tuple[str | None, str | None]:
    """
    Récupérer le fichier brut depuis Bitbucket Server.

    API: /rest/api/1.0/projects/{projectKey}/repos/{repositorySlug}/raw/{path}

    Args:
        project_key: Clé du projet Bitbucket
        repo_slug: Slug du repository
        branch: Branche optionnelle
        on_complete: Callback avec (data, error)

    Returns:
        Tuple (data, error) où l'un des deux est None
    """
    credentials = get_credentials()

    api_url = (
        f'{BITBUCKET_BASE_URL}/rest/api/1.0/projects/{project_key}/'
        f'repos/{repo_slug}/raw/{FILE_PATH}'
    )

    if branch:
        api_url += f'?at=refs/heads/{branch}'

    headers = {
        'Authorization': create_auth_header(credentials['username'], credentials['token']),
        'Accept': 'text/plain, application/json',
        'User-Agent': 'VersionRadar/1.0',
        'X-Atlassian-Token': 'no-check',
    }

    try:
        response = requests.get(
            api_url,
            headers=headers,
            timeout=REQUEST_TIMEOUT_MS,
            verify=False,
        )

        if response.status_code >= 200 and response.status_code < 300:
            data = response.text
            if on_complete:
                on_complete(data, None)
            return data, None
        else:
            # Ne pas afficher le contenu de la réponse qui pourrait contenir
            # des infos sensibles
            error_msg = f'HTTP {response.status_code}'
            if on_complete:
                on_complete(None, error_msg)
            return None, error_msg

    except requests.exceptions.Timeout:
        error_msg = messages['errors']['timeout']
        if on_complete:
            on_complete(None, error_msg)
        return None, error_msg
    except Exception:
        # Masquer les erreurs de connexion qui pourraient contenir des infos sensibles
        error_msg = messages['errors']['timeout']
        if on_complete:
            on_complete(None, error_msg)
        return None, error_msg


def extract_pipeline_versions(yaml_content: str) -> ChartInfo:
    """
    Parser le fichier Chart.yaml et extraire les versions des pipelines.

    Args:
        yaml_content: Contenu du fichier Chart.yaml en string

    Returns:
        ChartInfo avec les versions extraites

    Raises:
        ValueError: Si le YAML ne peut pas être parsé
    """
    try:
        chart = yaml.safe_load(yaml_content)
    except yaml.YAMLError as e:
        raise ValueError(messages['errors']['parseError']) from e

    if not chart:
        raise ValueError(messages['errors']['parseError'])

    pipeline_versions: PipelineVersions = {name: None for name in PIPELINE_NAMES}

    # Chercher dans les dépendances
    if 'dependencies' in chart and isinstance(chart['dependencies'], list):
        for dep in chart['dependencies']:
            if dep.get('name') in PIPELINE_NAMES:
                pipeline_versions[dep['name']] = dep.get('version')

    # Chercher aussi dans les containers si présent
    if 'containers' in chart and isinstance(chart['containers'], list):
        for container in chart['containers']:
            container_name = container.get('name')
            if container_name:
                for pipeline_name in PIPELINE_NAMES:
                    if (pipeline_name in container_name and
                            not pipeline_versions[pipeline_name]):
                        image = container.get('image', '')
                        if ':' in image:
                            version = image.rsplit(':', 1)[-1]
                            pipeline_versions[pipeline_name] = version

    return {
        'chart_name': chart.get('name', 'N/A'),
        'chart_version': chart.get('version', 'N/A'),
        'app_version': chart.get('appVersion', 'N/A'),
        'pipeline_versions': pipeline_versions,
        'all_dependencies': chart.get('dependencies', []),
    }


def display_repo_results(repo_config: Repository, info: ChartInfo, index: int) -> None:
    """
    Afficher les résultats d'un repository en console.

    Args:
        repo_config: Configuration du repository
        info: Informations extraites du Chart.yaml
        index: Index du repository dans la liste
    """
    display_config = messages['display']
    status_config = messages['status']
    separator = display_config['separator'] * display_config['separatorLength']

    if index > 0:
        print()
    print(separator)
    print(f"{display_config['repoIcon']} {repo_config['name']} "
          f"({repo_config['project']}/{repo_config['repo']})")
    print(separator)

    print(f"   {display_config['chartLabel']}: {info['chart_name']} "
          f"v{info['chart_version']}")

    for pipeline_name in PIPELINE_NAMES:
        version = info['pipeline_versions'].get(pipeline_name)
        if version:
            print(f"   {status_config['success']} {pipeline_name}: {version}")
        else:
            print(f"   {status_config['warning']}  {pipeline_name}: "
                  f"{status_config['notFound']}")


def display_summary_table(results: list[RepositoryResult]) -> None:
    """
    Afficher le tableau récapitulatif des résultats.

    Args:
        results: Liste des résultats de chaque repository
    """
    table_config = messages['table']

    print('\n')
    print('╔' + '═' * 78 + '╗')
    print('║' + table_config['title'].center(78) + '║')
    print('╠' + '═' * 78 + '╣')

    # En-têtes dynamiques basés sur les pipelines configurés
    header_line = '║ ' + table_config['headers']['repository'].ljust(20) + '│ '
    for pipeline_name in PIPELINE_NAMES:
        header_line += pipeline_name.ljust(18) + '│ '
    header_line += table_config['headers']['status'].ljust(14) + '║'
    print(header_line)
    print('╠' + '─' * 78 + '╣')

    for result in results:
        name = result['name'][:18].ljust(20)
        line = f'║ {name}│ '

        for pipeline_name in PIPELINE_NAMES:
            version = result['pipeline_versions'].get(pipeline_name) or '-'
            line += str(version).ljust(18) + '│ '

        status_text = (table_config['statusOk']
                       if result['status'] == 'success'
                       else table_config['statusError'])
        line += status_text.ljust(14) + '║'
        print(line)

    print('╚' + '═' * 78 + '╝')


def main() -> None:
    """Point d'entrée principal - traite les repositories séquentiellement."""
    app_config = messages['app']
    status_config = messages['status']
    summary_config = messages['summary']

    results: list[RepositoryResult] = []

    print()
    print(f"{app_config['title']} {app_config['subtitle']}")

    # Format la date selon la locale
    date_str = datetime.now().strftime('%d.%m.%Y')
    print(f"{app_config['dateLabel']}: {date_str}")
    print(f"{app_config['fileLabel']}: {FILE_PATH}")
    print(f"{app_config['repoCountLabel']}: {len(REPOSITORIES)}")
    print()

    def process_next_repository(index: int) -> None:
        """Traiter les repositories récursivement avec callbacks."""
        nonlocal results
        total_repos = len(REPOSITORIES)

        if index >= total_repos:
            # Fin du traitement
            display_summary_table(results)

            # Statistiques finales
            success_count = sum(1 for r in results if r['status'] == 'success')
            error_count = sum(1 for r in results if r['status'] == 'error')

            print()
            print(f"{summary_config['icon']} {summary_config['label']}: "
                  f"{success_count} {summary_config['success']}, "
                  f"{error_count} {summary_config['errors']} "
                  f"{summary_config['on']} {total_repos} "
                  f"{summary_config['repositories']}")
            print()
            return

        repo_config = REPOSITORIES[index]

        print(f"\n{status_config['fetching']} [{index + 1}/{total_repos}] "
              f"{repo_config['name']}...")

        # Récupérer le fichier
        data, error = fetch_raw_file(
            repo_config['project'],
            repo_config['repo'],
            repo_config.get('branch'),
        )

        if error:
            print(f"\n{status_config['error']} Erreur pour {repo_config['name']}: {error}")

            empty_versions = {name: None for name in PIPELINE_NAMES}

            results.append({
                'name': repo_config['name'],
                'project': repo_config['project'],
                'repo': repo_config['repo'],
                'status': 'error',
                'error': error,
                'pipeline_versions': empty_versions,
            })
        elif data:
            try:
                info = extract_pipeline_versions(data)
                display_repo_results(repo_config, info, index)

                results.append({
                    'name': repo_config['name'],
                    'project': repo_config['project'],
                    'repo': repo_config['repo'],
                    'status': 'success',
                    'pipeline_versions': info['pipeline_versions'],
                    'chart_name': info['chart_name'],
                    'chart_version': info['chart_version'],
                    'all_dependencies': info['all_dependencies'],
                })
            except ValueError as e:
                error_message = str(e)
                print(f"\n{status_config['error']} Erreur pour {repo_config['name']}: "
                      f"{error_message}")

                empty_versions = {name: None for name in PIPELINE_NAMES}

                results.append({
                    'name': repo_config['name'],
                    'project': repo_config['project'],
                    'repo': repo_config['repo'],
                    'status': 'error',
                    'error': error_message,
                    'pipeline_versions': empty_versions,
                })

        # Passer au repository suivant
        process_next_repository(index + 1)

    # Démarrer le traitement avec le premier repository
    process_next_repository(0)


if __name__ == '__main__':
    main()

