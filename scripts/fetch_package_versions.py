#!/usr/bin/env python3

"""
Script pour récupérer les versions d'Oblique et Angular
depuis les fichiers package.json de plusieurs repos Azure DevOps et Bitbucket.

Configuration:
- config/package-repositories.json : Liste des repos à surveiller
- config/messages.json : Messages et libellés
- .env : Credentials pour Azure DevOps et Bitbucket

USAGE:
======
python3 scripts/fetch_package_versions.py
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
from dotenv import load_dotenv

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

# Charger les variables d'environnement
load_dotenv()

# Types et Classes
class AzureCredentials(TypedDict):
    """Credentials pour Azure DevOps."""
    user: str
    token: str


class BitbucketCredentials(TypedDict):
    """Credentials pour Bitbucket."""
    user: str
    token: str


class Credentials(TypedDict):
    """Tous les credentials."""
    azure: AzureCredentials
    bitbucket: BitbucketCredentials


class Repository(TypedDict, total=False):
    """Configuration d'un repository."""
    platform: str  # 'azure' | 'bitbucket'
    collection: str
    project: str
    repo: str
    name: str
    path: str
    branch: str


class PackageVersions(TypedDict, total=False):
    """Versions des packages."""
    pass  # Dynamique - clés basées sur packageNames


class PackageJson(TypedDict, total=False):
    """Structure du fichier package.json."""
    name: str
    version: str
    dependencies: dict[str, str]
    devDependencies: dict[str, str]


class PackageInfo(TypedDict):
    """Informations extraites du package.json."""
    package_name: str
    package_version: str
    package_versions: PackageVersions
    all_dependencies: dict[str, str]


class RepositoryResult(TypedDict, total=False):
    """Résultat du traitement d'un repository."""
    name: str
    platform: str
    project: str
    repo: str
    status: str  # 'success' | 'error'
    package_versions: PackageVersions
    package_name: str
    package_version: str
    all_dependencies: dict[str, str]
    error: str


# Configuration depuis .env
AZURE_BASE_URL = 'https://devops-server.admin.ch'
BITBUCKET_BASE_URL = os.getenv('BITBUCKET_BASE_URL', 'https://bitbucket.bit.admin.ch')
REQUEST_TIMEOUT_MS = int(os.getenv('REQUEST_TIMEOUT_MS', '30000')) / 1000
DATE_LOCALE = os.getenv('DATE_LOCALE', 'fr-CH')

# Charger les fichiers de configuration
config_dir = Path(__file__).parent.parent / 'config'

with open(config_dir / 'package-repositories.json', encoding='utf-8') as f:
    repositories_config = json.load(f)

with open(config_dir / 'messages.json', encoding='utf-8') as f:
    messages = json.load(f)

# Configuration depuis package-repositories.json
REPOSITORIES: list[Repository] = repositories_config['repositories']
FILE_PATH: str = repositories_config['filePath']
PACKAGE_NAMES: list[str] = repositories_config['packageNames']


def get_credentials() -> Credentials:
    """Récupérer les credentials depuis le fichier .env."""
    azure_user = os.getenv('AZUREDEVOPS_USER')
    azure_token = os.getenv('AZUREDEVOPS_TOKEN')
    bitbucket_user = os.getenv('BITBUCKET_USER')
    bitbucket_token = os.getenv('BITBUCKET_TOKEN')

    if not azure_user or not azure_token:
        logger.error('❌ Erreur: Variables AZUREDEVOPS_USER et AZUREDEVOPS_TOKEN requises dans .env')
        sys.exit(1)

    if not bitbucket_user or not bitbucket_token:
        logger.error(messages['errors']['missingCredentials'])
        sys.exit(1)

    return {
        'azure': {'user': azure_user, 'token': azure_token},
        'bitbucket': {'user': bitbucket_user, 'token': bitbucket_token}
    }


def create_auth_header(username: str, token: str) -> str:
    """Créer l'en-tête d'authentification Basic Auth."""
    auth_string = f'{username}:{token}'
    encoded = base64.b64encode(auth_string.encode()).decode()
    return f'Basic {encoded}'


