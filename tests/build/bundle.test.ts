import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const DIST = join(import.meta.dirname, '../../dist');
const CLIENT = join(DIST, 'client');
const ASTRO_DIR = join(CLIENT, '_astro');

function allFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allFiles(full));
    else out.push(full);
  }
  return out;
}

const KB = 1024;
const gzipSize = (file: string) => gzipSync(readFileSync(file)).length;

describe('dist bundle budget', () => {
  const jsFiles = allFiles(ASTRO_DIR).filter((f) => f.endsWith('.js'));

  it('island bundle is <= 24 KB gzipped', () => {
    const islands = jsFiles.filter((f) => /AdChecker\./.test(f));
    expect(islands.length).toBe(1);
    const size = gzipSize(islands[0]);
    expect(size).toBeLessThanOrEqual(24 * KB);
  });

  it('total client JS is <= 40 KB gzipped', () => {
    const total = jsFiles.reduce((sum, f) => sum + gzipSize(f), 0);
    expect(total).toBeLessThanOrEqual(40 * KB);
  });

  it('emits no source maps into dist/client', () => {
    const maps = allFiles(CLIENT).filter((f) => f.endsWith('.map'));
    expect(maps).toEqual([]);
  });

  it('ships no Jev secrets, tokens or upstream URL to the client', () => {
    for (const file of allFiles(CLIENT)) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toContain('TYPESAFE');
      expect(text, file).not.toContain('Bearer ');
      expect(text, file).not.toContain('api.typesafe.ai');
    }
  });

  it('leaks no .dev.vars secret value into any dist file', () => {
    const devVars = join(import.meta.dirname, '../../.dev.vars');
    if (!existsSync(devVars)) return;
    const secrets = readFileSync(devVars, 'utf8')
      .split('\n')
      .map((line) => line.split('=')[1]?.trim())
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (secrets.length === 0) return;
    for (const file of allFiles(DIST)) {
      const text = readFileSync(file, 'utf8');
      for (const secret of secrets) {
        expect(text, `${file} must not contain a .dev.vars value`).not.toContain(secret);
      }
    }
  });
});
