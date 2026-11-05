import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(m?js|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = [
  ...walk(path.join(root, 'electron')),
  ...walk(path.join(root, 'src')),
  ...walk(path.join(root, 'tests')),
];

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

// Verifica integridade do hash SHA-256 do <script type="importmap"> na CSP do index.html.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cspMatch = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
if (!cspMatch) {
  throw new Error('CSP ausente no index.html');
}
const csp = cspMatch[1];
if (/unsafe-eval/i.test(csp)) {
  throw new Error('CSP nao deve permitir unsafe-eval');
}
const scriptSrcMatch = csp.match(/script-src\s+([^;]+)/i);
if (!scriptSrcMatch || /unsafe-inline/i.test(scriptSrcMatch[1])) {
  throw new Error('CSP script-src nao deve permitir unsafe-inline');
}

const mapMatch = html.match(/<script\s+type="importmap">([\s\S]*?)<\/script>/i);
if (!mapMatch) {
  throw new Error('<script type="importmap"> ausente no index.html');
}
const expectedHash =
  'sha256-' + crypto.createHash('sha256').update(mapMatch[1], 'utf8').digest('base64');
if (!scriptSrcMatch[1].includes(`'${expectedHash}'`)) {
  throw new Error(`Hash CSP do importmap divergente! Esperado '${expectedHash}' em script-src`);
}

console.log(`[check] OK — ${files.length} arquivos validados + CSP/importmap integro (${expectedHash})`);

