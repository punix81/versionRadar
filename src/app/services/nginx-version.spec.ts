import { describe, expect, it } from 'vitest';
import {
  extractNginxVersionFromImage,
  formatNginxVersion,
  resolveNginxVersion,
} from '../../../scripts/nginx-version';

describe('extractNginxVersionFromImage', () => {
  it('formats a bare number as major.minor', () => {
    expect(extractNginxVersionFromImage('bit-base-images-docker-hosted.nexus.bit.admin.ch/bit/nginx-120:latest')).toBe('1.20');
  });

  it('keeps an explicit-dot version verbatim', () => {
    expect(extractNginxVersionFromImage('.../nginx-1.20:latest')).toBe('1.20');
  });

  it('is case-insensitive', () => {
    expect(extractNginxVersionFromImage('.../NGINX-124:latest')).toBe('1.24');
  });

  it('returns null when there is no nginx version', () => {
    expect(extractNginxVersionFromImage('.../nginx:latest')).toBeNull();
    expect(extractNginxVersionFromImage('.../dotnet-100-runtime:latest')).toBeNull();
    expect(extractNginxVersionFromImage(null)).toBeNull();
    expect(extractNginxVersionFromImage(undefined)).toBeNull();
  });
});

describe('formatNginxVersion', () => {
  it('formats 120 as 1.20', () => {
    expect(formatNginxVersion('120')).toBe('1.20');
  });
  it('formats 125 as 1.25', () => {
    expect(formatNginxVersion('125')).toBe('1.25');
  });
  it('leaves explicit dots unchanged', () => {
    expect(formatNginxVersion('1.20')).toBe('1.20');
  });
});

describe('resolveNginxVersion', () => {
  const dockerfile = `FROM bit-base-images-docker-hosted.nexus.bit.admin.ch/bit/nginx-120:latest
COPY /dist /usr/share/nginx/html
ENTRYPOINT ["nginx","-g","daemon off;"]`;

  it('extracts nginx from a FROM base image', () => {
    expect(resolveNginxVersion(dockerfile)).toBe('1.20');
  });

  it('returns null when the Dockerfile has no nginx base', () => {
    expect(resolveNginxVersion('FROM .../dotnet-100-runtime:latest\n')).toBeNull();
  });

  it('returns null for a missing Dockerfile', () => {
    expect(resolveNginxVersion(null)).toBeNull();
    expect(resolveNginxVersion(undefined)).toBeNull();
    expect(resolveNginxVersion('')).toBeNull();
  });
});
