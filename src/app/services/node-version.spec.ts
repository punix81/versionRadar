import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NODE_VERSION,
  extractNodeVersionFromImage,
  resolveNodeVersion,
} from '../../../scripts/node-version';

describe('extractNodeVersionFromImage', () => {
  it('extracts the major version from a nodejs image', () => {
    expect(extractNodeVersionFromImage('bit-base-images-docker-hosted.nexus.bit.admin.ch/bit/ubi9/nodejs-22:latest')).toBe('22');
  });

  it('extracts a patch version when present', () => {
    expect(extractNodeVersionFromImage('.../nodejs-22.7.1:latest')).toBe('22.7.1');
  });

  it('is case-insensitive on NodeJS', () => {
    expect(extractNodeVersionFromImage('.../NodeJS-20:latest')).toBe('20');
  });

  it('returns null when the image has no nodejs number', () => {
    expect(extractNodeVersionFromImage('.../nodejs:latest')).toBeNull();
    expect(extractNodeVersionFromImage('.../nginx-120:latest')).toBeNull();
  });

  it('returns null for missing image', () => {
    expect(extractNodeVersionFromImage(null)).toBeNull();
    expect(extractNodeVersionFromImage(undefined)).toBeNull();
    expect(extractNodeVersionFromImage('')).toBeNull();
  });
});

describe('resolveNodeVersion', () => {
  it('reads defaultNodejsBuildImage first', () => {
    const values = {
      'angular-pipeline': { defaultNodejsBuildImage: '.../ubi9/nodejs-22:latest' },
    };
    expect(resolveNodeVersion(values)).toBe('22');
  });

  it('falls back to nodejsBuildImage when default is absent', () => {
    const values = { 'angular-pipeline': { nodejsBuildImage: '.../ubi9/nodejs-20:latest' } };
    expect(resolveNodeVersion(values)).toBe('20');
  });

  it('returns the default version when no parameter is present', () => {
    expect(resolveNodeVersion({ 'angular-pipeline': {} })).toBe(DEFAULT_NODE_VERSION);
    expect(resolveNodeVersion({})).toBe(DEFAULT_NODE_VERSION);
  });

  it('returns the default version when the image has no number', () => {
    expect(resolveNodeVersion({ 'angular-pipeline': { nodejsBuildImage: '.../nodejs:latest' } })).toBe(DEFAULT_NODE_VERSION);
  });

  it('returns the default version for non-object input', () => {
    expect(resolveNodeVersion(null)).toBe(DEFAULT_NODE_VERSION);
    expect(resolveNodeVersion(undefined)).toBe(DEFAULT_NODE_VERSION);
    expect(resolveNodeVersion('nope')).toBe(DEFAULT_NODE_VERSION);
  });
});
