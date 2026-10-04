// Microsoft 365 mail (e.g. a university account) through Microsoft Graph.
//
// Schools usually block IMAP passwords and outside forwarding, so the hub signs
// in the way a TV app does: it shows a short code, you enter it at
// microsoft.com/devicelogin on your phone, and Microsoft hands the hub a token
// that can only READ mail. The hub never sees the account's password. The
// token is kept on the Pi in data/ms-token.json (readable only by the hub's user).
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './util.js';

const CLIENT_ID = process.env.MS_CLIENT_ID;
// Your organization's domain or tenant id (e.g. gatech.edu). "organizations" works for any work/school account.
const TENANT = process.env.MS_TENANT || 'organizations';
const AUTH = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const SCOPE = 'offline_access Mail.Read';
const TOKEN_FILE = path.join(DATA_DIR, 'ms-token.json');

export const msConfigured = Boolean(CLIENT_ID);

let tok = null;
try { tok = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')); } catch {}
let pending = null; // { code, uri, expiresAt, device, interval }
let lastError = null;
let onConnected = () => {};
export const whenConnected = (fn) => { onConnected = fn; };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function form(url, params) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(20000) });
  return res.json().catch(() => ({ error: `http_${res.status}` }));
}

function save(r) {
  tok = { refresh_token: r.refresh_token || tok?.refresh_token, access_token: r.access_token, expires_at: Date.now() + (r.expires_in || 3600) * 1000 };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tok), { mode: 0o600 });
}

function forget() {
  tok = null;
  try { fs.unlinkSync(TOKEN_FILE); } catch {}
}

/** Begin sign-in. Returns the code to type at the given address. */
export async function startSignIn() {
  if (!CLIENT_ID) throw new Error('Set MS_CLIENT_ID in .env first.');
  const d = await form(`${AUTH}/devicecode`, { client_id: CLIENT_ID, scope: SCOPE });
  if (d.error) throw new Error(d.error_description?.split('\r\n')[0] || d.error);
  pending = { code: d.user_code, uri: d.verification_uri, expiresAt: Date.now() + d.expires_in * 1000, device: d.device_code, interval: d.interval || 5 };
  lastError = null;
  poll();
  return { code: pending.code, uri: pending.uri, expiresAt: pending.expiresAt };
}

async function poll() {
  const mine = pending;
  while (pending === mine && Date.now() < mine.expiresAt) {
    await sleep(mine.interval * 1000);
    const r = await form(`${AUTH}/token`, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: CLIENT_ID, device_code: mine.device }).catch((e) => ({ error: 'network', error_description: e.message }));
    if (pending !== mine) return;
    if (r.access_token) { save(r); pending = null; lastError = null; onConnected(); return; }
    if (r.error === 'authorization_pending' || r.error === 'network') continue;
    if (r.error === 'slow_down') { mine.interval += 5; continue; }
    // Declined, expired, or blocked by the organization ("needs admin approval").
    lastError = r.error_description?.split('\r\n')[0] || r.error;
    pending = null;
    return;
  }
  if (pending === mine) { pending = null; lastError = 'The code expired before it was entered. Try again.'; }
}

export function signOut() { pending = null; lastError = null; forget(); }

export function msStatus() {
  return {
    configured: msConfigured,
    connected: Boolean(tok?.refresh_token),
    pending: pending ? { code: pending.code, uri: pending.uri, expiresAt: pending.expiresAt } : null,
    error: lastError,
  };
}

async function accessToken() {
  if (!tok?.refresh_token) throw new Error('not signed in');
  if (tok.access_token && Date.now() < tok.expires_at - 60e3) return tok.access_token;
  const r = await form(`${AUTH}/token`, { grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: tok.refresh_token, scope: SCOPE });
  if (!r.access_token) {
    // invalid_grant: the sign-in was revoked or expired (password change, 90 days idle).
    if (r.error === 'invalid_grant') { forget(); lastError = 'The Microsoft sign-in expired. Connect again in Settings.'; }
    throw new Error(r.error_description?.split('\r\n')[0] || r.error || 'could not refresh the Microsoft sign-in');
  }
  save(r);
  return tok.access_token;
}

async function graph(pathAndQuery, headers = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${pathAndQuery}`, { headers: { Authorization: `Bearer ${await accessToken()}`, ...headers }, signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error?.message || `Microsoft Graph responded ${res.status}`);
  return body;
}

const LIST = 'id,subject,from,receivedDateTime,isRead,internetMessageId,body';
const asText = { Prefer: 'outlook.body-content-type="text"' };
const iso = (ms) => new Date(ms).toISOString();
const listed = (m) => ({
  graphId: m.id,
  messageId: m.internetMessageId || m.id,
  from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || 'Unknown',
  fromAddress: m.from?.emailAddress?.address || '',
  subject: m.subject || '(no subject)',
  date: m.receivedDateTime || null,
  read: Boolean(m.isRead),
  text: (m.body?.content || '').replace(/\s+/g, ' ').trim(),
});

/** Unread inbox mail since `sinceMs`, newest first, plus the inbox's total unread count. */
export async function graphUnread(sinceMs, max) {
  const filter = encodeURIComponent(`receivedDateTime ge ${iso(sinceMs)} and isRead eq false`);
  const [folder, list] = await Promise.all([
    graph('/me/mailFolders/inbox?$select=unreadItemCount'),
    graph(`/me/mailFolders/inbox/messages?$filter=${filter}&$orderby=receivedDateTime desc&$top=${max}&$select=${LIST}`, asText),
  ]);
  return { unread: folder.unreadItemCount || 0, messages: list.value.map(listed) };
}

/** Everything in the inbox since `sinceMs`, read or not (for the daily digest). */
export async function graphRecent(sinceMs, max) {
  const filter = encodeURIComponent(`receivedDateTime ge ${iso(sinceMs)}`);
  const list = await graph(`/me/mailFolders/inbox/messages?$filter=${filter}&$orderby=receivedDateTime desc&$top=${max}&$select=${LIST}`, asText);
  return list.value.map(listed);
}

/** One message in full: HTML as sent, with inline images embedded. Reading via Graph doesn't mark it read. */
export async function graphFull(graphId) {
  const m = await graph(`/me/messages/${encodeURIComponent(graphId)}?$select=subject,from,toRecipients,receivedDateTime,body,hasAttachments`);
  let html = m.body?.contentType === 'html' ? m.body.content || '' : '';
  const plain = m.body?.contentType === 'text' ? m.body.content || '' : '';
  const names = [];
  if (m.hasAttachments || html.includes('cid:')) {
    const att = await graph(`/me/messages/${encodeURIComponent(graphId)}/attachments`).catch(() => ({ value: [] }));
    for (const a of att.value) {
      if (a.isInline && a.contentId && a.contentBytes && a.contentBytes.length < 4_000_000) {
        html = html.split(`cid:${a.contentId}`).join(`data:${a.contentType};base64,${a.contentBytes}`);
      } else if (a.name) names.push(a.name);
    }
  }
  return {
    from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || 'Unknown',
    fromAddress: m.from?.emailAddress?.address || '',
    to: (m.toRecipients || []).map((t) => t.emailAddress?.name || t.emailAddress?.address).filter(Boolean).slice(0, 6),
    subject: m.subject || '(no subject)',
    date: m.receivedDateTime || null,
    html: html.length > 6_000_000 ? '' : html,
    plain,
    attachments: names.slice(0, 10),
  };
}
