import { readFile } from 'node:fs/promises';
try {
  for (const line of (await readFile(new URL('.env', import.meta.url), 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
process.env.NODE_ENV ||= 'production';
process.env.PORT ||= '8080';
const { startApp } = await import('./app.mjs');
await startApp();
