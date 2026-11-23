// Runs the Capacitor CLI (`node scripts/cap.mjs sync android`). It needs Node 22 or newer while the
// rest of the project runs on Node 20, so this picks a Node 22+ that nvm has installed when the
// current one is older.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const major = (v) => Number(v.replace(/^v/, '').split('.')[0]);
let node = process.execPath;
if (major(process.version) < 22) {
  const dir = join(homedir(), '.nvm', 'versions', 'node');
  const found = existsSync(dir) ? readdirSync(dir).filter((v) => major(v) >= 22).sort((a, b) => major(b) - major(a)) : [];
  if (!found.length) {
    console.error('The Capacitor CLI needs Node 22 or newer: run `nvm install 22` once.');
    process.exit(1);
  }
  node = join(dir, found[0], 'bin', 'node');
}
const cli = join(process.cwd(), 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
const run = spawnSync(node, [cli, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(run.status ?? 1);
