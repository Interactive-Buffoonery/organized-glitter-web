import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { startWordPressFixture } from '../e2e/blog/wordpress-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const artifactRoot = path.join(root, '.tmp', 'blog-qa', runId);

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No available port');
  const port = address.port;
  await new Promise((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
  return port;
}

async function run(command, args, options) {
  const { logPath, env } = options;
  const log = createWriteStream(logPath);
  const logFinished = finished(log, { readable: false }).catch(error => error);
  let child;
  let childFinished;
  let childSettled = false;
  let primaryError;
  try {
    child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => {
      process.stdout.write(chunk);
      log.write(chunk);
    });
    child.stderr.on('data', chunk => {
      process.stderr.write(chunk);
      log.write(chunk);
    });
    childFinished = new Promise((resolve, reject) => {
      child.once('error', error => {
        childSettled = true;
        reject(error);
      });
      child.once('close', code => {
        childSettled = true;
        resolve(code);
      });
    });
    const code = await Promise.race([
      childFinished,
      logFinished.then(error => {
        if (error) throw error;
        return childFinished;
      }),
    ]);
    if (code !== 0) {
      throw new Error(`${command} ${args.join(' ')} exited ${code}; see ${logPath}`);
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (child && childFinished && !childSettled) {
      child.kill('SIGKILL');
      await childFinished.catch(() => undefined);
    }
    log.end();
    const logError = await logFinished;
    if (!primaryError && logError) throw logError;
  }
}

async function waitForServer(url, childFinished) {
  const deadline = Date.now() + 20_000;
  const stopped = childFinished.then(outcome => ({ outcome }));
  while (Date.now() < deadline) {
    const attempt = (async () => {
      try {
        const status = await new Promise((resolve, reject) => {
          http
            .get(url, response => {
              response.resume();
              resolve(response.statusCode);
            })
            .on('error', reject);
        });
        if (status === 200) return true;
      } catch {
        // The server is still starting.
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      return false;
    })();
    const result = await Promise.race([attempt, stopped]);
    if (typeof result === 'object') {
      if (result.outcome.error) throw result.outcome.error;
      const detail = result.outcome.signal
        ? ` with ${result.outcome.signal}`
        : ` with code ${result.outcome.code}`;
      throw new Error(`The built app server exited before QA${detail}`);
    }
    if (result) return;
  }
  throw new Error('The built app server did not start');
}

async function runScenario(scenario) {
  const artifactDir = path.join(artifactRoot, scenario);
  await fs.mkdir(artifactDir, { recursive: true });
  const fixture = await startWordPressFixture(scenario);
  let appServer;
  let appServerFinished;
  let appServerSettled = false;
  let serverLog;
  try {
    const env = {
      BLOG_ENABLED: 'true',
      WORDPRESS_API_URL: fixture.url,
      MAILPOET_IFRAME_URL: new URL('/?mailpoet_form_iframe=1', fixture.url).href,
      WORDPRESS_CONTACT_URL: new URL('/contact/', fixture.url).href,
      VITE_APP_URL: 'https://site.example.test',
      VITE_SUPPORT_URL: '/contact',
      PUBLIC_IMAGE_ORIGINS: 'https://content.example.test',
      VITE_UPDATES_URL: 'https://site.example.test/updates/',
      VITE_POCKETBASE_URL: 'http://127.0.0.1:8090',
      VITE_APP_VERSION: `blog-qa-${scenario}`,
    };
    await run('pnpm', ['build'], { logPath: path.join(artifactDir, 'build.log'), env });
    const port = await freePort();
    const baseURL = `http://127.0.0.1:${port}`;
    serverLog = await fs.open(path.join(artifactDir, 'server.log'), 'w');
    appServer = spawn('node', ['server/local-build-server.js'], {
      cwd: root,
      env: { ...process.env, ...env, PORT: String(port), APP_TEST_ENV: 'test' },
      stdio: ['ignore', serverLog.fd, serverLog.fd],
    });
    appServerFinished = new Promise(resolve => {
      const settle = outcome => {
        appServerSettled = true;
        resolve(outcome);
      };
      appServer.once('error', error => settle({ error }));
      appServer.once('close', (code, signal) => settle({ code, signal }));
    });
    await waitForServer(`${baseURL}/updates/`, appServerFinished);
    await run('pnpm', ['exec', 'playwright', 'test', '--config', 'e2e/blog.playwright.config.ts'], {
      logPath: path.join(artifactDir, 'playwright.log'),
      env: {
        BLOG_QA_BASE_URL: baseURL,
        BLOG_QA_SCENARIO: scenario,
        BLOG_QA_WORDPRESS_ORIGIN: new URL(fixture.url).origin,
        PLAYWRIGHT_HTML_REPORT: path.join(artifactDir, 'report'),
        PLAYWRIGHT_OUTPUT_DIR: path.join(artifactDir, 'results'),
      },
    });
    await fs.writeFile(
      path.join(artifactDir, 'result.json'),
      JSON.stringify({ scenario, passed: true, baseURL }, null, 2)
    );
  } finally {
    if (appServer && appServerFinished) {
      if (!appServerSettled && appServer.exitCode === null && appServer.signalCode === null) {
        appServer.kill('SIGTERM');
        let timer;
        const stopped = await Promise.race([
          appServerFinished.then(() => true),
          new Promise(resolve => {
            timer = setTimeout(() => resolve(false), 2_000);
          }),
        ]);
        clearTimeout(timer);
        if (!stopped && appServer.exitCode === null && appServer.signalCode === null) {
          appServer.kill('SIGKILL');
        }
      }
      await appServerFinished;
    }
    await serverLog?.close();
    await fixture.close();
  }
}

await fs.mkdir(artifactRoot, { recursive: true });
try {
  for (const scenario of ['full', 'empty']) await runScenario(scenario);
  console.log(`Blog QA passed. Artifacts: ${artifactRoot}`);
} catch (error) {
  await fs.writeFile(path.join(artifactRoot, 'failure.txt'), `${error.stack ?? error}\n`);
  console.error(`Blog QA failed. Artifacts: ${artifactRoot}`);
  process.exitCode = 1;
}