def fetch_from_azure(
    repo: Repository,
    credentials: Credentials
) -> tuple[str | None, str | None]:
    """
    Récupérer le fichier depuis Azure DevOps.

    API: https://devops-server.admin.ch/{collection}/{project}/_apis/git/repositories/{repositoryId}/items
    """
    collection = repo.get('collection', 'DefaultCollection')
    api_url = (
        f'{AZURE_BASE_URL}/{collection}/{repo["project"]}/_apis/git/repositories/'
        f'{repo["repo"]}/items?path=/{repo["path"]}&api-version=6.0'
    )

    headers = {
        'Authorization': create_auth_header(
            credentials['azure']['user'],
            credentials['azure']['token']
        ),
        'Accept': 'text/plain',  # Important: demander le contenu brut
        'User-Agent': 'VersionRadar/1.0',
    }

    try:
        response = requests.get(
            api_url,
            headers=headers,
            timeout=REQUEST_TIMEOUT_MS,
            verify=False,
        )

        if response.status_code >= 200 and response.status_code < 300:
            # Azure DevOps retourne le contenu directement
            return response.text, None
        else:
            return None, f'HTTP {response.status_code}'

    except requests.exceptions.Timeout:
        return None, messages['errors']['timeout']
    except Exception:
        return None, messages['errors']['timeout']


