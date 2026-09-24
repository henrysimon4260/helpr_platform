import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, cp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const staging = await mkdtemp(path.join(tmpdir(), 'helpr-job-photos-'));
await writeFile(path.join(staging, 'package.json'), '{"type":"module"}\n');

const files = [
  'apps/customer-app/src/lib/jobPhotos.ts',
  'apps/customer-app/src/lib/jobPhotos.test.ts',
  'apps/serviceprovider-app/src/lib/jobPhotoUrls.ts',
];

for (const relativePath of files) {
  const destination = path.join(staging, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(repoRoot, relativePath), destination);
}

const entry = path.join(staging, 'apps/customer-app/src/lib/jobPhotos.test.ts');
const child = spawn(process.execPath, ['--experimental-strip-types', '--test', entry], {
  stdio: 'inherit',
});

const code = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('exit', resolve);
});

process.exit(typeof code === 'number' ? code : 1);
