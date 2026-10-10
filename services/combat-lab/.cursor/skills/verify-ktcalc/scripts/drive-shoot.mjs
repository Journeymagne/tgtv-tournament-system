#!/usr/bin/env node
// Drive the shooting calculator the way a user does: open the page, read
// Situation 1's Average Damage, press the Attacks "+" button, and confirm the
// number changed while Situation 2 stayed put.
//
// Requires launch.sh + a passing doctor. Writes evidence under verify-artifacts/
// and always stops the Chrome process it started.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  artifactsDirFromEnv,
  evaluate,
  launchChrome,
  openPage,
  repoRootFromHere,
  screenshot,
  sleep,
  stopChrome,
} from './lib/browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = repoRootFromHere(import.meta.url);
const artifacts = artifactsDirFromEnv(repoRoot);

const PAGE_HOOKS = `
(() => {
  function isVisible(el) {
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }

  // Panel titles are not one element type. A title bar with no right-hand
  // button renders the title as a text node (Situation 1, Fighter A). A title
  // bar with a button wraps the title in a span (Situation 2).
  function isTitleElement(el, title) {
    if (!el || !isVisible(el)) return false;
    if (el.tagName === 'SPAN') return el.textContent.trim() === title;
    if (el.tagName === 'DIV') {
      const textKids = [...el.childNodes].filter((node) => node.nodeType === 3 && node.textContent.trim());
      return textKids.length === 1 && textKids[0].textContent.trim() === title;
    }
    return false;
  }

  function situationTitleCount(root) {
    return [...root.querySelectorAll('span, div')].filter((el) =>
      isTitleElement(el, 'Situation 1') || isTitleElement(el, 'Situation 2'),
    ).length;
  }

  function panel(title) {
    const starts = [...document.querySelectorAll('span, div')].filter((el) => isTitleElement(el, title));
    if (starts.length !== 1) {
      throw new Error('expected 1 visible panel titled ' + JSON.stringify(title) + ', found ' + starts.length);
    }
    let el = starts[0];
    while (el) {
      const selects = el.querySelectorAll('select');
      if (selects.length > 0 && situationTitleCount(el) === 1) return el;
      el = el.parentElement;
    }
    throw new Error('could not find the panel root for ' + title);
  }

  function attacksSelect(root) {
    const selects = [...root.querySelectorAll('select[id$="-Attacks"]')].filter(isVisible);
    if (selects.length !== 1) {
      throw new Error('expected 1 visible Attacks select in this panel, found ' + selects.length);
    }
    return selects[0];
  }

  function plusButton(select) {
    const button = select.nextElementSibling;
    if (!button || button.tagName !== 'BUTTON' || button.textContent.trim() !== '+') {
      throw new Error('Attacks + button was not the select\\'s next sibling');
    }
    return button;
  }

  function averageDamageElement(root) {
    const matches = [...root.querySelectorAll('button, p, div, span')].filter((node) =>
      /Average Damage:\\s*\\d+\\.\\d+/.test(node.textContent),
    );
    if (matches.length === 0) throw new Error('Average Damage readout was not in this panel');
    matches.sort((a, b) => a.textContent.length - b.textContent.length);
    return matches[0];
  }

  function averageDamage(root) {
    const match = averageDamageElement(root).textContent.trim().match(/Average Damage:\\s*(\\d+\\.\\d+)/);
    return match[1];
  }

  function rect(el) {
    const box = el.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }

  window.__ktVerify = {
    isVisible,
    panel,
    attacksSelect,
    plusButton,
    averageDamage,
    averageDamageElement,
    rect,
    h1() {
      const heading = document.querySelector('h1');
      return heading ? heading.textContent.trim() : '';
    },
  };
  return true;
})()
`;

function readPort() {
  const portFile = path.join(artifacts, 'dev-server.port');
  const port = readFileSync(portFile, 'utf8').trim();
  if (!/^[0-9]+$/.test(port)) {
    throw new Error(`bad port file ${portFile}`);
  }
  return port;
}

