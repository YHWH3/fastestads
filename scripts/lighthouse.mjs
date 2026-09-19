// Lighthouse gate: runs mobile audits against `astro preview` for '/' and the
// tool page. Rebuilds with SITE_URL set to the preview origin so robots.txt
// serves its canonical-host (allow) branch — non-canonical hosts correctly get
// disallow-all, which would fail Lighthouse's is-crawlable audit. Requires
// Playwright chromium.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';

const PORT = 4401;
const DEBUG_PORT = 9222;
const BASE = `http://localhost:${PORT}`;
const REPORTS = fileURLToPath(new URL('../reports/lighthouse/', import.meta.url));

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'tool', path: '/tools/google-ads-headline-checker/' },
];

const THRESHOLDS = {
  performance: 0.9,
  accessibility: 0.95,
  'best-practices': 0.9,
  seo: 0.95,
  lcpMs: 2500,
  cls: 0.1,
  tbtMs: 200,
};

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not start at ${url}`);
}

function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)),
    );
  });
}

// Rebuild with the preview origin as SITE_URL so canonical URLs and robots.txt
// treat the preview as the canonical host.
await run('pnpm', ['exec', 'astro', 'build'], { SITE_URL: BASE });

const preview = spawn('pnpm', ['preview', '--port', String(PORT)], {
  stdio: 'ignore',
  shell: false,
});

let browser;
let failures = 0;

try {
  await waitForServer(`${BASE}/`);
  browser = await chromium.launch({
    args: [`--remote-debugging-port=${DEBUG_PORT}`],
  });

  await mkdir(REPORTS, { recursive: true });
  const rows = [];

  for (const { name, path } of PAGES) {
    const url = `${BASE}${path}`;
    const result = await lighthouse(url, {
      port: DEBUG_PORT,
      output: 'json',
      logLevel: 'error',
      formFactor: 'mobile',
      screenEmulation: {
        mobile: true,
        width: 360,
        height: 640,
        deviceScaleFactor: 2,
        disabled: false,
      },
      throttlingMethod: 'simulate',
    });
    const lhr = result.lhr;
    await writeFile(`${REPORTS}${name}.json`, JSON.stringify(lhr, null, 2));

    const score = (cat) => lhr.categories[cat].score;
    const lcp = lhr.audits['largest-contentful-paint'].numericValue;
    const cls = lhr.audits['cumulative-layout-shift'].numericValue;
    const tbt = lhr.audits['total-blocking-time'].numericValue;

    const checks = [
      ['performance', score('performance') >= THRESHOLDS.performance],
      ['accessibility', score('accessibility') >= THRESHOLDS.accessibility],
      ['best-practices', score('best-practices') >= THRESHOLDS['best-practices']],
      ['seo', score('seo') >= THRESHOLDS.seo],
      ['LCP<=2500ms', lcp <= THRESHOLDS.lcpMs],
      ['CLS<=0.1', cls <= THRESHOLDS.cls],
      ['TBT<=200ms', tbt <= THRESHOLDS.tbtMs],
    ];
    for (const [label, ok] of checks) {
      if (!ok) {
        failures += 1;
        console.error(`FAIL ${name} ${label}`);
      }
    }
    rows.push({
      page: path,
      perf: (score('performance') * 100).toFixed(0),
      a11y: (score('accessibility') * 100).toFixed(0),
      bp: (score('best-practices') * 100).toFixed(0),
      seo: (score('seo') * 100).toFixed(0),
      lcp: `${Math.round(lcp)}ms`,
      cls: cls.toFixed(3),
      tbt: `${Math.round(tbt)}ms`,
    });
  }

  console.table(rows);
} finally {
  browser?.close().catch(() => {});
  preview.kill();
}

process.exit(failures === 0 ? 0 : 1);
