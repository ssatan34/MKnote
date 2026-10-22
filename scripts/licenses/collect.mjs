// Render mature-tool outputs without leaking local paths, and retain extra NOTICE files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [npmInput, cargoInput] = process.argv.slice(2);
if (!npmInput || !cargoInput) throw new Error('Usage: node scripts/licenses/collect.mjs <npm.json> <cargo.json>');
const npm = JSON.parse(fs.readFileSync(npmInput, 'utf8').replace(/^\uFEFF/, ''));
const cargo = JSON.parse(fs.readFileSync(cargoInput, 'utf8').replace(/^\uFEFF/, ''));
const inventory = JSON.parse(fs.readFileSync('LICENSES/dependency-inventory.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const cargoRegistry = path.join(process.env.CARGO_HOME || path.join(process.env.USERPROFILE, '.cargo'), 'registry', 'src');
const registries = fs.readdirSync(cargoRegistry).map(name => path.join(cargoRegistry, name));
const separator = '\n' + '='.repeat(78) + '\n';
const legalFiles = root => {
  const result = [];
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'target'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && /^(licen[cs]e|notice|copying|copyright)([._-]|$)/i.test(entry.name)) {
        result.push([path.relative(root, full).replaceAll('\\', '/'), fs.readFileSync(full, 'utf8')]);
      }
    }
  };
  visit(root);
  return result.sort(([a], [b]) => a.localeCompare(b));
};
const npmSections = ['NPM dependencies: installed locked packages (including build tools).\nExtra entries do not imply every package is embedded in the executable.'];
const manifest = { generators: { npm: 'license-checker-rseidelsohn 3.0.1', rust: 'cargo-about 0.9.2' }, target: 'x86_64-pc-windows-msvc', npm: [], rust: [] };
manifest.lockfiles = Object.fromEntries(['package-lock.json', 'src-tauri/Cargo.lock'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
for (const [id, info] of Object.entries(npm).sort(([a], [b]) => a.localeCompare(b))) {
  if (info.name === 'md-sticky-note') continue;
  if (!info.licenseText?.trim()) throw new Error(`Missing npm license: ${id}`);
  const relative = path.relative(process.cwd(), info.path).replaceAll('\\', '/');
  if (lock.packages[relative]?.version !== info.version) throw new Error(`Installed/locked version mismatch: ${id}`);
  const files = legalFiles(info.path);
  npmSections.push(`${id}\nDeclared license: ${info.licenses}\nSource: ${info.repository || ''}\n\n${info.licenseText}\n` + files.map(([name, text]) => `\n--- ${name} ---\n${text}`).join('\n'));
  manifest.npm.push({ name: info.name, version: info.version, license: info.licenses, source: info.repository || null, licenseFiles: files.map(([name]) => name) });
}
const rustSections = ['Rust dependencies: Windows x64 locked dependency graph, including build dependencies.\nAlternative licenses are selected by scripts/licenses/about.toml; additional original notices are retained below.'];
const covered = new Set();
for (const license of cargo.licenses) {
  if (!license.text?.trim()) throw new Error(`Missing Rust license text: ${license.id}`);
  const crates = license.used_by.map(item => item.crate);
  for (const crate of crates) covered.add(`${crate.name}@${crate.version}`);
  rustSections.push(`${license.name} (${license.id})\nUsed by: ${crates.map(c => `${c.name}@${c.version}`).join(', ')}\n\n${license.text}`);
}
rustSections.push('Original packaged license / copyright / NOTICE files (including nested native libraries):');
for (const item of cargo.crates) {
  const crate = item.package;
  if (crate.name === 'md-sticky-note') continue;
  if (!covered.has(`${crate.name}@${crate.version}`)) throw new Error(`Missing license in resolved Cargo graph: ${crate.name}@${crate.version}`);
  if (!inventory.cargoWindows.some(c => c.name === crate.name && c.version === crate.version)) throw new Error(`Update dependency inventory for ${crate.name}@${crate.version}`);
}
for (const crate of inventory.cargoWindows) {
  const id = `${crate.name}@${crate.version}`;
  const root = registries.map(dir => path.join(dir, `${crate.name}-${crate.version}`)).find(fs.existsSync);
  if (!root) throw new Error(`Missing locked crate source: ${id}`);
  const files = legalFiles(root);
  rustSections.push(`${id}\nDeclared license: ${crate.license}\nSource: ${crate.source}\n` + files.map(([name, text]) => `\n--- ${name} ---\n${text}`).join('\n'));
  if (!covered.has(id) && files.length === 0) throw new Error(`Missing supplementary license files: ${id}`);
  manifest.rust.push({ ...crate, inResolvedGraph: covered.has(id), licenseFiles: files.map(([name]) => name) });
}
for (const [file, sections] of [['npm-dependencies.txt', npmSections], ['rust-dependencies.txt', rustSections]]) {
  const text = sections.join(separator) + '\n';
  // Reports from third-party tools contain absolute paths; rendered notices must not.
  if (/[A-Z]:[\\/](?:Users|已完成项目)[\\/]/i.test(text)) throw new Error(`Local path in ${file}`);
  fs.writeFileSync(path.join('LICENSES', file), text);
  manifest[file] = crypto.createHash('sha256').update(text).digest('hex');
}
fs.writeFileSync('LICENSES/binary-dependency-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Rendered ${manifest.npm.length} npm packages and ${manifest.rust.length} Rust packages.`);
