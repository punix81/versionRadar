import { describe, expect, it } from 'vitest';
import { compareConstraints, groupByMinimumVersion, parseConstraint } from './version-compare';

describe('parseConstraint', () => {
  it('treats an exact version as exact', () => {
    const parsed = parseConstraint('20.2.12');
    expect(parsed.kind).toBe('exact');
    expect(parsed.isRange).toBe(false);
    expect(parsed.minVersion).toBe('20.2.12');
  });

  it('resolves caret and tilde ranges to their minimum version', () => {
    expect(parseConstraint('^20.2.12').kind).toBe('range');
    expect(parseConstraint('^20.2.12').isRange).toBe(true);
    expect(parseConstraint('^20.2.12').minVersion).toBe('20.2.12');
    expect(parseConstraint('~0.15.1').minVersion).toBe('0.15.1');
  });

  it('recognises tags and aliases as non comparable', () => {
    expect(parseConstraint('latest').kind).toBe('tag');
    expect(parseConstraint('latest').minVersion).toBeNull();
    expect(parseConstraint('workspace:*').kind).toBe('alias');
    expect(parseConstraint('npm:@scope/pkg@1.2.3').kind).toBe('alias');
    expect(parseConstraint('file:../lib').kind).toBe('alias');
  });

  it('does not crash on unparsable input', () => {
    const parsed = parseConstraint('not-a-version');
    expect(parsed.kind).toBe('unknown');
    expect(parsed.minVersion).toBeNull();
  });
});

describe('compareConstraints', () => {
  it('considers a range and its exact minimum as the same version', () => {
    expect(compareConstraints('^20.2.12', '20.2.12')).toBe('same');
  });

  it('detects different major versions', () => {
    expect(compareConstraints('^20.2.12', '19.1.5')).toBe('different');
  });

  it('returns unknown when a value cannot be interpreted', () => {
    expect(compareConstraints('latest', '1.0.0')).toBe('unknown');
  });
});

describe('groupByMinimumVersion', () => {
  it('groups projects by resolved minimum version', () => {
    const groups = groupByMinimumVersion([
      { project: 'alpha', raw: '^20.2.12' },
      { project: 'beta', raw: '20.2.12' },
      { project: 'gamma', raw: '19.1.5' },
    ]);
    expect(groups.get('20.2.12')).toEqual(['alpha', 'beta']);
    expect(groups.get('19.1.5')).toEqual(['gamma']);
  });
});
