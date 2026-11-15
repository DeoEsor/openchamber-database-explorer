// Creates Kanban tasks through the official OpenChamber API (127.0.0.1:57123).
// Task format: ~/.config/openchamber/extensions/openchamber-kanban/src/domain/task.ts
const PORT = 57123;
const GUEST = 'kanban-board';

const TASKS = [
  {
    title: 'DB Connect: replace the connections dialog with a dedicated screen',
    description: 'Connection management is currently a dialog above the top-bar selector. Build a full panel screen with connection cards (name, host:port/database), a live status indicator (ping), and latency. Card actions: Connect, Test, Edit, Delete (with confirmation). Include an empty state with an “Add connection” CTA.\nFiles: src/panel/main.js (connections view), src/service/main.js (ping endpoint).\nAcceptance: full CRUD without modal dialogs, with connection status visible immediately.',
  },
  {
    title: 'DB Connect: edit connections (PATCH /connections)',
    description: 'Service: PATCH /connections {id, name?, dsn?} — re-ping before saving when the DSN changes and roll back if it is unavailable. Panel: the “Edit” button on a card opens a form populated with current values.\nFiles: src/service/main.js, src/service/db.js, src/panel/main.js.\nAcceptance: renaming a connection and changing its DSN take effect without restarting OpenChamber.',
  },
  {
    title: 'DB Connect: mask passwords in DSNs',
    description: 'Mask passwords (●●●) in every DSN form and provide an eye button to reveal them. After saving, never display the DSN password in plain text in cards, lists, or history.\nFiles: src/panel/main.js.\nAcceptance: an entered DSN password is hidden on screen by default.',
  },
  {
    title: 'DB Connect: compact top bar with a connection chip',
    description: 'Show the selected connection as a compact chip (status dot + name); clicking it opens the connections screen. Remove the bulky selector from the top bar to free space for ⌘K and tabs.\nFiles: src/panel/main.js.\nAcceptance: the top bar fits on one line, and the current connection is immediately recognizable.',
  },
  {
    title: 'DB Connect: environment groups and labels (local/staging/prod)',
    description: 'Add environment tags to connections with colored dots (local — gray/green, staging — yellow, prod — red), plus filtering or grouping on the connections screen. Store tags in connections.json.\nFiles: src/service/main.js (tags field), src/panel/main.js.\nAcceptance: with 5+ connections, environments are distinguishable at a glance.',
  },
  {
    title: 'DB Connect: onboarding and empty state',
    description: 'When no connections exist, show a welcome message, an “Add your first connection” button, and one-click DSN templates (such as postgres://user:pass@host:5432/db).\nFiles: src/panel/main.js.\nAcceptance: a new user can connect to a database within 30 seconds.',
  },
  {
    title: 'DB Connect: live connection status and clear errors',
    description: 'Status bar: connection indicator, automatic checks when the panel opens and when requests fail, and human-readable messages instead of raw driver errors (for example, stopped Postgres → “Cannot connect to host:port; check that the database is running”).\nFiles: src/panel/main.js (status bar, failureKey mapping).\nAcceptance: a dropped connection is immediately visible and easy to understand.',
  },
  {
    title: 'DB Connect: polish the panel UI (Beekeeper style)',
    description: 'Refine density, spacing, typography, and status contrast following the Beekeeper philosophy (minimalism as a value). Test both the narrow panel (320px) and fullscreen mode.\nFiles: src/panel/main.js (CSS using --oc-* tokens).\nAcceptance: the panel matches the visual quality of the docker/kanban extensions.',
  },
];

const b36 = (n) => n.toString(36);
const rid = () => Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
const now = Date.now();

async function storage(body) {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/guests/${GUEST}/storage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

const existing = new Set();
const keysRes = await storage({ op: 'keys' });
for (const k of keysRes.keys ?? []) {
  if (!k.startsWith('task:')) continue;
  const t = await storage({ op: 'get', key: k });
  if (t.found && t.value?.title) existing.add(t.value.title);
}

let created = 0, skipped = 0;
for (let i = 0; i < TASKS.length; i++) {
  const draft = TASKS[i];
  if (existing.has(draft.title)) { skipped++; continue; }
  const ts = now + i;
  const task = {
    schemaVersion: 1,
    id: `t_${b36(ts)}${rid()}`,
    title: draft.title,
    description: draft.description,
    status: 'backlog',
    rank: (i + 1) * 1024,
    projectId: null,
    sourceBranch: null,
    worktree: null,
    sessionId: null,
    createdAt: new Date(ts).toISOString(),
    updatedAt: new Date(ts).toISOString(),
    needsAttentionSince: null,
  };
  await storage({ op: 'set', key: `task:${task.id}`, value: task });
  created++;
  console.log(`+ ${task.id}  ${task.title}`);
}
console.log(`Done: created ${created}, skipped ${skipped}`);
