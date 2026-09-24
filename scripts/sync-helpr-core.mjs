import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const HELPR_CORE_SOURCE = path.join(root, 'shared/helpr-core');

export const HELPR_CORE_DESTINATIONS = [
  'apps/customer-app/src/lib/helpr-core',
  'apps/serviceprovider-app/src/lib/helpr-core',
  'apps/serviceprovider-app/supabase/functions/_shared/helpr-core',
];

function sourceFiles() {
  return fs
    .readdirSync(HELPR_CORE_SOURCE)
    .filter((name) => name.endsWith('.ts'))
    .sort();
}

/**
 * Copy canonical TypeScript into each runtime, or report drift.
 * Copies are byte-identical. There is no package.json and no transform.
 */
export function syncHelprCore({ check = false } = {}) {
  const files = sourceFiles();
  const errors = [];

  if (files.length === 0) {
    errors.push('shared/helpr-core has no .ts sources');
  }

  for (const relativeDest of HELPR_CORE_DESTINATIONS) {
    const destDir = path.join(root, relativeDest);
    if (!check) {
      fs.mkdirSync(destDir, { recursive: true });
    } else if (!fs.existsSync(destDir)) {
      errors.push(`missing directory ${relativeDest}`);
      continue;
    }

    const expected = new Set(files);
    if (fs.existsSync(destDir)) {
      for (const name of fs.readdirSync(destDir)) {
        if (name.endsWith('.ts') && !expected.has(name)) {
          errors.push(`extra file ${relativeDest}/${name}`);
        }
      }
    }

    for (const name of files) {
      const fromPath = path.join(HELPR_CORE_SOURCE, name);
      const toPath = path.join(destDir, name);
      const source = fs.readFileSync(fromPath);
      if (check) {
        if (!fs.existsSync(toPath)) {
          errors.push(`missing ${relativeDest}/${name}`);
          continue;
        }
        const copy = fs.readFileSync(toPath);
        if (!copy.equals(source)) {
          errors.push(`drift ${relativeDest}/${name}`);
        }
      } else {
        fs.writeFileSync(toPath, source);
      }
    }
  }

  return { ok: errors.length === 0, errors, files };
}

function isCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isCli()) {
  const check = process.argv.includes('--check');
  const result = syncHelprCore({ check });
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(error);
    }
    console.error(check
      ? 'helpr-core copies drifted. Edit shared/helpr-core, then run: node scripts/sync-helpr-core.mjs'
      : 'helpr-core sync failed');
    process.exit(1);
  }
  const verb = check ? 'matched' : 'synced';
  console.log(`${verb} ${result.files.length} files into ${HELPR_CORE_DESTINATIONS.length} destinations`);
}
