import { spawn } from 'node:child_process';
import { readFile, rename, rm } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const [blendArgument, blender = process.env.BLENDER_EXE || 'blender'] = process.argv.slice(2);
if (!blendArgument?.toLowerCase().endsWith('.blend') || process.argv.length > 4) {
  console.error('Usage: node scripts/sync-blender-models.mjs <file.blend> [blender executable]');
  process.exit(1);
}

const blendFile = resolve(blendArgument);
const asset = resolve(project, 'src/game/character-models.json');
const temporaryAsset = resolve(project, 'src/game', '.character-models-' + process.pid + '.tmp');
const exporter = resolve(project, 'scripts/export-blender-models.py');
const vite = resolve(project, 'node_modules/vite/bin/vite.js');

function run(executable, args) {
  return new Promise((done, fail) => {
    const child = spawn(executable, args, { cwd: project, stdio: 'inherit', windowsHide: true });
    child.on('error', fail);
    child.on('exit', (code, signal) => {
      if (code === 0) done();
      else fail(new Error(executable + ' exited with ' + (signal ?? code)));
    });
  });
}

async function sync() {
  try {
    await run(isAbsolute(blender) ? resolve(blender) : blender,
      ['--background', '--factory-startup', '--disable-autoexec', blendFile,
        '--python-exit-code', '1', '--python', exporter, '--', temporaryAsset]);
    const exported = await readFile(temporaryAsset);
    const existing = await readFile(asset).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!exported.equals(existing ?? Buffer.alloc(0))) await rename(temporaryAsset, asset);
    await run(process.execPath, [vite, 'build']);
    console.log('Updated dist/index.html from ' + blendFile);
  } finally {
    await rm(temporaryAsset, { force: true });
  }
}

try {
  await sync();
} catch (error) {
  console.error('Model sync failed:', error.message);
  process.exitCode = 1;
}