def fetch_from_bitbucket(
    repo: Repository,
    credentials: Credentials
) -> tuple[str | None, str | None]:
    """
    Récupérer le fichier depuis Bitbucket Server.

    API: /rest/api/1.0/projects/{projectKey}/repos/{repositorySlug}/raw/{path}
    """
    api_url = (
        f'{BITBUCKET_BASE_URL}/rest/api/1.0/projects/{repo["project"]}/'
        f'repos/{repo["repo"]}/raw/{repo["path"]}'
    )

    if repo.get('branch'):
        api_url += f'?at=refs/heads/{repo["branch"]}'

    headers = {
        'Authorization': create_auth_header(
            credentials['bitbucket']['user'],
            credentials['bitbucket']['token']
        ),
        'Accept': 'application/json',
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
            return response.text, None
        else:
            return None, f'HTTP {response.status_code}'

    except requests.exceptions.Timeout:
        return None, messages['errors']['timeout']
    except Exception:
        return None, messages['errors']['timeout']


def fetch_package_json(
    repo: Repository,
    credentials: Credentials
) -> tuple[str | None, str | None]:
    """Récupérer le fichier package.json selon la plateforme."""
    if repo['platform'] == 'azure':
        return fetch_from_azure(repo, credentials)
    else:
        return fetch_from_bitbucket(repo, credentials)


def extract_package_versions(json_content: str) -> PackageInfo:
    """
    Parser le package.json et extraire les versions des packages.

    Args:
        json_content: Contenu du fichier package.json en string

    Returns:
        PackageInfo avec les versions extraites

    Raises:
        ValueError: Si le JSON ne peut pas être parsé
    """
    try:
        package_json: PackageJson = json.loads(json_content)
    except json.JSONDecodeError as e:
        raise ValueError('Impossible de parser le fichier package.json') from e

    package_versions: PackageVersions = {name: None for name in PACKAGE_NAMES}

    # Récupérer toutes les dépendances
    all_dependencies = {
        **package_json.get('dependencies', {}),
        **package_json.get('devDependencies', {})
    }

    # Chercher les packages configurés
    for package_name in PACKAGE_NAMES:
        if package_name in all_dependencies:
            package_versions[package_name] = all_dependencies[package_name]

    return {
        'package_name': package_json.get('name', 'N/A'),
        'package_version': package_json.get('version', 'N/A'),
        'package_versions': package_versions,
        'all_dependencies': all_dependencies
    }


def display_repo_results(repo: Repository, info: PackageInfo, index: int) -> None:
    """Afficher les résultats d'un repository en console."""
    display_config = messages['display']
    status_config = messages['status']
    separator = display_config['separator'] * display_config['separatorLength']

    if index > 0:
        print()
    print(separator)
    print(f"{display_config['repoIcon']} {repo['name']} [{repo['platform'].upper()}] "
          f"({repo['project']}/{repo['repo']})")
    print(separator)

    print(f"   📦 Package: {info['package_name']} v{info['package_version']}")

    for package_name in PACKAGE_NAMES:
        version = info['package_versions'].get(package_name)
        if version:
            print(f"   {status_config['success']} {package_name}: {version}")
        else:
            print(f"   {status_config['warning']}  {package_name}: "
                  f"{status_config['notFound']}")


def display_summary_table(results: list[RepositoryResult]) -> None:
    """Afficher le tableau récapitulatif des résultats."""
    table_config = messages['table']

    print('\n')
    print('╔' + '═' * 78 + '╗')
    print('║' + '📊 VERSIONS DES PACKAGES'.center(78) + '║')
    print('╠' + '═' * 78 + '╣')

    # En-têtes
    header_line = '║ Repository'.ljust(23) + '│ '
    for package_name in PACKAGE_NAMES:
        # Raccourcir les noms pour l'affichage
        short_name = (package_name
                      .replace('@oblique/oblique', '@oblique')
                      .replace('@angular/cdk', '@ng/cdk'))
        header_line += short_name.ljust(18) + '│ '
    header_line += 'Status'.ljust(14) + '║'
    print(header_line)
    print('╠' + '─' * 78 + '╣')

    # Résultats
    for result in results:
        name = result['name'][:18].ljust(21)
        line = f'║ {name}│ '

        for package_name in PACKAGE_NAMES:
            version = result['package_versions'].get(package_name) or '-'
            # Enlever les ^ et ~ et limiter la longueur
            display_version = version.replace('^', '').replace('~', '')[:16]
            line += display_version.ljust(18) + '│ '

        status_text = (table_config['statusOk']
                       if result['status'] == 'success'
                       else table_config['statusError'])
        line += status_text.ljust(14) + '║'
        print(line)

    print('╚' + '═' * 78 + '╝')


def main() -> None:
    """Point d'entrée principal."""
    status_config = messages['status']
    summary_config = messages['summary']

    results: list[RepositoryResult] = []
    credentials = get_credentials()

    print()
    print('🚀 VersionRadar - Fetch Package Versions')
    print(f"📅 Date: {datetime.now().strftime('%d.%m.%Y')}")
    print(f'📁 Fichier recherché: {FILE_PATH}')
    print(f'🔢 Nombre de repositories: {len(REPOSITORIES)}')
    print(f'📦 Packages recherchés: {", ".join(PACKAGE_NAMES)}')
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

        repo = REPOSITORIES[index]

        print(f"\n{status_config['fetching']} [{index + 1}/{total_repos}] "
              f"{repo['name']} [{repo['platform'].upper()}]...")

        # Récupérer le fichier
        data, error = fetch_package_json(repo, credentials)

        if error:
            print(f"\n{status_config['error']} Erreur pour {repo['name']}: {error}")

            empty_versions = {name: None for name in PACKAGE_NAMES}

            results.append({
                'name': repo['name'],
                'platform': repo['platform'],
                'project': repo['project'],
                'repo': repo['repo'],
                'status': 'error',
                'error': error,
                'package_versions': empty_versions,
            })
        elif data:
            try:
                info = extract_package_versions(data)
                display_repo_results(repo, info, index)

                results.append({
                    'name': repo['name'],
                    'platform': repo['platform'],
                    'project': repo['project'],
                    'repo': repo['repo'],
                    'status': 'success',
                    'package_versions': info['package_versions'],
                    'package_name': info['package_name'],
                    'package_version': info['package_version'],
                    'all_dependencies': info['all_dependencies'],
                })
            except ValueError as e:
                error_message = str(e)
                print(f"\n{status_config['error']} Erreur pour {repo['name']}: "
                      f"{error_message}")

                empty_versions = {name: None for name in PACKAGE_NAMES}

                results.append({
                    'name': repo['name'],
                    'platform': repo['platform'],
                    'project': repo['project'],
                    'repo': repo['repo'],
                    'status': 'error',
                    'error': error_message,
                    'package_versions': empty_versions,
                })

        # Passer au repository suivant
        process_next_repository(index + 1)

    # Démarrer le traitement
    process_next_repository(0)


if __name__ == '__main__':
    main()