async function waitFor(cdp, expression, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not ready';
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(cdp, expression);
      if (value) return value;
      lastError = 'empty result';
    } catch (error) {
      lastError = error.message;
    }
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${label}: ${lastError}`);
}

async function main() {
  mkdirSync(artifacts, { recursive: true });
  execFileSync(path.join(here, 'doctor.sh'), { stdio: 'inherit' });
  const port = readPort();
  const url = `http://127.0.0.1:${port}/`;

  const userDataDir = path.join(artifacts, 'chrome-profile');
  const pidFile = path.join(artifacts, 'chrome.pid');
  let chromePid = 0;
  let cdp;

  try {
    const chrome = await launchChrome({ userDataDir, pidFile });
    chromePid = chrome.pid;
    cdp = await openPage(chrome.port, url);
    await cdp.send('Page.navigate', { url });
    await waitFor(
      cdp,
      `(() => {
        const heading = document.querySelector('h1');
        return heading && heading.textContent.includes('Shooting Calculator') ? heading.textContent.trim() : null;
      })()`,
      'shooting calculator heading',
    );
    await evaluate(cdp, PAGE_HOOKS);

    const before = await evaluate(cdp, `(() => {
      const s1 = window.__ktVerify.panel('Situation 1');
      const s2 = window.__ktVerify.panel('Situation 2');
      const attacks = window.__ktVerify.attacksSelect(s1);
      return {
        h1: window.__ktVerify.h1(),
        situation1Attacks: attacks.value,
        situation1AverageDamage: window.__ktVerify.averageDamage(s1),
        situation2AverageDamage: window.__ktVerify.averageDamage(s2),
      };
    })()`);

    const clip = await shotClip(cdp);
    const beforePng = path.join(artifacts, 'shoot-before.png');
    const afterPng = path.join(artifacts, 'shoot-after.png');
    await screenshot(cdp, beforePng, clip);

    await evaluate(cdp, `(() => {
      const s1 = window.__ktVerify.panel('Situation 1');
      const attacks = window.__ktVerify.attacksSelect(s1);
      window.__ktVerify.plusButton(attacks).click();
      return true;
    })()`);

    const after = await waitFor(
      cdp,
      `(() => {
        const s1 = window.__ktVerify.panel('Situation 1');
        const s2 = window.__ktVerify.panel('Situation 2');
        const attacks = window.__ktVerify.attacksSelect(s1).value;
        const dmg = window.__ktVerify.averageDamage(s1);
        if (attacks === ${JSON.stringify(before.situation1Attacks)} || dmg === ${JSON.stringify(before.situation1AverageDamage)}) {
          return null;
        }
        return {
          h1: window.__ktVerify.h1(),
          situation1Attacks: attacks,
          situation1AverageDamage: dmg,
          situation2AverageDamage: window.__ktVerify.averageDamage(s2),
        };
      })()`,
      'updated Situation 1 average damage',
    );

    await screenshot(cdp, afterPng, await shotClip(cdp));

    const situation2Unchanged = after.situation2AverageDamage === before.situation2AverageDamage;
    const attacksStepped = after.situation1Attacks !== before.situation1Attacks;
    const damageChanged = after.situation1AverageDamage !== before.situation1AverageDamage;
    const result = {
      feature: 'shooting',
      url,
      before,
      after,
      attacksStepped,
      damageChanged,
      situation2Unchanged,
      evidence: {
        before: beforePng,
        after: afterPng,
      },
    };
    const resultPath = path.join(artifacts, 'shoot-result.json');
    writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n');

    if (!attacksStepped || !damageChanged || !situation2Unchanged) {
      throw new Error(`shooting drive assertions failed: ${JSON.stringify(result)}`);
    }
    if (!/^\d+\.\d{2}$/.test(after.situation1AverageDamage)) {
      throw new Error(`average damage is not a two-decimal readout: ${after.situation1AverageDamage}`);
    }

    console.log('verify-ktcalc drive-shoot: PASS');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (cdp) {
      try {
        cdp.close();
      } catch {
        // socket may already be closed
      }
    }
    stopChrome(chromePid);
    await sleep(400);
    rmSync(pidFile, { force: true });
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function shotClip(cdp) {
  return evaluate(cdp, `(() => {
    const s1 = window.__ktVerify.panel('Situation 1');
    s1.scrollIntoView({ block: 'start' });
    const attacks = window.__ktVerify.attacksSelect(s1);
    const damage = window.__ktVerify.averageDamageElement(s1);
    const a = attacks.getBoundingClientRect();
    const d = damage.getBoundingClientRect();
    const panelBox = s1.getBoundingClientRect();
    const left = window.scrollX + Math.min(panelBox.left, a.left, d.left) - 8;
    const top = window.scrollY + Math.min(panelBox.top, a.top, d.top) - 8;
    const right = window.scrollX + Math.max(panelBox.right, a.right, d.right) + 8;
    const bottom = window.scrollY + Math.max(panelBox.bottom, a.bottom, d.bottom) + 8;
    return {
      x: Math.max(0, Math.floor(left)),
      y: Math.max(0, Math.floor(top)),
      width: Math.max(320, Math.ceil(right - left)),
      height: Math.max(200, Math.ceil(bottom - top)),
    };
  })()`);
}

main().catch((error) => {
  console.error(`verify-ktcalc drive-shoot: FAIL — ${error.message}`);
  process.exit(1);
});
