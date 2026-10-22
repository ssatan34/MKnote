import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('dev pack includes working source but preserves README and excludes local data/history', () => {
  // Retained in OS temp for inspection; never run the packer against user data.
  const root = mkdtempSync(path.join(tmpdir(), 'mknote-pack-test-'));
  const put = (name, value) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), value);
  };
  put('scripts/pack-dev.ps1', '');
  copyFileSync(new URL('../scripts/pack-dev.ps1', import.meta.url), path.join(root, 'scripts/pack-dev.ps1'));
  put('package.json', '{"name":"fixture"}');
  put('src/main.ts', 'original');
  put('DEV-README.txt', 'owner README');
  put('.gitignore', '.env\nnode_modules/\ndist/\n*.zip\n');
  execFileSync('git', ['init', '--quiet', root]);
  execFileSync('git', ['-C', root, 'config', 'core.autocrlf', 'false']);
  execFileSync('git', ['-C', root, 'add', '.']);
  put('src/main.ts', 'working copy');
  put('src/utils/new-helper.ts', 'export const value = 1;');
  put('tests/new-helper.test.ts', 'import "../src/utils/new-helper.ts";');
  put('src/local-secret.json', '{"fixture":true}');
  put('scratch.ts', 'not application source');
  put('.env', 'fixture-only');
  put('config.json', '{"fixture":true}');
  put('notes/private.md', 'fixture-only');
  put('node_modules/cache', 'generated');
  put('MKnote-portable-old.zip', 'old release');
  // Even accidentally tracked local configuration must not enter a migration pack.
  execFileSync('git', ['-C', root, 'add', '--force', '.env', 'config.json', 'node_modules/cache']);
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/pack-dev.ps1')]);
  assert.equal(readFileSync(path.join(root, 'DEV-README.txt'), 'utf8'), 'owner README');
  const zip = readdirSync(root).find(name => /^MKnote-dev.*\.zip$/.test(name));
  assert.ok(zip);
  const archive = path.join(root, zip);
  const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).trim().split(/\r?\n/).map(x => x.replace(/^\.\//, ''));
  assert.ok(entries.includes('src/main.ts'));
  assert.ok(entries.includes('src/utils/new-helper.ts'));
  assert.ok(entries.includes('tests/new-helper.test.ts'));
  assert.ok(!entries.includes('src/local-secret.json'));
  assert.ok(!entries.includes('scratch.ts'));
  assert.ok(entries.includes('DEV-README.txt'));
  assert.ok(entries.every(name => !/(^|\/)(\.git|\.env|node_modules|notes|config\.json)(\/|$)/.test(name)), entries.join('\n'));
  assert.ok(!entries.some(name => name.endsWith('.zip')));
  assert.equal(execFileSync('tar', ['-xOf', archive, 'src/main.ts'], { encoding: 'utf8' }), 'working copy');
  const before = readFileSync(archive);
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/pack-dev.ps1')]);
  assert.deepEqual(readFileSync(archive), before, 'a second pack must not replace the previous archive');
});

test('dev pack generates its fallback README inside the archive only', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'mknote-pack-readme-test-'));
  mkdirSync(path.join(root, 'scripts'));
  copyFileSync(new URL('../scripts/pack-dev.ps1', import.meta.url), path.join(root, 'scripts/pack-dev.ps1'));
  writeFileSync(path.join(root, 'package.json'), '{"name":"fixture"}');
  execFileSync('git', ['init', '--quiet', root]);
  execFileSync('git', ['-C', root, 'config', 'core.autocrlf', 'false']);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/pack-dev.ps1')]);
  const names = readdirSync(root);
  assert.ok(!names.includes('DEV-README.txt'));
  const zip = names.find(name => /^MKnote-dev.*\.zip$/.test(name));
  const readme = execFileSync('tar', ['-xOf', path.join(root, zip), 'DEV-README.txt'], { encoding: 'utf8' });
  assert.match(readme, /npm run tauri dev/);
});
