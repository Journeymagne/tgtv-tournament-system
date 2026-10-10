// Headless Chrome via the DevTools protocol. Node built-ins only (Node 22+ WebSocket).
// The browser binary is the system Chrome/Chromium; this repo does not depend on Playwright.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      const found = execFileSync('which', [name], { encoding: 'utf8' }).trim();
      if (found) return found;
    } catch {
      // try the next name
    }
  }

  throw new Error(
    'Chrome/Chromium not found. Install Google Chrome, or set CHROME_PATH to the browser binary. No extra npm dependency is required.',
  );
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export async function launchChrome({ userDataDir, pidFile }) {
  const chromePath = findChrome();
  rmSync(userDataDir, { recursive: true, force: true });
  mkdirSync(userDataDir, { recursive: true });
  const port = await freePort();
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];
  // Linux containers need this. macOS uses the normal sandbox unless asked.
  if (process.platform === 'linux' || process.env.CHROME_NO_SANDBOX === '1') {
    args.splice(1, 0, '--no-sandbox', '--disable-setuid-sandbox');
  }

  const child = spawn(chromePath, args, { detached: true, stdio: 'ignore' });
  child.unref();
  writeFileSync(pidFile, String(child.pid));

  const deadline = Date.now() + 20000;
  let version;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        version = await res.json();
        break;
      }
    } catch {
      // Chrome is still starting.
    }
    await sleep(200);
  }
  if (!version) {
    stopChrome(child.pid);
    throw new Error(`Chrome did not open a DevTools port (binary ${chromePath})`);
  }
  return { pid: child.pid, port, chromePath };
}

export function stopChrome(pid) {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}

export async function openPage(debugPort, url) {
  const endpoint = `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`;
  let res = await fetch(endpoint, { method: 'PUT' });
  if (!res.ok) {
    res = await fetch(endpoint, { method: 'GET' });
  }
  if (!res.ok) {
    throw new Error(`DevTools /json/new failed (${res.status}) for ${url}`);
  }
  const target = await res.json();
  if (!target.webSocketDebuggerUrl) {
    throw new Error('DevTools target has no webSocketDebuggerUrl');
  }
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 2200,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return cdp;
}

export function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  const eventWaiters = [];

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error(`DevTools websocket failed: ${wsUrl}`)));
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message || 'CDP error'}: ${JSON.stringify(msg.error)}`));
      else resolve(msg.result);
      return;
    }
    if (msg.method) {
      for (let i = eventWaiters.length - 1; i >= 0; i -= 1) {
        if (eventWaiters[i].method === msg.method) {
          const waiter = eventWaiters.splice(i, 1)[0];
          waiter.resolve(msg.params);
        }
      }
    }
  });

  return ready.then(() => ({
    async send(method, params = {}) {
      const id = ++nextId;
      const result = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
      ws.send(JSON.stringify({ id, method, params }));
      return result;
    },
    close() {
      ws.close();
    },
  }));
}

export async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    const described = details.exception && details.exception.description;
    throw new Error(described || details.text || 'page evaluation failed');
  }
  return result.result ? result.result.value : undefined;
}

export async function screenshot(cdp, file, clip) {
  const params = { format: 'png' };
  if (clip) {
    params.clip = { ...clip, scale: 1 };
    params.captureBeyondViewport = true;
  }
  const { data } = await cdp.send('Page.captureScreenshot', params);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(file, Buffer.from(data, 'base64'));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function artifactsDirFromEnv(repoRoot) {
  const raw = process.env.VERIFY_ARTIFACTS || path.join(repoRoot, 'verify-artifacts');
  return path.isAbsolute(raw) ? raw : path.join(repoRoot, raw);
}

export function repoRootFromHere(importMetaUrl) {
  // scripts/lib/browser.mjs -> repo root is four directories up.
  let dir = path.dirname(fileURLToPath(importMetaUrl));
  for (let i = 0; i < 6; i += 1) {
    dir = path.dirname(dir);
    const pkg = path.join(dir, 'package.json');
    if (existsSync(pkg)) {
      return dir;
    }
  }
  throw new Error('could not find repo root from browser helper');
}
