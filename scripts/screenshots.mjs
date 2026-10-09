/**
 * Play Store screenshots from the web build, at phone resolution.
 *
 *   npm run web            (in another terminal, Metro on :8081)
 *   npm run screenshots    [-- http://localhost:8081]
 *
 * Drives a headless Edge/Chrome over the DevTools protocol: seeds a realistic
 * history into localStorage, walks the tabs and a live workout, and captures
 * each screen at 1080 x 1920 into store/screenshots/<lang>/. The same UI code
 * runs on Android, so these are the real screens — only the status bar and
 * navigation bar differ.
 *
 * No extra dependency: `ws` is already here as a transitive dependency of
 * Metro, and the browser is whichever of Edge/Chrome is installed.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

import { root } from './load.mjs';

const BASE_URL = process.argv[2] || 'http://localhost:8081';
const OUT_DIR = path.join(root, 'store', 'screenshots');
const PORT = 9333;
const WIDTH = 432;
const HEIGHT = 768;
const SCALE = 2.5; // 432 x 768 CSS px -> 1080 x 1920 image

const BROWSERS = [
  // Any other Chrome or Chromium: CHROME_PATH=/path/to/chrome npm run screenshots
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- seed data ---------------------------------------------------------------
const DAY = 86400000;
function seedSessions() {
  const now = Date.now();
  const at = (daysAgo, hour) => {
    const d = new Date(now - daysAgo * DAY);
    d.setHours(hour, 12, 0, 0);
    return d.getTime();
  };
  const make = (daysAgo, hour, sets, extra = {}) => {
    const totalReps = sets.reduce((s, r) => s + r, 0);
    return {
      id: `seed-${daysAgo}-${hour}`,
      timestamp: at(daysAgo, hour),
      totalReps,
      durationSeconds: sets.length * 38,
      sourceId: 'ai',
      ...(sets.length > 1 ? { sets: sets.map((reps) => ({ reps, durationSeconds: 38 })), restSeconds: 60 * (sets.length - 1) } : {}),
      ...extra,
    };
  };
  const program = (week, day) => ({ program: { level: 'intermediate', week, day } });
  return [
    make(0, 7, [12, 12, 10], program(2, 1)),
    make(1, 19, [12, 11, 10], { exerciseId: 'plank', ...program(1, 6) }),
    make(2, 18, [20, 16], { exerciseId: 'squat' }),
    make(3, 7, [11, 11, 9], { exerciseId: 'crunch', ...program(1, 5) }),
    make(4, 20, [25]),
    make(5, 19, [11, 11, 9], { exerciseId: 'lunge', ...program(1, 2) }),
    make(6, 8, [18, 14]),
    make(7, 19, [11, 11, 9], program(1, 1)),
    make(8, 21, [22]),
    make(10, 19, [16]),
    make(12, 7, [14, 10]),
  ].sort((a, b) => b.timestamp - a.timestamp);
}

/** The training schedule (src/program/program.js) a week and a day in. */
function seedSchedule() {
  const now = Date.now();
  return {
    level: 'intermediate',
    startedAt: now - 8 * DAY,
    completed: { '1-1': now - 7 * DAY, '1-2': now - 5 * DAY, '1-3': now - 3 * DAY, '1-5': now - 1 * DAY, '1-6': now - 1 * DAY, '2-1': now },
  };
}

/**
 * The web build's stand-in blocker (src/blocker/demoBlocker.js), already set
 * up the recommended way: usage access and the overlay, no Accessibility.
 */
function seedBlocker() {
  return {
    usageAccess: true,
    overlayAllowed: true,
    enabled: true,
    blocked: ['com.ss.android.ugc.trill', 'com.facebook.katana', 'com.google.android.youtube'],
    balanceSeconds: 23 * 60,
    showTimer: true,
  };
}

function seedSettings(language, onboardingDone) {
  return {
    sourceId: 'tap',
    soundEnabled: true,
    hapticsEnabled: true,
    voiceEnabled: true,
    countdownSeconds: 0,
    restSeconds: 60,
    dailyGoal: 60,
    language,
    reminderEnabled: false,
    reminderHour: 19,
    reminderMinute: 0,
    onboardingDone,
  };
}

// --- tiny CDP client -------------------------------------------------------------
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.data || ''})`));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  /** Evaluate in the page; the expression may be async and use `await`. */
  async eval(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    }
    return result.value;
  }
}

async function waitFor(cdp, expression, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await cdp.eval(`return !!(${expression});`)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

/** Page-side helpers: press a control by its text, tap the rep stage, read text. */
const HELPERS = `
  window.__wait = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__all = () => [...document.querySelectorAll('[role=button],[role=radio],[role=tab]')];
  window.__btn = (label) => window.__all().find((b) => b.textContent.trim() === label);
  window.__tab = (label) => [...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.includes(label));
  window.__press = async (el) => {
    if (!el) throw new Error('control not found');
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
      pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: 'mouse' };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    await window.__wait(40);
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }));
    await window.__wait(150);
  };
  window.__tap = async () => {
    const el = document.querySelector('[data-testid="rep-stage"]');
    if (!el) throw new Error('stage not found');
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
      pointerId: 2, isPrimary: true, button: 0, buttons: 1, pointerType: 'touch' };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    await window.__wait(110);
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
    await window.__wait(540);
  };
  window.__text = () => document.body.innerText;
