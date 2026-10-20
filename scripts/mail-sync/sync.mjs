// Pushes mail from Mail.app on this Mac to the desk hub, so mail the Pi can't sign in to (a school
// account, say) shows up there. launchd runs it every 15 minutes (scripts/mail-sync-install.sh).
// It prints counts only, never what an email says.
import { execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = process.env.DESKHUB_MAIL_SYNC || path.join(os.homedir(), '.deskhub', 'mail-sync.json');
const log = (...a) => console.log(new Date().toISOString(), ...a);

const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
// { hub: "http://deskhub.local:8080", token, accounts: [{ mail: "Georgia Tech", name: "School", role: "school" }], lookbackDays, max }
const settings = { lookbackDays: 3, max: 80, sources: 40, sourceMax: 400_000, ...cfg };

function mailIsRunning() { return spawnSync('pgrep', ['-x', 'Mail']).status === 0; }

async function readMail() {
  // Mail has to be running to hold new mail. Start it without bringing it forward.
  if (!mailIsRunning()) {
    log('Mail was closed; opening it in the background');
    spawnSync('open', ['-g', '-j', '-a', 'Mail']);
    for (let i = 0; i < 20 && !mailIsRunning(); i++) await new Promise((r) => setTimeout(r, 1000));
    await new Promise((r) => setTimeout(r, 8000)); // let it load its mailboxes
  }
  const args = JSON.stringify({ accounts: settings.accounts.map((a) => ({ mail: a.mail })), lookbackDays: settings.lookbackDays, max: settings.max, sources: settings.sources, sourceMax: settings.sourceMax });
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', path.join(HERE, 'read-mail.js'), args], { maxBuffer: 200e6, timeout: 240_000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim().split('\n').slice(-2).join(' ')));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Mail returned something unreadable')); }
    });
  });
}

async function push(account, entry) {
  const body = {
    account: account.name || account.mail,
    role: account.role,
    addresses: entry.addresses,
    unread: entry.messages.filter((m) => !m.read).length,
    messages: entry.messages,
  };
  // Keep a push under the hub's size limit by dropping the full copies of the biggest messages first.
  let json = JSON.stringify(body);
  const bySize = [...entry.messages].filter((m) => m.source).sort((a, b) => b.source.length - a.source.length);
  while (json.length > 20e6 && bySize.length) { bySize.shift().source = ''; json = JSON.stringify(body); }
  const res = await fetch(`${settings.hub.replace(/\/$/, '')}/api/mail/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.token}` },
    body: json,
    signal: AbortSignal.timeout(60_000),
  });
  const reply = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`the hub said ${res.status}: ${reply.error || 'no reason given'}`);
  return reply;
}

let failed = false;
try {
  const started = Date.now();
  const read = await readMail();
  for (const entry of read) {
    const account = settings.accounts.find((a) => a.mail === entry.mail);
    if (entry.error) { log(`${entry.mail}: couldn't read it from Mail (${entry.error})`); failed = true; continue; }
    try {
      const reply = await push(account, entry);
      log(`${entry.mail}: ${reply.accepted} messages sent as "${reply.account}", ${reply.unread} unread (${Math.round((Date.now() - started) / 1000)}s)`);
    } catch (err) {
      log(`${entry.mail}: couldn't reach the hub (${err.message})`);
      failed = true;
    }
  }
} catch (err) {
  log(`failed: ${err.message}`);
  failed = true;
}
process.exit(failed ? 1 : 0);
