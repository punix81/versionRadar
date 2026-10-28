/**
 * Version comparison for declared npm dependencies and pipeline versions.
 *
 * Only the data available in VersionRadar is used. There is deliberately no
 * "latest version" lookup: this module never claims that a dependency is
 * outdated, because no reference source exists in the project.
 */

import * as semver from 'semver';

export type ConstraintKind = 'exact' | 'range' | 'tag' | 'alias' | 'unknown';

export interface ParsedConstraint {
  raw: string;
  kind: ConstraintKind;
  /** Lowest version satisfying the constraint, when it can be computed. */
  minVersion: string | null;
  /** True when the constraint accepts more than one version. */
  isRange: boolean;
}

const TAG_VALUES = new Set(['latest', 'next', 'canary', 'beta', 'alpha', 'rc', '*', '']);

function normalizeRaw(raw: string): string {
  return raw.trim();
}

export function parseConstraint(rawInput: string): ParsedConstraint {
  const raw = normalizeRaw(rawInput);

  if (raw === '' || TAG_VALUES.has(raw.toLowerCase())) {
    return { raw, kind: 'tag', minVersion: null, isRange: true };
  }

  if (
    raw.startsWith('workspace:') ||
    raw.startsWith('npm:') ||
    raw.startsWith('file:') ||
    raw.startsWith('link:') ||
    raw.startsWith('portal:') ||
    raw.startsWith('git+') ||
    raw.startsWith('git:') ||
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('github:')
  ) {
    return { raw, kind: 'alias', minVersion: null, isRange: true };
  }

  const exact = semver.valid(raw.replace(/^v/, ''));
  if (exact) {
    return { raw, kind: 'exact', minVersion: exact, isRange: false };
  }

  const range = semver.validRange(raw);
  if (range) {
    const min = semver.minVersion(range);
    return {
      raw,
      kind: 'range',
      minVersion: min ? min.version : null,
      isRange: !semver.valid(raw),
    };
  }

  return { raw, kind: 'unknown', minVersion: null, isRange: false };
}

export type ConstraintComparison = 'same' | 'different' | 'unknown';

/**
 * Compares two declared constraints.
 * - `same` when both resolve to the same minimum satisfying version.
 * - `different` when both resolve but the minimum versions differ.
 * - `unknown` when at least one constraint cannot be interpreted.
 */
export function compareConstraints(left: string, right: string): ConstraintComparison {
  const a = parseConstraint(left);
  const b = parseConstraint(right);
  if (!a.minVersion || !b.minVersion) return 'unknown';
  return a.minVersion === b.minVersion ? 'same' : 'different';
}

/** Groups constraints that resolve to the same minimum version. */
export function groupByMinimumVersion(values: Array<{ project: string; raw: string }>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const value of values) {
    const parsed = parseConstraint(value.raw);
    const key = parsed.minVersion ?? `non comparable: ${parsed.raw}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(value.project);
    groups.set(key, bucket);
  }
  return groups;
}
