#!/usr/bin/env npx ts-node

/**
 * Seeds empty local runtime files (monitored repositories, generated scan results)
 * from the committed examples. Existing files are never overwritten.
 *
 * Usage: npm run data:init
 */

import { ensureLocalRuntimeFiles } from './lib/local-data';
import { findProjectRoot } from './lib/scanner-context';

function main(): void {
  const rootDir = findProjectRoot();
  const result = ensureLocalRuntimeFiles(rootDir);

  if (result.created.length === 0) {
    process.stdout.write('Local runtime files already present.\n');
  } else {
    const lines = result.created.map(file => '  ' + file).join('\n');
    process.stdout.write('Created local runtime files:\n' + lines + '\n');
  }
  process.stdout.write('These files are ignored by Git and contain no credentials.\n');
}

try {
  main();
} catch (error) {
  process.stderr.write('[versionradar] ' + (error instanceof Error ? error.message : String(error)) + '\n');
  process.exit(1);
}
