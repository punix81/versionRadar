#!/usr/bin/env node

/**
 * Creates a single-use consent file for the privileged `refresh_versions` MCP tool.
 *
 * This command must be run by the human operator. The consent is the local file
 * itself (chmod 600, single use, time limited); no token is transmitted to the
 * model or through the conversation.
 *
 * Usage:
 *   npm run mcp:allow-refresh -- --target all
 *   npm run mcp:allow-refresh -- --target packages --ttl 15
 */

import { createConsent } from './tools';

type Target = 'packages' | 'pipelines' | 'all';

function parseArgs(argv: string[]): { target: Target; ttlMinutes: number } {
  let target: Target = 'all';
  let ttlMinutes = 10;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--target') {
      const value = argv[index + 1];
      if (value === 'packages' || value === 'pipelines' || value === 'all') {
        target = value;
        index += 1;
      } else {
        throw new Error('--target must be packages, pipelines or all');
      }
    } else if (arg === '--ttl') {
      const value = Number.parseInt(argv[index + 1] ?? '', 10);
      if (!Number.isFinite(value) || value < 1 || value > 120) {
        throw new Error('--ttl must be an integer between 1 and 120 minutes');
      }
      ttlMinutes = value;
      index += 1;
    }
  }

  return { target, ttlMinutes };
}

function main(): void {
  const { target, ttlMinutes } = parseArgs(process.argv.slice(2));
  const consent = createConsent({ target, ttlMinutes });

  process.stdout.write(
    [
      'Consent single-use created.',
      `  file   : ${consent.filePath}`,
      `  target : ${target}`,
      `  expires: ${consent.expiresAt}`,
      '',
      'No token is transmitted to the model.',
      'The file is consumed by the next refresh_versions call, then deleted.',
      '',
    ].join('\n')
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`[versionradar] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
