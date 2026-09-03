/**
 * Extraction de la version nginx depuis le Dockerfile d'un repository.
 *
 * La version est encodée dans l'image de base du runtime, du type
 * `FROM .../bit/nginx-120:latest`. On extrait le numéro qui suit `nginx-`
 * et on le présente sous forme `majeure.mineure` (ex: `120` -> `1.20`, ou
 * directement `nginx-1.20` -> `1.20`). S'il n'y a pas de ligne `FROM ...nginx`,
 * on renvoie null.
 */

/** Extraire la version brute (ex: `120`) qui suit `nginx-` dans une chaîne d'image. */
export function extractRawNginxVersion(image: string | null | undefined): string | null {
  if (!image) return null;
  const match = image.match(/nginx[-_]?(\d[\d.]*)/i);
  return match ? match[1] : null;
}

/** Formater une version brute `120` en `1.20` (les versions avec un point restent telles quelles). */
export function formatNginxVersion(raw: string): string {
  if (raw.includes('.')) return raw;
  if (raw.length >= 2) return `${raw.slice(0, -2)}.${raw.slice(-2)}`;
  return raw;
}

/** Extraire la version nginx à afficher depuis une chaîne d'image (null si absente). */
export function extractNginxVersionFromImage(image: string | null | undefined): string | null {
  const raw = extractRawNginxVersion(image);
  return raw ? formatNginxVersion(raw) : null;
}

/**
 * Résoudre la version nginx à afficher depuis le contenu du Dockerfile.
 *
 * Cherche la première ligne `FROM ...nginx-<version>` et la formate. S'il n'y a
 * pas de base nginx (ou pas de Dockerfile), renvoie null.
 */
export function resolveNginxVersion(dockerfile: string | null | undefined): string | null {
  if (!dockerfile) return null;
  const match = dockerfile.match(/^\s*FROM\s+[^\s]*nginx[-_]?(\d[\d.]*)/im);
  return match ? formatNginxVersion(match[1]) : null;
}
