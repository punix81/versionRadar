/**
 * Extraction du node version des images de build des pipelines Angular.
 *
 * La version Node est encodée dans le champ `angular-pipeline.defaultNodejsBuildImage`
 * (ou `angular-pipeline.nodejsBuildImage`) du fichier `values.yaml`, sous la forme
 * d'une image du type `.../ubi9/nodejs-22:latest`. On extrait le numéro qui suit
 * `nodejs-`. Si le paramètre est absent (par défaut = latest), on renvoie la version
 * par défaut.
 */

/** Version Node par défaut utilisée quand le paramètre est absent ou n'encode pas de numéro. */
export const DEFAULT_NODE_VERSION = '22';

/**
 * Extraire le numéro de version depuis une chaîne d'image du type
 * `.../ubi9/nodejs-22:latest` -> `22`.
 *
 * @param image Chaîne d'image (ou null/undefined si le paramètre est absent).
 * @returns Le numéro extrait, ou null s'il n'y a aucun numéro `nodejs-<version>`.
 */
export function extractNodeVersionFromImage(image: string | null | undefined): string | null {
  if (!image) return null;
  const match = image.match(/nodejs[-_]?(\d+(?:\.\d+)*)/i);
  return match ? match[1] : null;
}

/**
 * Résoudre la version Node à afficher depuis l'objet `values.yaml` parsé.
 *
 * Lit `angular-pipeline.defaultNodejsBuildImage` puis `angular-pipeline.nodejsBuildImage`.
 * S'il n'y a pas d'image ou si elle n'encode pas de numéro, renvoie la version par défaut
 * (car l'absence du paramètre correspond au runtime "latest" par défaut).
 *
 * @param valuesObj Objet `values.yaml` parsé (objet brut non fiable).
 * @returns La version Node à afficher (jamais le mot "latest").
 */
export function resolveNodeVersion(valuesObj: unknown): string {
  if (!valuesObj || typeof valuesObj !== 'object') return DEFAULT_NODE_VERSION;

  const chart = (valuesObj as Record<string, unknown>)['angular-pipeline'];
  if (!chart || typeof chart !== 'object') return DEFAULT_NODE_VERSION;

  const cfg = chart as Record<string, unknown>;
  const image = (cfg?.defaultNodejsBuildImage ?? cfg?.nodejsBuildImage) as string | undefined;

  return extractNodeVersionFromImage(image) ?? DEFAULT_NODE_VERSION;
}
