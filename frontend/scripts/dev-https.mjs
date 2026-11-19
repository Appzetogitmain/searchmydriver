#!/usr/bin/env node
/**
 * `npm run dev:https` — run the Vite dev server over HTTPS so phones on the
 * same Wi-Fi can use the microphone (in-app calls) and other secure-only APIs.
 * Browsers only allow getUserMedia on https:// or localhost.
 *
 * Creates a self-signed certificate in `.cert/` (gitignored) covering
 * localhost and this machine's LAN IPs, regenerating it when the IP changes.
 * On the phone, open https://<LAN-IP>:5190 and accept the certificate warning
 * once ("Advanced" → "Proceed").
 */
import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const certDir = path.join(root, '.cert');
const keyPath = path.join(certDir, 'dev-key.pem');
const certPath = path.join(certDir, 'dev-cert.pem');
const metaPath = path.join(certDir, 'hosts.json');

const lanIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);
const hosts = ['localhost', '127.0.0.1', ...lanIps];

function certIsCurrent() {
  try {
    const saved = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    return fs.existsSync(keyPath) && fs.existsSync(certPath) && hosts.every((h) => saved.includes(h));
  } catch {
    return false;
  }
}

if (!certIsCurrent()) {
  fs.mkdirSync(certDir, { recursive: true });
  const san = hosts.map((h) => (/^\d+\.\d+\.\d+\.\d+$/.test(h) ? `IP:${h}` : `DNS:${h}`)).join(',');
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '825',
      '-keyout', keyPath, '-out', certPath,
      '-subj', '/CN=searchmydriver-dev',
      '-addext', `subjectAltName=${san}`,
    ], { stdio: 'pipe' });
  } catch (err) {
    console.error('Could not create a dev certificate. Is `openssl` installed and on PATH?');
    console.error(String(err.stderr || err.message));
    process.exit(1);
  }
  fs.writeFileSync(metaPath, JSON.stringify(hosts));
  console.log(`Created dev certificate for: ${hosts.join(', ')}`);
}

console.log('\nOn your phone (same Wi-Fi), open the "Network: https://…" URL Vite prints below');
console.log('and accept the certificate warning once ("Advanced" → "Proceed").\n');

const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, DEV_HTTPS: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
