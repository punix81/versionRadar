/**
 * Atomic JSON writes for generated dashboard data.
 * Generated files are not secret; they are written with default permissions
 * through a temporary file so a crash cannot leave a truncated asset.
 */

import * as fs from 'fs';
import * as path from 'path';

export function writeJsonAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}
