// Imports DB Connect tasks into the OpenChamber Kanban board.
// HOW TO USE:
//   1) In OpenChamber, open the fullscreen “Kanban board” page.
//   2) Open DevTools (Cmd+Opt+I) → Console tab.
//   3) Paste the entire contents of this file and press Enter.
//   4) Reload the Kanban page; the cards will appear in Backlog.
// Idempotent: skips tasks whose titles already exist.
(async () => {
  const CH = 'openchamber.sdk', V = 1;
  let seq = 0;
  const pending = new Map();
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return;
    const m = e.data;
    if (!m || m.channel !== CH || m.v !== V || typeof m.id !== 'string') return;
    const w = pending.get(m.id);
    if (!w) return;
    clearTimeout(w.timer);
    pending.delete(m.id);
    if (m.ok) w.resolve(m.payload);
    else w.reject(new Error((m.code || 'ERR') + ': ' + (m.error || 'request failed')));
  });
  const send = (type, payload) => new Promise((resolve, reject) => {
    const id = 'inj-' + Date.now().toString(36) + '-' + (++seq);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('HOST_TIMEOUT ' + type)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    window.parent.postMessage({ channel: CH, v: V, type, id, payload }, '*');
  });
  const storage = (payload) => send('storage', payload);
  const sget = async (key) => { const r = await storage({ op: 'get', key }); return r && r.found ? r.value : undefined; };

  const TASKS = [
    {
      title: 'DB Connect: replace the connections dialog with a dedicated screen',
      description: 'Connection management is currently a dialog above the top-bar selector. Build a full panel screen with connection cards (name, host:port/database), a live status indicator (ping), and latency. Card actions: Connect, Test, Edit, Delete (with confirmation). Include an empty state with an “Add connection” CTA.\nFiles: src/panel/main.js (connections view), src/service/main.js (ping endpoint).\nAcceptance: full CRUD without modal dialogs, with connection status visible immediately.'
    },
    {
      title: 'DB Connect: edit connections (PATCH /connections)',
      description: 'Service: PATCH /connections {id, name?, dsn?} — re-ping before saving when the DSN changes and roll back if it is unavailable. Panel: the “Edit” button on a card opens a form populated with current values.\nFiles: src/service/main.js, src/service/db.js, src/panel/main.js.\nAcceptance: renaming a connection and changing its DSN take effect without restarting OpenChamber.'
    },
    {
      title: 'DB Connect: mask passwords in DSNs',
      description: 'Mask passwords (●●●) in every DSN form and provide an eye button to reveal them. After saving, never display the DSN password in plain text in cards, lists, or history.\nFiles: src/panel/main.js.\nAcceptance: an entered DSN password is hidden on screen by default.'
    },
    {
      title: 'DB Connect: compact top bar with a connection chip',
      description: 'Show the selected connection as a compact chip (status dot + name); clicking it opens the connections screen. Remove the bulky selector from the top bar to free space for ⌘K and tabs.\nFiles: src/panel/main.js.\nAcceptance: the top bar fits on one line, and the current connection is immediately recognizable.'
    },
    {
      title: 'DB Connect: environment groups and labels (local/staging/prod)',
      description: 'Add environment tags to connections with colored dots (local — gray/green, staging — yellow, prod — red), plus filtering or grouping on the connections screen. Store tags in connections.json.\nFiles: src/service/main.js (tags field), src/panel/main.js.\nAcceptance: with 5+ connections, environments are distinguishable at a glance.'
    },
    {
      title: 'DB Connect: onboarding and empty state',
      description: 'When no connections exist, show a welcome message, an “Add your first connection” button, and one-click DSN templates (such as postgres://user:pass@host:5432/db).\nFiles: src/panel/main.js.\nAcceptance: a new user can connect to a database within 30 seconds.'
    },
    {
      title: 'DB Connect: live connection status and clear errors',
      description: 'Status bar: connection indicator, automatic checks when the panel opens and when requests fail, and human-readable messages instead of raw driver errors (for example, stopped Postgres → “Cannot connect to host:port; check that the database is running”).\nFiles: src/panel/main.js (status bar, failureKey mapping).\nAcceptance: a dropped connection is immediately visible and easy to understand.'
    },
    {
      title: 'DB Connect: polish the panel UI (Beekeeper style)',
      description: 'Refine density, spacing, typography, and status contrast following the Beekeeper philosophy (minimalism as a value). Test both the narrow panel (320px) and fullscreen mode.\nFiles: src/panel/main.js (CSS using --oc-* tokens).\nAcceptance: the panel matches the visual quality of the docker/kanban extensions.'
    }
  ];

  const keysRes = await storage({ op: 'keys' });
  const keys = (keysRes && keysRes.keys) || [];
  const existing = [];
  for (const k of keys) {
    if (!k.startsWith('task:')) continue;
    const t = await sget(k);
    if (t && typeof t.title === 'string') existing.push(t);
  }
  const have = new Set(existing.map((t) => t.title));
  let base = 0;
  for (const t of existing) if (typeof t.rank === 'number' && t.rank > base) base = t.rank;

  const rand = () => Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();
  let created = 0, rank = base;
  for (const draft of TASKS) {
    if (have.has(draft.title)) continue;
    rank += 1024;
    const id = 't_' + Date.now().toString(36) + rand();
    const task = {
      schemaVersion: 1, id,
      title: draft.title, description: draft.description,
      status: 'backlog', rank,
      projectId: null, sourceBranch: null, worktree: null, sessionId: null,
      createdAt: now, updatedAt: now, needsAttentionSince: null
    };
    await storage({ op: 'set', key: 'task:' + id, value: task });
    created++;
  }
  console.log('DB Connect: created ' + created + ' tasks, skipped ' + (TASKS.length - created) + ' (already existing). Reload the Kanban page.');
})().catch((e) => console.error('DB Connect import failed:', e && e.message ? e.message : e));
