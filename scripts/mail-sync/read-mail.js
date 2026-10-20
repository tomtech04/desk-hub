// Reads recent mail out of Mail.app, for scripts/mail-sync/sync.mjs. Run with:
//   osascript -l JavaScript read-mail.js '<json>'
// where the JSON is { accounts: [{ mail: "Georgia Tech" }], lookbackDays: 3, max: 80, sources: 40, sourceMax: 400000 }.
// Prints JSON: [{ mail, addresses, messages: [{ messageId, from, subject, date, read, text, source }] }].
// Mail already holds the school sign-in, so nothing here signs in to anything. Nothing is marked read.
function run(argv) {
  const cfg = JSON.parse(argv[0]);
  const Mail = Application('Mail');
  const since = new Date(Date.now() - cfg.lookbackDays * 86400e3);
  const result = [];

  for (const a of cfg.accounts) {
    const entry = { mail: a.mail, addresses: [], messages: [] };
    try {
      const acct = Mail.accounts.byName(a.mail);
      entry.addresses = acct.emailAddresses();
      let box = null;
      for (const name of ['Inbox', 'INBOX']) {
        try { const b = acct.mailboxes.byName(name); b.name(); box = b; break; } catch (e) { /* try the next spelling */ }
      }
      if (!box) throw new Error('no Inbox found in this account');
      try { Mail.checkForNewMail(acct); } catch (e) { /* the account may not support it; Mail fetches on its own anyway */ }

      const recent = box.messages.whose({ dateReceived: { _greaterThan: since } });
      const ids = recent.messageId();
      const senders = recent.sender();
      const subjects = recent.subject();
      const dates = recent.dateReceived();
      const reads = recent.readStatus();

      // Newest first, and only as deep as asked.
      const order = ids.map((_, i) => i).sort((x, y) => dates[y] - dates[x]).slice(0, cfg.max);
      let withSource = 0;
      for (const i of order) {
        const m = recent[i];
        let text = '';
        let source = '';
        try { text = String(m.content() || '').slice(0, 20000); } catch (e) { /* body not downloaded yet */ }
        // The full message (so the hub can show it as it was sent) for the newest unread ones.
        if (!reads[i] && withSource < cfg.sources) {
          try {
            const s = String(m.source() || '');
            if (s.length <= cfg.sourceMax) { source = s; withSource++; }
          } catch (e) { /* skip */ }
        }
        entry.messages.push({ messageId: ids[i], from: senders[i], subject: subjects[i], date: dates[i].toISOString(), read: reads[i], text, source });
      }
    } catch (e) {
      entry.error = String(e).slice(0, 200);
    }
    result.push(entry);
  }
  return JSON.stringify(result);
}
