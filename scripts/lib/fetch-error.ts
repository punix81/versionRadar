/**
 * Shared description of a remote retrieval failure.
 * Error values never contain request headers, tokens or remote response bodies.
 */

export type FetchErrorKind = 'http' | 'network' | 'timeout' | 'not_found' | 'invalid';

export interface FetchError {
  kind: FetchErrorKind;
  /** HTTP status when kind is 'http' or 'not_found'. */
  status?: number;
  /** Short, non-sensitive technical detail. */
  detail?: string;
}

export type FetchOutcome = { ok: true; content: string } | { ok: false; error: FetchError };

export function describeFetchError(error: FetchError): string {
  switch (error.kind) {
    case 'http':
      return `HTTP ${error.status ?? '?'}`;
    case 'not_found':
      return 'Non trouvé';
    case 'timeout':
      return 'Timeout de connexion';
    case 'network':
      return `Erreur réseau${error.detail ? ` (${error.detail})` : ''}`;
    case 'invalid':
      return error.detail ?? 'Réponse invalide';
  }
}
