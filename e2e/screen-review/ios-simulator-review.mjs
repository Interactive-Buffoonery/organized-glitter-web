#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DEVICE = 'iPhone 17';
const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_OUT_DIR = 'playwright-artifacts/ios-simulator-review';
const DEFAULT_DELAY_MS = 5000;
const DEFAULT_WARMUP_MS = 1500;

const usage = `Usage:
  pnpm mobile:ios-sim -- [options]

Options:
  --device <name-or-udid>  Simulator to boot. Default: ${DEFAULT_DEVICE}
  --url <url>              Base URL to open. Default: ${DEFAULT_BASE_URL}
  --route <path>           Route to capture. Can be repeated. Default: /
  --delay <ms>             Wait before each screenshot. Default: ${DEFAULT_DELAY_MS}
  --warmup <ms>            Wait after booting/opening Simulator. Default: ${DEFAULT_WARMUP_MS}
  --out <dir>              Screenshot output directory. Default: ${DEFAULT_OUT_DIR}
  --list-devices           Print available iPhone/iPad simulators and exit.
  --no-screenshot          Open routes without capturing screenshots.
  --no-open-app            Do not bring Simulator.app to the foreground.
  --help                   Show this help.

Examples:
  pnpm mobile:ios-sim
  pnpm mobile:ios-sim -- --route /overview --route /dashboard
  pnpm mobile:ios-sim -- --device "iPhone 16e" --url http://localhost:3000 --route /randomizer
`;

const parseArgs = argv => {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    delayMs: DEFAULT_DELAY_MS,
    device: DEFAULT_DEVICE,
    listDevices: false,
    openApp: true,
    outDir: DEFAULT_OUT_DIR,
    routes: [],
    screenshot: true,
    warmupMs: DEFAULT_WARMUP_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (!argv[index]) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--device') {
      options.device = next();
    } else if (arg === '--url') {
      options.baseUrl = next();
    } else if (arg === '--route') {
      options.routes.push(next());
    } else if (arg === '--delay') {
      options.delayMs = Number(next());
    } else if (arg === '--warmup') {
      options.warmupMs = Number(next());
    } else if (arg === '--out') {
      options.outDir = next();
    } else if (arg === '--list-devices') {
      options.listDevices = true;
    } else if (arg === '--no-screenshot') {
      options.screenshot = false;
    } else if (arg === '--no-open-app') {
      options.openApp = false;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
    throw new Error('--delay must be a non-negative number of milliseconds.');
  }

  if (!Number.isFinite(options.warmupMs) || options.warmupMs < 0) {
    throw new Error('--warmup must be a non-negative number of milliseconds.');
  }

  if (options.routes.length === 0) {
    options.routes.push('/');
  }

  return options;
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
  });

  if (result.status !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${details ? `:\n${details}` : ''}`);
  }

  return result.stdout;
};

const readDevices = () => {
  const raw = run('xcrun', ['simctl', 'list', 'devices', 'available', '--json']);
  const parsed = JSON.parse(raw);

  return Object.entries(parsed.devices ?? {}).flatMap(([runtime, devices]) =>
    devices
      .filter(device => device.isAvailable)
      .map(device => ({
        ...device,
        runtime,
      }))
  );
};

const isMobileSimulator = device =>
  device.deviceTypeIdentifier?.includes('iPhone') || device.deviceTypeIdentifier?.includes('iPad');

const printDevices = devices => {
  for (const device of devices.filter(isMobileSimulator)) {
    console.log(`${device.name} (${device.state})`);
    console.log(`  udid: ${device.udid}`);
    console.log(`  runtime: ${device.runtime.replace('com.apple.CoreSimulator.SimRuntime.', '')}`);
  }
};

const findDevice = (devices, requested) => {
  const candidates = devices.filter(isMobileSimulator);
  const exact =
    candidates.find(device => device.udid === requested) ??
    candidates.find(device => device.name.toLowerCase() === requested.toLowerCase());

  if (exact) return exact;

  const fuzzy = candidates.find(device =>
    device.name.toLowerCase().includes(requested.toLowerCase())
  );

  if (fuzzy) return fuzzy;

  return candidates[0] ?? null;
};

const bootDevice = device => {
  if (device.state !== 'Booted') {
    console.log(`Booting ${device.name}...`);
    run('xcrun', ['simctl', 'boot', device.udid]);
  }

  run('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], { stdio: 'inherit' });
};

const openSimulatorApp = () => {
  execFileSync('open', ['-a', 'Simulator'], { stdio: 'ignore' });
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const normalizeRoute = route => {
  if (/^https?:\/\//i.test(route)) return route;
  return route.startsWith('/') ? route : `/${route}`;
};

const buildUrl = (baseUrl, route) => new URL(normalizeRoute(route), baseUrl).toString();

const slug = value => {
  const withoutProtocol = value.replace(/^https?:\/\//i, '');

  return (
    withoutProtocol
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'home'
  );
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage);
    return;
  }

  const devices = readDevices();

  if (options.listDevices) {
    printDevices(devices);
    return;
  }

  const device = findDevice(devices, options.device);
  if (!device) {
    throw new Error('No available iPhone or iPad simulators were found.');
  }

  bootDevice(device);

  if (options.openApp) {
    openSimulatorApp();
  }

  await sleep(options.warmupMs);

  const outDir = path.resolve(options.outDir);
  if (options.screenshot) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log(`Using ${device.name} (${device.udid})`);

  for (const [index, route] of options.routes.entries()) {
    const url = buildUrl(options.baseUrl, route);
    console.log(`Opening ${url}`);
    run('xcrun', ['simctl', 'openurl', device.udid, url]);

    if (!options.screenshot) continue;

    await sleep(options.delayMs);
    const screenshotPath = path.join(
      outDir,
      `${String(index + 1).padStart(2, '0')}-${slug(url)}.png`
    );
    run('xcrun', ['simctl', 'io', device.udid, 'screenshot', '--type=png', screenshotPath]);
    console.log(`Saved ${screenshotPath}`);
  }

  if (options.screenshot) {
    console.log(`Review screenshots in ${outDir}`);
  }
};

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
