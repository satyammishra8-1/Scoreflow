const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

async function main() {
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const profile = path.join(os.tmpdir(), `scoreflow-auth-chrome-${crypto.randomBytes(5).toString('hex')}`);
  const child = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-software-rasterizer',
    '--disable-extensions', '--disable-background-networking', '--no-first-run',
    '--disable-dev-shm-usage', '--remote-debugging-port=9223',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { detached: true, windowsHide: true, stdio: 'ignore' });
  child.unref();
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch('http://127.0.0.1:9223/json/version');
      if (response.ok) {
        console.log(`Chrome remote debugging ready (PID ${child.pid}).`);
        return;
      }
    } catch {}
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  console.error(`Chrome did not start remote debugging (exit ${child.exitCode ?? 'still running'}).`);
  process.exitCode = 1;
}
main().catch(() => { console.error('Chrome startup failed.'); process.exitCode = 1; });