`;

async function shoot(cdp, file) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`  ${path.relative(root, file)}`);
}

/** The labels each language uses, so the walk can press the right controls. */
const LABELS = {
  en: { go: "Let's go", tap: 'Tap', start: 'Start', done: 'Done', finish: 'Finish workout', tabs: ['Schedule', 'Progress', 'Settings', 'Blocker'] },
  vi: { go: 'Bắt đầu thôi', tap: 'Chạm', start: 'Bắt đầu', done: 'Xong', finish: 'Kết thúc buổi tập', tabs: ['Lịch tập', 'Tiến độ', 'Cài đặt', 'Chặn app'] },
};

async function captureLanguage(cdp, lang) {
  const L = LABELS[lang];
  const dir = path.join(OUT_DIR, lang);
  console.log(`\n${lang}`);

  // Seed a fresh state and reload so the providers read it.
  await cdp.eval(`
    localStorage.setItem('pupg:sessions:v1', ${JSON.stringify(JSON.stringify(seedSessions()))});
    localStorage.setItem('pupg:schedule:v1', ${JSON.stringify(JSON.stringify(seedSchedule()))});
    localStorage.setItem('pupg:settings:v1', ${JSON.stringify(JSON.stringify(seedSettings(lang, false)))});
    localStorage.setItem('pupg:blockerDemo', ${JSON.stringify(JSON.stringify(seedBlocker()))});
  `);
  await cdp.send('Page.reload', { ignoreCache: false });
  await sleep(1500);
  await waitFor(cdp, `/hít đất/i.test(document.body.innerText)`);
  await cdp.eval(HELPERS);
  await waitFor(cdp, `window.__btn(${JSON.stringify(L.go)})`);
  await sleep(600);
  await shoot(cdp, path.join(dir, '07-onboarding.png'));

  await cdp.eval(`await window.__press(window.__btn(${JSON.stringify(L.go)}));`);
  await sleep(700);
  await shoot(cdp, path.join(dir, '01-home.png'));

  const tabFiles = ['04-program.png', '05-progress.png', '06-settings.png', '08-blocker.png'];
  for (let i = 0; i < L.tabs.length; i += 1) {
    await cdp.eval(`await window.__press(window.__tab(${JSON.stringify(L.tabs[i])}));`);
    await sleep(500);
    await shoot(cdp, path.join(dir, tabFiles[i]));
  }

  // Back to the workout tab and run a tap-mode set for the live screens.
  await cdp.eval(`await window.__press(document.querySelectorAll('[role=tab]')[0]);`);
  await sleep(300);
  await cdp.eval(`
    await window.__press(window.__btn(${JSON.stringify(L.tap)}));
    await window.__press(window.__btn(${JSON.stringify(L.start)}));
    await window.__wait(500);
    for (let i = 0; i < 14; i += 1) await window.__tap();
  `);
  await sleep(300);
  await shoot(cdp, path.join(dir, '02-workout.png'));

  await cdp.eval(`await window.__press(window.__btn(${JSON.stringify(L.done)}));`);
  await sleep(1200);
  await shoot(cdp, path.join(dir, '03-rest.png'));

  await cdp.eval(`await window.__press(window.__btn(${JSON.stringify(L.finish)}));`);
  await sleep(800);
}

async function main() {
  const browser = BROWSERS.find((p) => p && existsSync(p));
  if (!browser) throw new Error('No Edge or Chrome found; edit BROWSERS in scripts/screenshots.mjs');

  const profile = mkdtempSync(path.join(tmpdir(), 'pupg-shots-'));
  const proc = spawn(
    browser,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--disable-gpu',
      '--use-fake-ui-for-media-stream',
      // Chrome refuses to start sandboxed as root (containers, CI).
      ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
      `--window-size=${WIDTH},${HEIGHT}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i += 1) {
      await sleep(250);
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        target = list.find((t) => t.type === 'page');
      } catch {
        /* not up yet */
      }
    }
    if (!target) throw new Error('Browser did not expose a DevTools page');

    const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    const cdp = new Cdp(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: SCALE,
      mobile: true,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });

    await cdp.send('Page.navigate', { url: BASE_URL });
    await waitFor(cdp, `document.body && /hít đất/i.test(document.body.innerText)`, 90000);

    rmSync(OUT_DIR, { recursive: true, force: true });
    for (const lang of Object.keys(LABELS)) await captureLanguage(cdp, lang);

    ws.close();
    console.log(`\nDone: ${path.relative(root, OUT_DIR)}`);
  } finally {
    proc.kill();
    await sleep(500);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* the browser may still hold a lock on its profile; the OS temp dir cleans it */
    }
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
