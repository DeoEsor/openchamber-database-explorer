// DB Connect panel: PostgreSQL, MongoDB and Redis explorer.
import { connectHost, HostRequestError } from "@openchamber/sdk";
import { applyHostReady, GUEST_UI_LOOK_CSS } from "@openchamber/sdk/ui";

const host = connectHost();

// ---------- service client ----------

class ServiceError extends Error {}

const FAILURE_TEXT = {
  needsApproval: "Allow the DB Connect service in Settings → Extensions.",
  paused: "The DB Connect extension is disabled in Settings.",
  failed: "The DB Connect service crashed. It will restart on the next refresh.",
  unreachable: "Could not reach the DB Connect service.",
};

const failureKey = (error) => {
  if (!(error instanceof HostRequestError)) return null;
  if (error.code === "NO_SERVICE" || error.code === "NOT_GRANTED") return "needsApproval";
  if (error.code === "DISABLED") return "paused";
  if (error.code === "SERVICE_FAILED") return "failed";
  return "unreachable";
};

async function svc(method, path, { query, body } = {}) {
  let result;
  try {
    result = await host.serviceRequest({
      method,
      path,
      query,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    const key = failureKey(error);
    throw key ? new ServiceError(FAILURE_TEXT[key]) : error;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(result.body);
  } catch {
    // handled below
  }
  if (result.status !== 200) {
    const message = parsed && typeof parsed.error === "string" ? parsed.error : `The service returned status ${result.status}.`;
    throw new ServiceError(message);
  }
  if (parsed === null) throw new ServiceError("The service returned an unexpected response.");
  return parsed;
}

// ---------- state ----------

const state = {
  conns: [],
  connId: null,
  tab: "tree", // tree = table / structure, sql = console
  mode: "tree", // tree = no active table, data = table open
  tableView: "data", // data | structure
  openTables: [],
  sqlOpen: false,
  explorerVisible: true,
  schemas: [],
  treeReady: false,
  filter: "",
  expanded: new Set(),
  table: null, // active openTables item: { schema, name, page, filter }
  sql: "",
  sqlResult: null,
  sqlBusy: false,
  sqlRunId: 0,
  batchBusy: false,
  history: [],
  pgVersion: null,
  viewMode: "table", // table | json | text
  sqlViewMode: "table",
  colsPrefs: {}, // "conn:schema.table" -> { hidden: [], widths: {} }
  pending: new Map(), // staged edits for the open table
  pendingFor: null, // "schema.table" the pending edits belong to
};

const DB_TYPES = {
  postgres: { label: "PostgreSQL", short: "PG", placeholder: "postgres://user:pass@127.0.0.1:5432/db" },
  mongodb: { label: "MongoDB", short: "MG", placeholder: "mongodb://user:pass@127.0.0.1:27017/db" },
  redis: { label: "Redis", short: "RD", placeholder: "redis://:password@127.0.0.1:6379/0" },
};
const currentConnection = () => state.conns.find((c) => c.id === state.connId) ?? null;
const currentKind = () => currentConnection()?.kind ?? "postgres";
const isPostgres = () => currentKind() === "postgres";
const objectKindLabel = (kind) => ({ view: "VIEW", matview: "MV", collection: "COLL", keys: "KEYS", partitioned: "PART" })[kind];

// ---------- helpers ----------

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const esc = (v) => (v === null || v === undefined ? "" : String(v));
const NULL_TEXT = "∅";
const SEP = "␟"; // separator for composite pending keys

/** Readable rendering for "interesting" cell values: JSON objects/arrays, long or multiline text. */
const prettyValue = (raw) => {
  if (raw === null || raw === undefined) return null;
  const s = String(raw);
  if (/^\s*[[{]/.test(s)) {
    try {
      return { text: JSON.stringify(JSON.parse(s), null, 2), isJson: true };
    } catch {
      /* not JSON after all */
    }
  }
  if (s.length > 60 || s.includes("\n")) return { text: s, isJson: false };
  return null;
};

const toast = (kind, message) => host.toast({ kind, message }).catch(() => {});

/** The currently open dialog's body element, so action buttons can read its inputs. */
let dialogBodyRef = null;

// ---------- type badges ----------

const TYPE_BADGE = [
  [/^(boolean|bool)/, "✓", "--oc-info"],
  [/^uuid/, "#", "--oc-warning"],
  [/json/, "{}", "--oc-success"],
  [/(date|time)\b|timestamp/, "◷", "--oc-warning"],
  [/(bigint|smallint|integer|int|serial|oid)/, "12", "--oc-primary-text"],
  [/(numeric|decimal|real|double|float|money)/, "π", "--oc-primary-text"],
  [/(text|char|varchar|name)/, "Aa", "--oc-muted"],
];

function typeBadge(type) {
  const t = String(type ?? "").toLowerCase();
  const [, glyph, color] = TYPE_BADGE.find(([re]) => re.test(t)) ?? [null, "?", "--oc-subtle"];
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 14 14");
  svg.classList.add("tbadge");
  const text = document.createElementNS(NS, "text");
  text.setAttribute("x", "7");
  text.setAttribute("y", "10.5");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-size", "9");
  text.setAttribute("fill", `var(${color}, currentColor)`);
  text.textContent = glyph;
  svg.appendChild(text);
  return svg;
}

const typeClass = (type) => {
  const t = String(type ?? "").toLowerCase();
  if (/^(boolean|bool)/.test(t)) return "bool";
  if (/^(int|bigint|smallint|numeric|decimal|real|double|float|serial|money|oid)/.test(t)) return "num";
  if (/^uuid/.test(t)) return "uuid";
  return "";
};

const uuidShort = (s) => (s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s);

// ---------- styles ----------

const CSS = `
${GUEST_UI_LOOK_CSS}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { font: 12px/1.4 var(--oc-font, system-ui, sans-serif); color: var(--oc-fg, #eee); background: var(--oc-bg, #1e1e1e); }
button, input, select, textarea { font-family: inherit; }
button { -webkit-tap-highlight-color: transparent; }
#root { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; }

.topbar {
  flex: none; min-height: 40px; display: flex; gap: 8px; align-items: center; padding: 0 8px;
  border-bottom: 1px solid var(--oc-border, #2a2a2a); background: var(--oc-elevated, #262626);
}
.brand { display: flex; align-items: center; gap: 7px; min-width: 0; }
.brand-toggle {
  display: flex; align-items: center; justify-content: center; width: 25px; height: 25px; padding: 0;
  border: 0; border-radius: 4px; background: transparent; color: var(--oc-primary-text, #9dc1ff); cursor: pointer;
}
.brand-toggle:hover { background: var(--oc-hover, #303030); }
.brand-name { font-weight: 650; white-space: nowrap; letter-spacing: -.01em; }
.app-path { color: var(--oc-muted, #888); font: 10.5px/1.3 var(--oc-mono, ui-monospace, monospace); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.topbar .spacer { flex: 1; }
.top-actions { display: flex; gap: 3px; align-items: center; }
.iconbtn {
  border: 1px solid transparent; background: transparent; color: var(--oc-muted, #aaa);
  border-radius: 4px; padding: 3px 6px; cursor: pointer; font: inherit; font-size: 11px; white-space: nowrap;
}
.iconbtn:hover { background: var(--oc-hover, #303030); border-color: var(--oc-border, #3a3a3a); color: var(--oc-fg, #eee); }
.iconbtn.danger:hover { color: var(--oc-error, #f66); border-color: var(--oc-error, #f66); }
.iconbtn[disabled] { opacity: .45; cursor: default; }
.iconbtn.active { color: var(--oc-primary-text, #9dc1ff); background: color-mix(in srgb, var(--oc-primary, #4c8dff) 12%, transparent); }

.workbench { flex: 1; min-height: 0; display: flex; overflow: hidden; }
.sidebar {
  flex: none; width: clamp(155px, 31%, 220px); min-width: 0; display: flex; flex-direction: column;
  border-right: 1px solid var(--oc-border, #2a2a2a); background: color-mix(in srgb, var(--oc-elevated, #262626) 58%, var(--oc-bg, #1e1e1e));
}
#root.explorer-hidden .sidebar { display: none; }
.connection-picker {
  display: flex; align-items: center; gap: 7px; margin: 7px 7px 5px; padding: 6px 7px; min-width: 0;
  text-align: left; border: 1px solid var(--oc-border, #333); border-radius: 5px; cursor: pointer;
  background: var(--oc-elevated, #262626); color: var(--oc-fg, #eee);
}
.connection-picker:hover { border-color: var(--oc-primary, #4c8dff); }
.connection-picker .dbicon { flex: none; color: var(--oc-primary-text, #9dc1ff); display: flex; }
.connection-picker .conn-copy { flex: 1; min-width: 0; }
.connection-picker .conn-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; font-size: 11.5px; }
.connection-picker .conn-detail { display: block; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--oc-muted, #888); font: 9.5px/1.3 var(--oc-mono, ui-monospace, monospace); }
.connection-picker .chevron { flex: none; color: var(--oc-muted, #888); font-size: 9px; }
.online { display: inline-block; flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--oc-success, #3fb950); }
.explorer-head { display: flex; align-items: center; gap: 4px; min-height: 29px; padding: 0 6px 0 10px; color: var(--oc-muted, #999); }
.explorer-head .section-title { flex: 1; font-size: 9.5px; font-weight: 650; letter-spacing: .09em; text-transform: uppercase; }
.explorer-view { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.workspace { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }

.object-tabs { flex: none; display: flex; align-items: stretch; min-height: 32px; overflow-x: auto; border-bottom: 1px solid var(--oc-border, #2a2a2a); background: var(--oc-elevated, #262626); }
.objtab {
  flex: none; display: flex; align-items: center; gap: 6px; max-width: 190px; padding: 0 8px;
  border: 0; border-right: 1px solid var(--oc-border, #2a2a2a); border-bottom: 2px solid transparent;
  background: transparent; color: var(--oc-muted, #999); cursor: pointer; font: inherit; font-size: 11px;
}
.objtab:hover { background: var(--oc-hover, #303030); color: var(--oc-fg, #eee); }
.objtab.on { color: var(--oc-fg, #eee); background: var(--oc-bg, #1e1e1e); border-bottom-color: var(--oc-primary, #4c8dff); }
.objtab .objicon { color: var(--oc-primary-text, #9dc1ff); }
.objtab .objname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.objtab .objschema { color: var(--oc-subtle, #777); font-size: 9.5px; }
.objtab .objclose { border: 0; background: transparent; color: var(--oc-subtle, #777); padding: 0 1px; cursor: pointer; font-size: 13px; }
.objtab .objclose:hover { color: var(--oc-error, #f66); }
.objtab.new { width: 31px; justify-content: center; padding: 0; font-size: 15px; }
.workspace-tabs { flex: none; display: flex; gap: 2px; align-items: center; min-height: 31px; padding: 3px 6px; border-bottom: 1px solid var(--oc-border, #2a2a2a); }
.wtab {
  border: 0; border-radius: 4px; background: transparent; color: var(--oc-muted, #999); cursor: pointer;
  padding: 4px 9px; font: inherit; font-size: 11px;
}
.wtab:hover { color: var(--oc-fg, #eee); background: var(--oc-hover, #303030); }
.wtab.on { color: var(--oc-primary-text, #9dc1ff); background: color-mix(in srgb, var(--oc-primary, #4c8dff) 14%, transparent); }
.wtab[disabled] { opacity: .4; cursor: default; }
.workspace-tabs .hint { margin-left: auto; color: var(--oc-subtle, #777); font-size: 9.5px; white-space: nowrap; }

.view { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.banner { flex: none; margin: 0; padding: 7px 9px; font-size: 11px; border-radius: 0; }
.banner.error { background: color-mix(in srgb, var(--oc-error, #e5534b) 14%, transparent); color: var(--oc-error-text, #f88); border-bottom: 1px solid color-mix(in srgb, var(--oc-error, #e5534b) 35%, transparent); }
.banner.info { background: color-mix(in srgb, var(--oc-primary, #4c8dff) 12%, transparent); color: var(--oc-primary-text, #9dc1ff); border-bottom: 1px solid color-mix(in srgb, var(--oc-primary, #4c8dff) 30%, transparent); }

.search { flex: none; position: relative; margin: 2px 6px 4px; }
.search::before { content: "⌕"; position: absolute; left: 7px; top: 4px; color: var(--oc-subtle, #777); pointer-events: none; }
.search input {
  width: 100%; padding: 4px 7px 4px 23px; border-radius: 4px; font-size: 11px;
  border: 1px solid var(--oc-border, #333); background: var(--oc-bg, #1e1e1e); color: var(--oc-fg, #eee);
}
.search input:focus { outline: 1px solid var(--oc-focus, #4c8dff); }
.search input::placeholder { color: var(--oc-subtle, #777); }
.scroll { flex: 1; min-height: 0; overflow: auto; padding: 0 3px 8px; }
.dbroot { display: flex; align-items: center; gap: 6px; min-height: 27px; padding: 3px 7px; font-weight: 600; }
.dbroot .dbname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dbroot .dbcount { margin-left: auto; color: var(--oc-subtle, #777); font-size: 9.5px; font-weight: 400; }
.schema { margin: 0; }
.schema > .head {
  display: flex; align-items: center; gap: 5px; min-height: 25px; padding: 2px 6px; cursor: pointer; border-radius: 3px;
  color: var(--oc-fg, #ddd); font-weight: 500; user-select: none;
}
.schema > .head:hover { background: var(--oc-hover, #2c2c2c); }
.schema .chev { width: 10px; color: var(--oc-muted, #888); transition: transform .12s; font-size: 9px; }
.schema.open .chev { transform: rotate(90deg); }
.schema .schemaicon { color: var(--oc-warning, #d29922); }
.schema .count { margin-left: auto; color: var(--oc-subtle, #777); font-weight: 400; font-size: 9.5px; }
.trow {
  display: flex; align-items: center; gap: 6px; min-height: 25px; padding: 2px 6px 2px 27px; cursor: pointer;
  border-radius: 3px; color: var(--oc-fg, #ccc);
}
.trow:hover { background: var(--oc-hover, #2c2c2c); }
.trow.on { color: var(--oc-primary-text, #9dc1ff); background: color-mix(in srgb, var(--oc-primary, #4c8dff) 14%, transparent); }
.trow .tableicon { flex: none; color: var(--oc-info, #58a6ff); }
.trow .tname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trow .tmeta { margin-left: auto; color: var(--oc-subtle, #777); font-size: 9.5px; white-space: nowrap; }
.trow .kind { color: var(--oc-info, #58a6ff); font-size: 8px; border-radius: 3px; padding: 0 3px; border: 1px solid color-mix(in srgb, var(--oc-info, #58a6ff) 35%, transparent); }

.databar { flex: none; display: flex; align-items: center; gap: 4px; min-height: 34px; padding: 4px 6px; flex-wrap: wrap; border-bottom: 1px solid var(--oc-border, #2a2a2a); }
.databar .crumb { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.databar .total { color: var(--oc-muted, #888); font-size: 10px; }
.databar .spacer { flex: 1; }
.pager { display: flex; align-items: center; gap: 4px; color: var(--oc-muted, #888); font-size: 10px; white-space: nowrap; }
.pager .iconbtn { padding: 1px 6px; }
.datafoot { flex: none; min-height: 27px; display: flex; align-items: center; gap: 8px; padding: 3px 7px; border-top: 1px solid var(--oc-border, #2a2a2a); color: var(--oc-muted, #888); font-size: 10px; }
.datafoot .spacer { flex: 1; }
.datafoot .notice { color: var(--oc-warning, #d29922); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.seg { display: flex; border: 1px solid var(--oc-border, #333); border-radius: 4px; overflow: hidden; }
.seg button { border: 0; background: transparent; color: var(--oc-muted, #999); font: inherit; font-size: 10px; padding: 2px 6px; cursor: pointer; }
.seg button.on { background: color-mix(in srgb, var(--oc-primary, #4c8dff) 18%, transparent); color: var(--oc-fg, #eee); }
.pend { display: flex; align-items: center; gap: 4px; color: var(--oc-warning, #d29922); font-size: 10px; }
.pend .dotp { width: 6px; height: 6px; border-radius: 50%; background: var(--oc-warning, #d29922); }
.fbar { flex: none; display: flex; gap: 4px; align-items: center; padding: 4px 6px; flex-wrap: wrap; border-bottom: 1px solid var(--oc-border, #2a2a2a); background: color-mix(in srgb, var(--oc-elevated, #262626) 55%, transparent); }
.fbar select, .fbar input { padding: 3px 5px; border-radius: 4px; border: 1px solid var(--oc-border, #333); background: var(--oc-elevated, #262626); color: var(--oc-fg, #eee); font: inherit; font-size: 10.5px; max-width: 125px; }
.fbar input { flex: 1; min-width: 60px; }
.fbar .lbl { color: var(--oc-muted, #888); font-size: 10px; }
.gridwrap { flex: 1; min-height: 0; overflow: auto; margin: 0; border: 0; border-radius: 0; }
table.grid { border-collapse: collapse; width: 100%; font: 10.5px/1.45 var(--oc-mono, ui-monospace, monospace); }
.grid th {
  position: sticky; top: 0; z-index: 1; text-align: left; padding: 4px 7px; white-space: nowrap; cursor: pointer;
  background: var(--oc-elevated, #262626); color: var(--oc-muted, #aaa); border-right: 1px solid color-mix(in srgb, var(--oc-border, #333) 55%, transparent); border-bottom: 1px solid var(--oc-border, #333);
}
.grid th .arr { color: var(--oc-primary, #4c8dff); margin-left: 3px; }
.grid th .rs { position: absolute; top: 0; right: -3px; width: 7px; height: 100%; cursor: col-resize; z-index: 2; }
.grid td { padding: 3px 7px; border-right: 1px solid color-mix(in srgb, var(--oc-border, #2a2a2a) 35%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--oc-border, #2a2a2a) 55%, transparent); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grid tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--oc-fg, #fff) 2.5%, transparent); }
.grid tr:hover td { background: var(--oc-hover, #2c2c2c); }
.grid.stick th:nth-child(1), .grid.stick td:nth-child(1) { position: sticky; left: 0; z-index: 1; }
.grid.stick th:nth-child(1) { z-index: 3; }
.grid.stick td:nth-child(1) { background: var(--oc-bg, #1e1e1e); }
.grid.stick tbody tr:nth-child(even) td:nth-child(1) { background: color-mix(in srgb, var(--oc-fg, #fff) 2.5%, var(--oc-bg, #1e1e1e)); }
.grid.stick tr:hover td:nth-child(1) { background: var(--oc-hover, #2c2c2c); }
.grid td.null { color: var(--oc-subtle, #666); font-style: italic; }
.grid td.num { text-align: right; font-variant-numeric: tabular-nums; }
.grid td.uuid { color: var(--oc-muted, #999); }
.grid td .boolpill {
  display: inline-block; min-width: 18px; text-align: center; border-radius: 4px; font-size: 10px; padding: 0 4px;
  border: 1px solid color-mix(in srgb, var(--oc-info, #58a6ff) 40%, transparent); color: var(--oc-info, #58a6ff);
}
.grid td .boolpill.f { border-color: color-mix(in srgb, var(--oc-muted, #888) 40%, transparent); color: var(--oc-muted, #888); }
.grid td.editable { cursor: text; }
.grid td.editable:hover { color: var(--oc-primary-text, #9dc1ff); }
.grid td.viewable { cursor: pointer; }
.grid td.viewable:hover { color: var(--oc-primary-text, #9dc1ff); }
.grid td.pending { box-shadow: inset 0 0 0 1px var(--oc-warning, #d29922); border-radius: 3px; }
.grid td.pending-del { box-shadow: inset 0 0 0 1px var(--oc-error, #e5534b); border-radius: 3px; }
.grid td.pending-del, .grid tr.pending-del td { color: var(--oc-error-text, #f88); text-decoration: line-through; }
.grid td.rowact { width: 44px; padding: 0 4px; text-align: center; white-space: nowrap; }
.grid td.rowact button {
  border: 0; background: transparent; color: var(--oc-subtle, #666); cursor: pointer; font-size: 12px; padding: 2px 4px; border-radius: 4px;
}
.grid td.rowact button:hover { color: var(--oc-error, #f66); background: color-mix(in srgb, var(--oc-error, #e5534b) 12%, transparent); }
.grid td.rowact button.inspect:hover { color: var(--oc-primary-text, #9dc1ff); background: color-mix(in srgb, var(--oc-primary, #4c8dff) 12%, transparent); }

.jsonview { flex: 1; min-height: 0; overflow: auto; margin: 0; padding: 5px; display: flex; flex-direction: column; gap: 5px; }
.jsonview .jrow { border: 1px solid var(--oc-border, #2a2a2a); border-radius: 4px; overflow: hidden; }
.jsonview .jhead { padding: 4px 8px; font-size: 10px; color: var(--oc-muted, #999); background: color-mix(in srgb, var(--oc-fg, #fff) 4%, transparent); cursor: pointer; user-select: none; }
.jsonview .jbody { margin: 0; padding: 7px 8px; overflow: auto; max-height: 300px; white-space: pre-wrap; word-break: break-word; font: 10.5px/1.5 var(--oc-mono, ui-monospace, monospace); }

.textview { flex: 1; min-height: 0; overflow: auto; margin: 0; padding: 8px; white-space: pre; font: 10.5px/1.5 var(--oc-mono, ui-monospace, monospace); border: 0; border-radius: 0; }

.sqlbox { display: flex; flex-direction: column; flex: 1; min-height: 0; position: relative; }
.chips { flex: none; display: flex; gap: 3px; flex-wrap: wrap; padding: 3px 6px; border-bottom: 1px solid var(--oc-border, #2a2a2a); }
.chips button { border: 0; background: transparent; color: var(--oc-muted, #999); border-radius: 3px; padding: 2px 5px; font: inherit; font-size: 9.5px; cursor: pointer; }
.chips button:hover { color: var(--oc-primary-text, #9dc1ff); background: var(--oc-hover, #303030); }
.editor { position: relative; flex: none; margin: 0; height: 31%; min-height: 95px; border: 0; border-bottom: 1px solid var(--oc-border, #333); border-radius: 0; background: var(--oc-elevated, #262626); overflow: hidden; }
.editor:focus-within { outline: 1px solid var(--oc-focus, #4c8dff); outline-offset: -1px; }
.editor pre, .editor textarea {
  margin: 0; border: 0; padding: 8px 10px; font: 11px/1.55 var(--oc-mono, ui-monospace, monospace);
  white-space: pre-wrap; word-break: break-word; overflow: auto; min-height: 0; max-height: none; height: 100%;
}
.editor pre { position: absolute; inset: 0; pointer-events: none; color: var(--oc-fg, #eee); }
.editor textarea { position: relative; width: 100%; resize: none; background: transparent; color: transparent; caret-color: var(--oc-fg, #eee); }
.editor textarea::selection { background: color-mix(in srgb, var(--oc-primary, #4c8dff) 30%, transparent); }
.sql-hl .sk { color: var(--oc-primary-text, #9dc1ff); }
.sql-hl .ss { color: var(--oc-success, #3fb950); }
.sql-hl .sn { color: var(--oc-warning, #d29922); }
.sql-hl .sc { color: var(--oc-subtle, #777); font-style: italic; }
.ac {
  position: absolute; z-index: 30; max-height: 180px; overflow: auto; min-width: 180px;
  background: var(--oc-elevated, #262626); border: 1px solid var(--oc-border, #3a3a3a); border-radius: var(--oc-radius, 8px);
  box-shadow: 0 8px 24px rgb(0 0 0 / .4); padding: 4px;
}
.ac .aci { padding: 3px 8px; border-radius: 6px; cursor: pointer; font: 12px/1.4 var(--oc-mono, ui-monospace, monospace); display: flex; gap: 8px; }
.ac .aci .k { color: var(--oc-subtle, #777); font-size: 10px; margin-left: auto; }
.ac .aci.sel, .ac .aci:hover { background: color-mix(in srgb, var(--oc-primary, #4c8dff) 16%, transparent); }

.sqlmeta { color: var(--oc-muted, #888); font-size: 10px; padding: 0; }
.hist { flex: none; max-height: 105px; overflow: auto; border-top: 1px solid var(--oc-border, #2a2a2a); margin-top: 0; padding-top: 3px; }
.hist .hhead { color: var(--oc-muted, #888); font-size: 9.5px; padding: 2px 8px; }
.hitem { display: flex; gap: 7px; padding: 2px 8px; cursor: pointer; font: 9.5px/1.4 var(--oc-mono, ui-monospace, monospace); color: var(--oc-fg, #ccc); }
.hitem:hover { background: var(--oc-hover, #2c2c2c); }
.hitem .hsql { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.hitem .k { color: var(--oc-warning, #d29922); }
.hitem .k.ro { color: var(--oc-success, #3fb950); }

.overlay { position: absolute; inset: 0; background: color-mix(in srgb, black 45%, transparent); display: flex; align-items: center; justify-content: center; z-index: 20; padding: 16px; }
.dialog {
  width: 100%; max-width: 420px; max-height: 90%; overflow: auto; display: flex; flex-direction: column; gap: 10px;
  background: var(--oc-elevated, #262626); border: 1px solid var(--oc-border, #3a3a3a); border-radius: calc(var(--oc-radius, 8px) + 3px);
  padding: 14px; box-shadow: 0 12px 30px rgb(0 0 0 / .4);
}
.dialog.connection-dialog { max-width: 680px; }
.dialog.connection-dialog > h3 { padding-bottom: 10px; border-bottom: 1px solid var(--oc-border, #333); }
.connection-create { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 18px; }
.dbtype-tabs { display: flex; flex-direction: column; gap: 3px; padding-right: 12px; border-right: 1px solid var(--oc-border, #333); }
.dbtype-tabs .dbtype {
  display: flex; align-items: center; gap: 8px; padding: 7px 8px; text-align: left;
  border: 0; border-radius: 6px; background: transparent; color: var(--oc-muted, #999); cursor: pointer; font: inherit;
}
.dbtype-tabs .dbtype:hover { background: var(--oc-hover, #303030); color: var(--oc-fg, #eee); }
.dbtype-tabs .dbtype.on { color: var(--oc-primary-text, #9dc1ff); background: color-mix(in srgb, var(--oc-primary, #4c8dff) 14%, transparent); box-shadow: inset 2px 0 0 var(--oc-primary, #4c8dff); }
.dbtype .dbmonogram { display: grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--oc-border, #3a3a3a); border-radius: 5px; font: 600 9px var(--oc-mono, monospace); }
.connection-form { min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.connection-form .form-title { margin: 0; font-weight: 650; }
.connection-form .form-note { margin: -5px 0 2px; }
.dialog h3 { margin: 0; font-size: 13px; }
.dialog p { margin: 0; color: var(--oc-muted, #999); font-size: 12px; }
.dialog label.fld { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--oc-muted, #999); }
.dialog input[type=text], .dialog input:not([type]) {
  padding: 5px 8px; border-radius: var(--oc-radius, 8px); border: 1px solid var(--oc-border, #333);
  background: var(--oc-bg, #1e1e1e); color: var(--oc-fg, #eee); font: 12px/1.4 var(--oc-mono, ui-monospace, monospace);
}
.dialog input:focus { outline: 1px solid var(--oc-focus, #4c8dff); }
.dialog .acts { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.btn {
  border: 1px solid var(--oc-border, #3a3a3a); background: var(--oc-bg, #1e1e1e); color: var(--oc-fg, #eee);
  border-radius: var(--oc-radius, 8px); padding: 5px 12px; cursor: pointer; font: inherit;
}
.btn:hover { background: var(--oc-hover, #303030); }
.btn.primary { background: var(--oc-primary, #4c8dff); color: var(--oc-primary-fg, #fff); border-color: transparent; }
.btn.primary:hover { filter: brightness(1.1); }
.btn.warn { color: var(--oc-warning, #d29922); border-color: color-mix(in srgb, var(--oc-warning, #d29922) 45%, transparent); }
.btn.danger { color: var(--oc-error-text, #f88); border-color: color-mix(in srgb, var(--oc-error, #e5534b) 40%, transparent); }

.empty { padding: 18px 14px; color: var(--oc-muted, #888); font-size: 12px; text-align: center; line-height: 1.6; }
.busy { padding: 14px; color: var(--oc-muted, #888); font-size: 12px; }
@media (max-width: 560px) {
  .connection-create { grid-template-columns: 112px minmax(0, 1fr); gap: 12px; }
  .dbtype-tabs { padding-right: 7px; }
  .dbtype-tabs .dbtype { padding-inline: 6px; gap: 5px; font-size: 10px; }
  .dbtype .dbmonogram { width: 20px; height: 20px; }
}

/* value view */
.vv {
  margin: 0; max-height: 46vh; overflow: auto; padding: 10px;
  white-space: pre-wrap; word-break: break-word; font: 12px/1.55 var(--oc-mono, ui-monospace, monospace);
  background: var(--oc-bg, #1e1e1e); border: 1px solid var(--oc-border, #333);
  border-radius: var(--oc-radius, 8px);
}
.vv .jk { color: var(--oc-primary-text, #9dc1ff); }
.vv .js { color: var(--oc-success, #3fb950); }
.vv .jb { color: var(--oc-info, #58a6ff); }
.vv .jn { color: var(--oc-warning, #d29922); }
.dialog textarea {
  padding: 6px 8px; border-radius: var(--oc-radius, 8px); border: 1px solid var(--oc-border, #333);
  background: var(--oc-bg, #1e1e1e); color: var(--oc-fg, #eee);
  font: 12px/1.5 var(--oc-mono, ui-monospace, monospace); resize: vertical; min-height: 72px;
}
.dialog textarea:focus { outline: 1px solid var(--oc-focus, #4c8dff); }

/* pending review */
.review { width: 100%; border-collapse: collapse; font: 11.5px/1.5 var(--oc-mono, ui-monospace, monospace); }
.review td { padding: 3px 6px; border-bottom: 1px solid color-mix(in srgb, var(--oc-border, #2a2a2a) 55%, transparent); vertical-align: top; }
.review td.c { color: var(--oc-muted, #999); white-space: nowrap; }
.review td.o { color: var(--oc-error-text, #f88); text-decoration: line-through; word-break: break-all; }
.review td.n { color: var(--oc-success, #3fb950); word-break: break-all; }
.review tr.del td { color: var(--oc-error-text, #f88); }

/* row inspector sheet */
.sheetwrap { position: absolute; inset: 0; background: color-mix(in srgb, black 35%, transparent); z-index: 18; }
.sheet {
  position: absolute; top: 0; right: 0; bottom: 0; width: min(78%, 380px); display: flex; flex-direction: column;
  background: var(--oc-elevated, #262626); border-left: 1px solid var(--oc-border, #3a3a3a);
  box-shadow: -12px 0 30px rgb(0 0 0 / .35); animation: slidein .16s ease-out;
}
@keyframes slidein { from { transform: translateX(24px); opacity: 0; } }
.sheet header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--oc-border, #2a2a2a); }
.sheet header h3 { margin: 0; font-size: 12.5px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sheet .sbody { flex: 1; overflow: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; }
.sheet .srow { border: 1px solid var(--oc-border, #2a2a2a); border-radius: var(--oc-radius, 8px); padding: 6px 8px; }
.sheet .srow .sh { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--oc-muted, #999); margin-bottom: 3px; }
.sheet .srow .sv { font: 12px/1.5 var(--oc-mono, ui-monospace, monospace); white-space: pre-wrap; word-break: break-word; }
.sheet .srow .sv.clickable { cursor: pointer; color: var(--oc-primary-text, #9dc1ff); }
.sheet .srow .sv.null { color: var(--oc-subtle, #666); font-style: italic; }
.sheet footer { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--oc-border, #2a2a2a); }

/* menu */
.menu {
  position: absolute; z-index: 30; min-width: 190px; padding: 4px;
  background: var(--oc-elevated, #262626); border: 1px solid var(--oc-border, #3a3a3a); border-radius: var(--oc-radius, 8px);
  box-shadow: 0 8px 24px rgb(0 0 0 / .4);
}
.menu .mi { padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; display: flex; gap: 8px; align-items: center; }
.menu .mi:hover { background: var(--oc-hover, #303030); }
.menu .mi.dis { opacity: .45; cursor: default; }
.menu .msep { height: 1px; background: var(--oc-border, #2a2a2a); margin: 4px 6px; }
.menu .mi label { display: flex; gap: 6px; align-items: center; flex: 1; cursor: pointer; }

/* skeletons */
.sk {
  border-radius: 6px; height: 14px; margin: 6px 10px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--oc-fg, #fff) 5%, transparent), color-mix(in srgb, var(--oc-fg, #fff) 11%, transparent), color-mix(in srgb, var(--oc-fg, #fff) 5%, transparent));
  background-size: 200% 100%; animation: skmove 1.3s infinite;
}
@keyframes skmove { to { background-position: -200% 0; } }

/* palette */
.pal input {
  width: 100%; padding: 8px 10px; border-radius: var(--oc-radius, 8px); border: 1px solid var(--oc-border, #333);
  background: var(--oc-bg, #1e1e1e); color: var(--oc-fg, #eee); font: 13px/1.4 inherit;
}
.pal .plist { max-height: 320px; overflow: auto; display: flex; flex-direction: column; gap: 1px; }
.pal .pi { display: flex; gap: 8px; align-items: baseline; padding: 5px 8px; border-radius: 6px; cursor: pointer; font: 12px/1.4 var(--oc-mono, ui-monospace, monospace); }
.pal .pi.sel, .pal .pi:hover { background: color-mix(in srgb, var(--oc-primary, #4c8dff) 16%, transparent); }
.pal .pi .pmeta { margin-left: auto; color: var(--oc-muted, #888); font-size: 10.5px; white-space: nowrap; }
.pal .pi .pk { color: var(--oc-info, #58a6ff); font-size: 10px; }

/* structure and welcome */
.structure-meta { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; padding: 7px 9px; border-bottom: 1px solid var(--oc-border, #2a2a2a); color: var(--oc-muted, #999); font-size: 10.5px; }
.structure-meta .pill { border: 1px solid var(--oc-border, #333); border-radius: 999px; padding: 1px 6px; }
.structure-grid th { cursor: default; }
.structure-grid td:first-child { color: var(--oc-primary-text, #9dc1ff); }
.keypill { display: inline-block; margin-left: 5px; padding: 0 4px; border-radius: 3px; color: var(--oc-warning, #d29922); border: 1px solid color-mix(in srgb, var(--oc-warning, #d29922) 45%, transparent); font-size: 8.5px; }
.welcome { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px; text-align: center; color: var(--oc-muted, #999); }
.welcome .welcome-logo { color: var(--oc-primary-text, #9dc1ff); transform: scale(1.8); margin-bottom: 8px; }
.welcome h2 { margin: 0; color: var(--oc-fg, #eee); font-size: 14px; font-weight: 600; }
.welcome p { margin: 0; max-width: 330px; font-size: 11px; line-height: 1.55; }
.welcome .welcome-actions { display: flex; gap: 6px; margin-top: 5px; }

/* status bar */
.statusbar {
  flex: none; display: flex; gap: 10px; align-items: center; min-height: 22px; padding: 2px 8px; border-top: 1px solid var(--oc-border, #2a2a2a);
  color: var(--oc-muted, #888); background: var(--oc-elevated, #262626); font-size: 9.5px; white-space: nowrap; overflow: hidden;
}
.statusbar .s { overflow: hidden; text-overflow: ellipsis; }
.statusbar .connection-status { display: flex; align-items: center; gap: 5px; color: var(--oc-fg, #bbb); }
.statusbar .end { margin-left: auto; }
.statusbar .ok { color: var(--oc-success, #3fb950); }

.tbadge { flex: none; }
.btn:focus-visible, .iconbtn:focus-visible, .wtab:focus-visible, .objtab:focus-visible, .seg button:focus-visible, .brand-toggle:focus-visible { outline: 1px solid var(--oc-focus, #4c8dff); outline-offset: 1px; }
@media (max-width: 560px) {
  .sidebar { width: 140px; }
  .app-path, .workspace-tabs .hint { display: none; }
  .objtab { max-width: 145px; }
  .objtab .objschema { display: none; }
}
@media (max-width: 410px) {
  .brand-name { display: none; }
  .topbar { gap: 4px; }
  .wtab { padding: 4px 6px; }
  .connection-picker { margin-inline: 4px; padding-inline: 5px; }
  .connection-picker .conn-detail { font-size: 8.5px; }
}
`;

// ---------- dialogs ----------

function dialog({ title, build, actions, className = "", isBusy = () => false }) {
  return new Promise((resolve) => {
    const overlay = el("div", "overlay");
    const box = el("div", `dialog${className ? ` ${className}` : ""}`);
    box.appendChild(el("h3", null, title));
    const done = (value) => {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const body = el("div");
    body.style.display = "contents";
    if (build) build(body, done);
    box.appendChild(body);
    const acts = el("div", "acts");
    for (const action of actions) {
      const btn = el("button", `btn ${action.kind ?? ""}`, action.label);
      btn.addEventListener("click", async () => {
        if (action.onClick) {
          const result = await action.onClick(done);
          if (result === false) return; // keep open
        } else {
          done(action.value);
        }
      });
      acts.appendChild(btn);
    }
    box.appendChild(acts);
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (!isBusy()) done(null);
      }
    };
    document.addEventListener("keydown", onKey, true);
    overlay.appendChild(box);
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay && !isBusy()) done(null);
    });
    document.getElementById("root").appendChild(overlay);
  });
}

const confirmDialog = (text, { danger = true, yes = "Run" } = {}) =>
  dialog({
    title: "Confirmation",
    build: (body) => body.appendChild(el("p", null, text)),
    actions: [
      { label: "Cancel", value: false },
      { label: yes, value: true, kind: danger ? "danger" : "primary" },
    ],
  }).then((v) => v === true);

// ---------- dropdown menu ----------

function openMenu(anchor, items, { align = "right" } = {}) {
  closeMenu();
  const menu = el("div", "menu");
  for (const item of items) {
    if (item === "-") {
      menu.appendChild(el("div", "msep"));
      continue;
    }
    if (item.checkbox !== undefined) {
      const row = el("div", "mi");
      const label = el("label");
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = item.checkbox;
      cb.addEventListener("change", () => item.onToggle(cb.checked));
      label.append(cb, document.createTextNode(item.label));
      row.appendChild(label);
      menu.appendChild(row);
      continue;
    }
    const row = el("div", `mi${item.disabled ? " dis" : ""}`, item.label);
    if (!item.disabled) row.addEventListener("click", () => { closeMenu(); item.onClick?.(); });
    menu.appendChild(row);
  }
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  if (align === "left") {
    menu.style.left = `${Math.max(4, rect.left)}px`;
    menu.style.maxWidth = `${Math.max(180, window.innerWidth - rect.left - 8)}px`;
  } else {
    menu.style.right = `${Math.max(4, window.innerWidth - rect.right - 4)}px`;
    menu.style.maxWidth = `${Math.max(180, rect.right - 8)}px`;
  }
  document.body.appendChild(menu);
  menu._outside = (event) => {
    if (!menu.contains(event.target) && event.target !== anchor) closeMenu();
  };
  setTimeout(() => document.addEventListener("mousedown", menu._outside), 0);
}

function closeMenu() {
  const menu = document.querySelector(".menu");
  if (menu) {
    document.removeEventListener("mousedown", menu._outside);
    menu.remove();
  }
}

// ---------- value view ----------

function renderJsonHighlighted(text) {
  const pre = el("pre", "vv json");
  if (text.length > 200_000) {
    pre.textContent = text; // highlighting is unnecessary for very large values
    return pre;
  }
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) pre.appendChild(document.createTextNode(text.slice(last, m.index)));
    const span = el("span");
    if (m[1] !== undefined) {
      span.className = m[2] ? "jk" : "js";
      span.textContent = m[1];
    } else if (m[0] === "null") {
      span.className = "jn";
      span.textContent = "null";
    } else if (m[0] === "true" || m[0] === "false") {
      span.className = "jb";
      span.textContent = m[0];
    } else {
      span.className = "jn";
      span.textContent = m[0];
    }
    pre.appendChild(span);
    last = m.index + m[0].length;
  }
  if (last < text.length) pre.appendChild(document.createTextNode(text.slice(last)));
  return pre;
}

const plainPre = (text) => {
  const pre = el("pre", "vv");
  pre.textContent = text;
  return pre;
};

/** Opens a value viewer for JSON/long/multiline cell content. Returns false when not applicable. */
function valueViewDialog(colName, type, raw, { onEdit } = {}) {
  const info = prettyValue(raw);
  if (!info) return false;
  const actions = [
    {
      label: "Copy",
      onClick: async () => {
        await host.writeClipboard(info.text).catch(() => toast("error", "Failed to copy."));
      },
    },
  ];
  if (onEdit) actions.push({ label: "Edit", kind: "primary", onClick: (done) => { done(null); onEdit(); } });
  actions.push({ label: "Close", value: null });
  dialog({
    title: type ? `${colName} — ${type}` : colName,
    build: (body) => body.appendChild(info.isJson ? renderJsonHighlighted(info.text) : plainPre(info.text)),
    actions,
  });
  return true;
}

// ---------- SQL highlighting ----------

const SQL_KEYWORDS = new Set(("select from where insert into values update set delete join left right inner outer full cross on group by order having limit offset union all distinct as and or not null is in like between case when then else end returning with explain analyze table show exists any some asc desc primary key foreign references unique index view create alter drop truncate grant revoke").split(" "));

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function highlightSql(text) {
  const re = /(--[^\n]*)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out += escapeHtml(text.slice(last, m.index));
    const token = m[0];
    if (m[1] !== undefined) out += `<span class="sc">${escapeHtml(token)}</span>`;
    else if (m[2] !== undefined) out += `<span class="ss">${escapeHtml(token)}</span>`;
    else if (m[3] !== undefined) out += `<span class="sn">${escapeHtml(token)}</span>`;
    else out += SQL_KEYWORDS.has(token.toLowerCase()) ? `<span class="sk">${escapeHtml(token)}</span>` : escapeHtml(token);
    last = m.index + token.length;
  }
  out += escapeHtml(text.slice(last));
  return out;
}

// ---------- rendering: chrome ----------

const root = document.getElementById("root");
let viewEl = null;
let treeEl = null;
let workspaceEl = null;
let objectTabsEl = null;
let workspaceTabsEl = null;
let bannerEl = null;
let statusEl = null;

function showBanner(text, kind = "error") {
  hideBanner();
  bannerEl = el("div", `banner ${kind}`, text);
  workspaceEl.insertBefore(bannerEl, viewEl);
}
const hideBanner = () => {
  if (bannerEl) bannerEl.remove();
  bannerEl = null;
};

function dbLogo() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.4");
  svg.innerHTML = `<ellipse cx="8" cy="3.5" rx="5.5" ry="2.2"/><path d="M2.5 3.5v9c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2v-9"/><path d="M2.5 8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2"/>`;
  return svg;
}

function buildChrome() {
  const style = el("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const top = el("div", "topbar");
  const brand = el("div", "brand");
  const explorerToggle = el("button", "brand-toggle");
  explorerToggle.appendChild(dbLogo());
  explorerToggle.title = "Show or hide Database Explorer";
  explorerToggle.setAttribute("aria-label", "Show or hide Database Explorer");
  explorerToggle.addEventListener("click", () => {
    state.explorerVisible = !state.explorerVisible;
    root.classList.toggle("explorer-hidden", !state.explorerVisible);
  });
  brand.append(explorerToggle, el("span", "brand-name", "Database Explorer"));
  top.appendChild(brand);
  const path = el("span", "app-path");
  top.append(path, el("span", "spacer"));

  const actions = el("div", "top-actions");
  const pal = el("button", "iconbtn", "⌘ K");
  pal.title = "Go to table (Ctrl/⌘+K)";
  pal.addEventListener("click", () => openPalette());
  const gear = el("button", "iconbtn", "⚙");
  gear.title = "Add connection";
  gear.setAttribute("aria-label", "Add connection");
  gear.addEventListener("click", () => connectionsDialog());
  actions.append(pal, gear);
  top.appendChild(actions);
  root.appendChild(top);

  const workbench = el("div", "workbench");
  const sidebar = el("aside", "sidebar");
  const connection = el("button", "connection-picker");
  connection.addEventListener("click", () => openConnectionMenu(connection));
  sidebar.appendChild(connection);

  const explorerHead = el("div", "explorer-head");
  explorerHead.appendChild(el("span", "section-title", "Database Explorer"));
  const refresh = el("button", "iconbtn", "⟳");
  refresh.title = "Refresh database schema";
  refresh.addEventListener("click", () => refreshTree());
  const hide = el("button", "iconbtn", "⟨");
  hide.title = "Hide Explorer";
  hide.addEventListener("click", () => {
    state.explorerVisible = false;
    root.classList.add("explorer-hidden");
  });
  explorerHead.append(refresh, hide);
  sidebar.appendChild(explorerHead);
  treeEl = el("div", "explorer-view");
  sidebar.appendChild(treeEl);
  workbench.appendChild(sidebar);

  workspaceEl = el("section", "workspace");
  objectTabsEl = el("div", "object-tabs");
  workspaceTabsEl = el("div", "workspace-tabs");
  viewEl = el("div", "view");
  workspaceEl.append(objectTabsEl, workspaceTabsEl, viewEl);
  workbench.appendChild(workspaceEl);
  root.appendChild(workbench);

  statusEl = el("div", "statusbar");
  root.appendChild(statusEl);
  root._connection = connection;
  root._path = path;
}

function updateChrome() {
  const conn = state.conns.find((c) => c.id === state.connId);
  const picker = root._connection;
  picker.innerHTML = "";
  const icon = el("span", "dbicon");
  icon.appendChild(dbLogo());
  const copy = el("span", "conn-copy");
  copy.appendChild(el("span", "conn-name", conn?.name ?? "Add connection"));
  copy.appendChild(el("span", "conn-detail", conn ? `${DB_TYPES[conn.kind]?.label ?? "PostgreSQL"} · ${conn.host}:${conn.port}/${conn.database}` : "PostgreSQL · MongoDB · Redis"));
  picker.append(icon, copy);
  if (conn) picker.appendChild(el("span", "online"));
  picker.appendChild(el("span", "chevron", "▼"));

  root._path.textContent = conn
    ? `${conn.database || conn.name}${state.table ? ` / ${state.table.schema}` : ""}`
    : "Database Explorer";
  root.classList.toggle("explorer-hidden", !state.explorerVisible);
  renderObjectTabs();
  renderWorkspaceTabs();
  renderStatusBar();
}

function openConnectionMenu(anchor) {
  if (!state.conns.length) return connectionsDialog();
  const current = currentConnection();
  openMenu(anchor, [
    ...state.conns.map((conn) => ({
      label: `${conn.id === state.connId ? "✓" : "　"} ${conn.name} · ${DB_TYPES[conn.kind]?.short ?? "DB"} · ${conn.host}:${conn.port}/${conn.database}`,
      onClick: () => selectConnection(conn.id),
    })),
    "-",
    { label: "Add connection…", onClick: () => connectionsDialog() },
    ...(current ? [{ label: `Delete “${current.name}”…`, onClick: () => deleteConnection(current.id) }] : []),
  ], { align: "left" });
}

function renderObjectTabs() {
  objectTabsEl.innerHTML = "";
  for (const table of state.openTables) {
    const active = state.tab === "tree" && state.mode === "data" && state.table === table;
    const tab = el("div", `objtab${active ? " on" : ""}`);
    tab.tabIndex = 0;
    tab.setAttribute("role", "button");
    tab.title = `${table.schema}.${table.name}`;
    tab.appendChild(el("span", "objicon", "▦"));
    tab.appendChild(el("span", "objschema", `${table.schema}.`));
    tab.appendChild(el("span", "objname", table.name));
    const close = el("button", "objclose", "×");
    close.title = "Close tab";
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      closeTableTab(table);
    });
    tab.appendChild(close);
    tab.addEventListener("click", () => openTable(table.schema, table.name));
    tab.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") openTable(table.schema, table.name);
    });
    objectTabsEl.appendChild(tab);
  }
  if (state.sqlOpen && isPostgres()) {
    const tab = el("div", `objtab${state.tab === "sql" ? " on" : ""}`);
    tab.tabIndex = 0;
    tab.setAttribute("role", "button");
    tab.append(el("span", "objicon", "›_"), el("span", "objname", "console.sql"));
    const close = el("button", "objclose", "×");
    close.title = "Close console";
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      state.sqlOpen = false;
      if (state.tab === "sql") state.tab = "tree";
      render();
    });
    tab.appendChild(close);
    tab.addEventListener("click", () => openSqlConsole());
    tab.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") openSqlConsole();
    });
    objectTabsEl.appendChild(tab);
  }
  if (isPostgres()) {
    const add = el("button", "objtab new", "+");
    add.title = "New SQL console";
    add.addEventListener("click", () => openSqlConsole());
    objectTabsEl.appendChild(add);
  }
}

function renderWorkspaceTabs() {
  workspaceTabsEl.innerHTML = "";
  const items = [
    ["data", "▦  Data"],
    ...(isPostgres() ? [["sql", "›_  SQL"]] : []),
    ["structure", "☷  Structure"],
  ];
  for (const [view, label] of items) {
    const active = view === "sql"
      ? state.tab === "sql"
      : state.tab === "tree" && state.mode === "data" && state.tableView === view;
    const button = el("button", `wtab${active ? " on" : ""}`, label);
    if (view !== "sql" && !state.table) {
      button.disabled = true;
      button.title = "Select a table in Explorer first";
    } else {
      button.addEventListener("click", () => {
        if (view === "sql") return openSqlConsole();
        state.tab = "tree";
        state.mode = "data";
        state.tableView = view;
        render();
      });
    }
    workspaceTabsEl.appendChild(button);
  }
  workspaceTabsEl.appendChild(el("span", "hint", "Ctrl/⌘+K — Find objects"));
}

function openSqlConsole() {
  if (!isPostgres()) {
    toast("info", "The SQL console is available only for PostgreSQL.");
    return;
  }
  state.sqlOpen = true;
  state.tab = "sql";
  loadHistory();
  render();
}

function renderStatusBar() {
  if (!statusEl) return;
  statusEl.innerHTML = "";
  const conn = state.conns.find((c) => c.id === state.connId);
  if (conn) {
    const s = el("span", "s connection-status");
    s.append(el("span", "online"), document.createTextNode(conn.name));
    statusEl.appendChild(s);
  }
  if (state.pgVersion) statusEl.appendChild(el("span", "s", `PG ${state.pgVersion}`));
  const sqlActive = state.tab === "sql";
  const ms = sqlActive ? state.sqlResult?.ms : state.table?.page?.ms;
  if (typeof ms === "number") {
    const s = el("span", `s${ms < 400 ? " ok" : ""}`);
    s.textContent = `${ms} ms`;
    statusEl.appendChild(s);
  }
  const total = sqlActive ? state.sqlResult?.rowCount : state.table?.page?.total;
  const unit = sqlActive || isPostgres() ? plural(total, "row") : currentKind() === "mongodb" ? plural(total, "document") : plural(total, "key");
  if (typeof total === "number") statusEl.appendChild(el("span", "s", `${fmtInt(total)} ${unit}`));
  statusEl.appendChild(el("span", "s end", sqlActive ? "SQL console" : state.tableView === "structure" ? "Schema" : "Ready"));
}

// ---------- palette (Ctrl/⌘+K) ----------

function openPalette() {
  if (!state.schemas.length) {
    toast("info", "Connect to a database first.");
    return;
  }
  const items = [];
  for (const schema of state.schemas) {
    for (const t of schema.tables) items.push({ schema: schema.name, table: t });
  }
  let filtered = items.slice(0, 50);
  let sel = 0;

  const overlay = el("div", "overlay");
  const box = el("div", "dialog pal");
  box.style.maxWidth = "460px";
  const input = el("input");
  input.placeholder = "Table or schema…";
  const list = el("div", "plist");
  box.append(input, list);
  overlay.appendChild(box);

  const paint = () => {
    list.innerHTML = "";
    filtered.forEach((item, i) => {
      const row = el("div", `pi${i === sel ? " sel" : ""}`);
      row.appendChild(el("span", null, `${item.schema}.${item.table.name}`));
      const kindLabel = objectKindLabel(item.table.kind);
      if (kindLabel) row.appendChild(el("span", "pk", kindLabel));
      const meta = el("span", "pmeta");
      meta.textContent = item.table.approxRows !== null && item.table.approxRows >= 0 ? `~${fmtCount(item.table.approxRows)}` : "";
      row.appendChild(meta);
      row.addEventListener("click", () => choose(i));
      row.addEventListener("mousemove", () => {
        if (sel !== i) { sel = i; paint(); }
      });
      list.appendChild(row);
    });
    if (!filtered.length) list.appendChild(el("div", "empty", "No matches found."));
  };

  const applyFilter = () => {
    const q = input.value.trim().toLowerCase();
    filtered = (q
      ? items.filter((x) => `${x.schema}.${x.table.name}`.toLowerCase().includes(q))
      : items
    ).slice(0, 50);
    sel = 0;
    paint();
  };

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const choose = (i) => {
    const item = filtered[i];
    if (!item) return;
    close();
    openTable(item.schema, item.table.name);
  };

  const onKey = (event) => {
    if (event.key === "Escape") { event.stopPropagation(); close(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); sel = Math.min(sel + 1, filtered.length - 1); paint(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); sel = Math.max(sel - 1, 0); paint(); }
    else if (event.key === "Enter") { event.preventDefault(); choose(sel); }
  };
  input.addEventListener("input", applyFilter);
  document.addEventListener("keydown", onKey, true);
  overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
  document.getElementById("root").appendChild(overlay);
  paint();
  setTimeout(() => input.focus(), 30);
}

// ---------- pending edits (batch) ----------

const pendingKeyFor = (t) => `${t.schema}.${t.name}`;
const isCurrentTableContext = (t, connection) =>
  state.connId === connection && state.table === t && state.openTables.includes(t);

function ensurePendingScope() {
  const t = state.table;
  if (!t) return false;
  const key = pendingKeyFor(t);
  if (state.pendingFor !== key) {
    state.pending.clear();
    state.pendingFor = key;
  }
  return true;
}

function clearPending() {
  state.pending.clear();
  state.pendingFor = null;
}

function pendingCount() {
  return state.pendingFor === (state.table && pendingKeyFor(state.table)) ? state.pending.size : 0;
}

function stageEdit(pkVal, col, oldValue, newValue, valNull) {
  if (!ensurePendingScope()) return false;
  const key = `${pkVal}${SEP}${col}`;
  // A row marked for deletion stays deleted; cell edits must not silently cancel it.
  if (state.pending.has(`${SEP}del${SEP}${pkVal}`)) return false;
  state.pending.set(key, { op: "update", pkVal: String(pkVal), col, old: oldValue, now: valNull ? null : newValue, valNull });
  return true;
}

function stageDelete(pkVal) {
  if (!ensurePendingScope()) return;
  for (const [key, value] of state.pending) if (value.pkVal === String(pkVal)) state.pending.delete(key);
  state.pending.set(`${SEP}del${SEP}${pkVal}`, { op: "delete", pkVal: String(pkVal) });
}

function pendingMarks() {
  const cells = new Set();
  const deleted = new Set();
  for (const [key, value] of state.pending) {
    if (value.op === "delete") deleted.add(value.pkVal);
    else cells.add(key);
  }
  return { cells, deleted };
}

async function applyPendingDialog() {
  const t = state.table;
  const page = t?.page;
  if (!t || !page || !page.pk || state.batchBusy) return;
  const entries = [...state.pending.entries()];
  const ops = entries.map(([, op]) => op);
  if (!ops.length) return;

  const connection = state.connId;
  const scope = pendingKeyFor(t);
  let applying = false;
  state.batchBusy = true;
  try {
    const ok = await dialog({
      title: `Apply ${ops.length} ${plural(ops.length, "change")} — ${t.schema}.${t.name}`,
      isBusy: () => applying,
      build: (body) => {
        const table = el("table", "review");
        for (const op of ops) {
          const tr = el("tr", op.op === "delete" ? "del" : "");
          if (op.op === "delete") {
            const td = el("td", "c", `delete row ${page.pk} = ${op.pkVal}`);
            td.colSpan = 3;
            tr.appendChild(td);
          } else {
            tr.appendChild(el("td", "c", `${page.pk}=${op.pkVal} · ${op.col}`));
            tr.appendChild(el("td", "o", op.old === null ? NULL_TEXT : esc(op.old)));
            tr.appendChild(el("td", "n", op.valNull ? NULL_TEXT : esc(op.now)));
          }
          table.appendChild(tr);
        }
        body.appendChild(table);
        body.appendChild(el("p", null, "All changes are applied in a single transaction: all or nothing."));
      },
      actions: [
        { label: "Discard all", kind: "danger", onClick: (done) => { clearPending(); done(null); render(); } },
        { label: "Close", value: null },
        {
          label: `Apply (${ops.length})`,
          kind: "primary",
          onClick: async (done) => {
            if (applying) return false;
            applying = true;
            const buttons = [...document.querySelectorAll(".overlay .acts button")];
            buttons.forEach((button) => { button.disabled = true; });
            try {
              const data = await svc("POST", "/batch", {
                body: {
                  connection,
                  schema: t.schema,
                  table: t.name,
                  pk: page.pk,
                  ops,
                },
              });
              for (const [key, op] of entries) {
                if (state.pending.get(key) === op) state.pending.delete(key);
              }
              if (!state.pending.size && state.pendingFor === scope) state.pendingFor = null;
              toast("success", `Applied. Rows affected: ${data.affected}`);
              done(true);
              if (state.connId === connection && state.table === t && state.mode === "data") {
                await reloadTable(page.offset, undefined, { target: t, preservePending: true });
              } else if (state.connId === connection && state.openTables.includes(t)) {
                t.page = null;
              }
            } catch (error) {
              applying = false;
              buttons.forEach((button) => { button.disabled = false; });
              toast("error", error.message);
              return false;
            }
          },
        },
      ],
    });
    if (ok) render();
  } finally {
    state.batchBusy = false;
  }
}

async function leaveDataGuard() {
  if (!pendingCount()) return true;
  const n = pendingCount();
  return confirmDialog(`You have ${n} pending ${plural(n, "change")}. Leave without applying?`, { yes: "Leave" });
}

// ---------- grid ----------

function buildGrid(columns, rows, opts = {}) {
  const {
    pk = null,
    pkIndex = -1,
    editable = false,
    columnMeta = null,
    indices = null,
    widths = null,
    onEditCell,
    onDeleteRow,
    onInspect,
    onSort,
    sortColumns = null,
    onResize,
    order,
    desc,
    marks = null,
    sticky = false,
  } = opts;
  const idx = indices ?? columns.map((_, i) => i);
  const wrap = el("div", "gridwrap");
  const table = el("table", `grid${sticky ? " stick" : ""}`);
  const colgroup = document.createElement("colgroup");
  idx.forEach((sourceIndex, i) => {
    const col = document.createElement("col");
    const w = widths?.[columns[i]];
    if (w) col.style.width = `${w}px`;
    colgroup.appendChild(col);
  });
  if (onDeleteRow || onInspect) {
    const col = document.createElement("col");
    col.style.width = "44px";
    colgroup.appendChild(col);
  }
  table.appendChild(colgroup);

  const headRow = el("tr");
  columns.forEach((c, i) => {
    const th = el("th");
    if (pk === c) {
      th.appendChild(el("span", null, "PK "));
      th.title = `${c} — primary key`;
    }
    th.appendChild(document.createTextNode(c));
    const metaType = columnMeta?.find((m) => m.name === c)?.type;
    if (metaType) {
      th.appendChild(typeBadge(metaType));
      th.title = th.title ? `${th.title} (${metaType})` : `${c} — ${metaType}`;
    }
    if (order === c) th.appendChild(el("span", "arr", desc ? "▼" : "▲"));
    if (onSort && (!sortColumns || sortColumns.includes(c))) th.addEventListener("click", (event) => {
      if (event.target.classList.contains("rs")) return;
      onSort(c);
    });
    if (onResize) {
      const rs = el("span", "rs");
      rs.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startW = th.offsetWidth;
        const colEl = colgroup.children[i];
        const onMove = (e) => {
          const w = Math.max(40, startW + e.clientX - startX);
          colEl.style.width = `${w}px`;
        };
        const onUp = (e) => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          onResize(c, Math.max(40, startW + e.clientX - startX));
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
      th.appendChild(rs);
    }
    headRow.appendChild(th);
  });
  if (onDeleteRow || onInspect) headRow.appendChild(el("th"));
  table.appendChild(headRow);

  rows.forEach((row) => {
    const tr = el("tr");
    const pkVal = pkIndex >= 0 ? row[pkIndex] : null;
    const isDel = marks?.deleted.has(String(pkVal));
    if (isDel) tr.classList.add("pending-del");
    columns.forEach((c, i) => {
      const sourceIndex = idx[i];
      const value = row[sourceIndex];
      const td = el("td", value === null ? "null" : "");
      const meta = columnMeta?.find((m) => m.name === c);
      const tclass = typeClass(meta?.type);
      let display = value === null ? NULL_TEXT : esc(value);
      if (tclass === "bool" && value !== null) {
        const truthy = value === "t" || value === "true" || value === "1";
        const pill = el("span", `boolpill${truthy ? "" : " f"}`, truthy ? "✓ true" : "✗ false");
        td.appendChild(pill);
        td.classList.add("bool");
      } else if (tclass === "uuid" && value !== null) {
        td.textContent = uuidShort(display);
        td.classList.add("uuid");
        td.title = display;
      } else {
        td.textContent = display;
      }
      if (tclass === "num") td.classList.add("num");
      if (value !== null && !td.title) td.title = display;
      const markKey = `${pkVal}${SEP}${c}`;
      if (marks && pkVal !== null && marks.cells.has(markKey)) td.classList.add("pending");
      const canEdit = editable && pk && c !== pk && onEditCell && !isDel;
      if (value !== null && prettyValue(value)) {
        td.classList.add("viewable");
        if (!td.classList.contains("uuid")) td.title = "Click to view value";
        td.addEventListener("click", () =>
          valueViewDialog(c, meta?.type, value, { onEdit: canEdit ? () => onEditCell(row, c) : undefined }),
        );
        if (canEdit) td.addEventListener("dblclick", () => onEditCell(row, c));
      } else if (canEdit) {
        td.classList.add("editable");
        td.addEventListener("dblclick", () => onEditCell(row, c));
      }
      tr.appendChild(td);
    });
    if ((onDeleteRow || onInspect) && pk) {
      const td = el("td", "rowact");
      if (onInspect) {
        const inspect = el("button", null, "⤢");
        inspect.classList.add("inspect");
        inspect.title = "Row inspector";
        inspect.addEventListener("click", () => onInspect(row));
        td.appendChild(inspect);
      }
      if (onDeleteRow) {
        const del = el("button", null, "✕");
        del.title = "Delete row";
        del.addEventListener("click", () => onDeleteRow(row));
        td.appendChild(del);
      }
      tr.appendChild(td);
    }
    table.appendChild(tr);
  });
  wrap.appendChild(table);
  return wrap;
}

// ---------- tree ----------

function renderTree() {
  treeEl.innerHTML = "";
  const search = el("div", "search");
  const input = el("input");
  input.type = "text";
  input.placeholder = "Search objects…";
  input.value = state.filter;
  input.addEventListener("input", () => {
    state.filter = input.value;
    renderTreeList();
  });
  search.appendChild(input);
  treeEl.appendChild(search);
  const list = el("div", "scroll");
  treeEl.appendChild(list);
  treeEl._list = list;

  const info = el("div");
  treeEl.insertBefore(info, list);
  treeEl._info = info;
  renderTreeList();
}

function renderSkeletons(container, n) {
  for (let i = 0; i < n; i++) {
    const sk = el("div", "sk");
    sk.style.width = `${55 + ((i * 37) % 40)}%`;
    container.appendChild(sk);
  }
}

function renderTreeList() {
  const list = treeEl._list;
  const info = treeEl._info;
  list.innerHTML = "";
  info.innerHTML = "";
  const filter = state.filter.trim().toLowerCase();
  const conn = state.conns.find((c) => c.id === state.connId);
  if (!state.conns.length) {
    list.appendChild(el("div", "empty", "No connections. Add PostgreSQL, MongoDB, or Redis using the ⚙ button."));
    return;
  }
  if (conn) {
    const dbroot = el("div", "dbroot");
    const icon = el("span", "dbicon");
    icon.appendChild(dbLogo());
    dbroot.append(icon, el("span", "online"), el("span", "dbname", conn.database || conn.name));
    if (state.treeReady) dbroot.appendChild(el("span", "dbcount", currentKind() === "mongodb" ? `${state.schemas.length} ${plural(state.schemas.length, "database")}` : currentKind() === "redis" ? "keys" : `${state.schemas.length} ${plural(state.schemas.length, "schema")}`));
    list.appendChild(dbroot);
  }
  if (!state.treeReady) {
    renderSkeletons(list, 7);
    return;
  }
  if (!state.schemas.length) {
    list.appendChild(el("div", "empty", currentKind() === "mongodb" ? "No databases or collections available." : "No user objects in this database."));
    return;
  }
  let shownTables = 0;
  for (const schema of state.schemas) {
    const schemaMatches = schema.name.toLowerCase().includes(filter);
    const tables = schema.tables.filter((t) => !filter || schemaMatches || t.name.toLowerCase().includes(filter));
    if (!tables.length) continue;
    shownTables += tables.length;
    const open = !!filter || state.expanded.has(schema.name);
    const block = el("div", "schema" + (open ? " open" : ""));
    const head = el("div", "head");
    head.appendChild(el("span", "chev", "▸"));
    head.appendChild(el("span", "schemaicon", "▱"));
    head.appendChild(el("span", null, schema.name));
    head.appendChild(el("span", "count", `${tables.length}`));
    head.addEventListener("click", () => {
      if (state.expanded.has(schema.name)) state.expanded.delete(schema.name);
      else state.expanded.add(schema.name);
      renderTreeList();
    });
    block.appendChild(head);
    if (open) {
      for (const t of tables) {
        const active = state.tab === "tree" && state.mode === "data" && state.table?.schema === schema.name && state.table?.name === t.name;
        const row = el("div", `trow${active ? " on" : ""}`);
        row.appendChild(el("span", "tableicon", t.kind === "view" || t.kind === "matview" ? "◫" : "▦"));
        row.appendChild(el("span", "tname", t.name));
        const kindLabel = objectKindLabel(t.kind);
        if (kindLabel) row.appendChild(el("span", "kind", kindLabel));
        const meta = el("span", "tmeta");
        meta.textContent = t.approxRows !== null && t.approxRows >= 0 ? fmtCount(t.approxRows) : "";
        row.appendChild(meta);
        row.title = `${schema.name}.${t.name} — ${t.columns.length} ${plural(t.columns.length, "column")}${t.primaryKey ? `, PK: ${t.primaryKey}` : ", no PK"}`;
        row.addEventListener("click", () => openTable(schema.name, t.name));
        block.appendChild(row);
      }
    }
    list.appendChild(block);
  }
  if (!shownTables) list.appendChild(el("div", "empty", "No matches found."));
}

const fmtCount = (n) => (n >= 1000000 ? (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n));
const fmtInt = (n) => Number(n).toLocaleString("en-US");
const plural = (n, singular, pluralForm) => (n === 1 ? singular : pluralForm ?? `${singular}s`);

// ---------- column prefs ----------

const colsKey = () => `${state.connId}:${pendingKeyFor(state.table)}`;

async function loadColsPrefs() {
  try {
    const stored = await host.storage.get("tablecols").catch(() => undefined);
    if (stored && typeof stored === "object") state.colsPrefs = stored;
  } catch {
    state.colsPrefs = {};
  }
}

function tablePrefs() {
  const key = colsKey();
  if (!state.colsPrefs[key]) state.colsPrefs[key] = { hidden: [], widths: {} };
  return state.colsPrefs[key];
}

async function saveColsPrefs() {
  await host.storage.set("tablecols", state.colsPrefs).catch(() => {});
}

function visibleEntries(page) {
  const prefs = tablePrefs();
  const entries = [];
  page.columns.forEach((c, i) => {
    if (!prefs.hidden.includes(c)) entries.push({ name: c, index: i, type: page.columnMeta.find((m) => m.name === c)?.type });
  });
  return entries;
}

// ---------- data view ----------

const VIEW_MODES = [
  ["table", "Table"],
  ["json", "JSON"],
  ["text", "Text"],
];

function seg(current, onPick) {
  const box = el("div", "seg");
  for (const [value, label] of VIEW_MODES) {
    const b = el("button", value === current ? "on" : "", label);
    b.addEventListener("click", () => onPick(value));
    box.appendChild(b);
  }
  return box;
}

function buildPager(page) {
  const pager = el("div", "pager");
  const prev = el("button", "iconbtn", "‹");
  const next = el("button", "iconbtn", "›");
  const from = page.total === 0 ? 0 : page.offset + 1;
  const to = page.offset + page.rowCount;
  pager.append(prev, el("span", null, `${fmtInt(from)}–${fmtInt(to)} / ${fmtInt(page.total)}`), next);
  prev.disabled = page.offset <= 0;
  next.disabled = page.offset + page.rowCount >= page.total;
  prev.title = "Previous page";
  next.title = "Next page";
  prev.addEventListener("click", () => reloadTable(page.offset - page.limit));
  next.addEventListener("click", () => reloadTable(page.offset + page.limit));
  return pager;
}

function renderData() {
  viewEl.innerHTML = "";
  const t = state.table;
  if (!t) return renderWelcome();
  const connection = state.connId;

  const bar = el("div", "databar");
  const page = t.page;
  const writable = isPostgres() && !page?.readOnly && !t.loading;
  if (page) {
    const n = pendingCount();
    if (n) {
      const pend = el("button", "iconbtn pend");
      pend.append(el("span", "dotp"), document.createTextNode(`${n} ${plural(n, "change")}`));
      pend.title = "Review pending changes";
      pend.addEventListener("click", () => applyPendingDialog());
      bar.appendChild(pend);
      const apply = el("button", "btn warn", "Apply");
      apply.addEventListener("click", () => applyPendingDialog());
      bar.appendChild(apply);
    }

    if (writable) {
      const insert = el("button", "iconbtn", "＋ Row");
      if (page.pk) insert.addEventListener("click", () => insertDialog());
      else {
        insert.disabled = true;
        insert.title = "Only for tables with a primary key";
      }
      bar.appendChild(insert);
    }

    const filter = el("button", `iconbtn${t.filter ? " active" : ""}`, "▽ Filter");
    filter.title = "Filter rows";
    filter.addEventListener("click", () => {
      if (!t.filter) t.filter = { col: page.filterColumns?.[0] ?? page.columns[0], op: currentKind() === "mongodb" && page.columns[0] === "_id" ? "eq" : "contains", val: "" };
      render();
      setTimeout(() => viewEl.querySelector(".fbar input")?.focus(), 0);
    });
    bar.appendChild(filter);

    const more = el("button", "iconbtn", "⋮");
    more.title = "Columns, export, and copy";
    more.addEventListener("click", () => openDataMenu(more));
    bar.appendChild(more);
    bar.appendChild(el("span", "spacer"));
    bar.appendChild(seg(state.viewMode, (v) => { state.viewMode = v; render(); }));
  }
  const refresh = el("button", "iconbtn", "⟳");
  refresh.title = "Refresh data";
  refresh.addEventListener("click", () => reloadTable());
  bar.appendChild(refresh);
  viewEl.appendChild(bar);

  if (page && t.filter) viewEl.appendChild(buildFilterBar(page, t.filter));
  if (!page) {
    const skel = el("div");
    renderSkeletons(skel, 8);
    viewEl.appendChild(skel);
    return;
  }

  const marks = pendingMarks();
  const entries = visibleEntries(page);
  if (state.viewMode === "json") {
    viewEl.appendChild(renderJsonView(page, entries, marks));
  } else if (state.viewMode === "text") {
    viewEl.appendChild(renderTextView(page, entries));
  } else {
    viewEl.appendChild(
      buildGrid(entries.map((e) => e.name), page.rows, {
        pk: page.pk,
        pkIndex: page.pk ? page.columns.indexOf(page.pk) : -1,
        editable: writable,
        columnMeta: page.columnMeta,
        indices: entries.map((e) => e.index),
        widths: tablePrefs().widths,
        marks,
        sticky: !!page.pk,
        onEditCell: writable ? (row, col) => {
          if (isCurrentTableContext(t, connection)) editCellDialog(row, col);
        } : undefined,
        onDeleteRow: writable ? (row) => {
          if (isCurrentTableContext(t, connection)) deleteRowDialog(row);
        } : undefined,
        onInspect: (row) => openInspector(row),
        onSort: (col) => reloadTable(0, col),
        sortColumns: page.sortColumns,
        onResize: async (col, width) => {
          tablePrefs().widths[col] = width;
          await saveColsPrefs();
        },
        order: page.order,
        desc: page.desc,
      }),
    );
  }

  const footer = el("div", "datafoot");
  if (!page.pk) footer.appendChild(el("span", "notice", "No PK — read-only"));
  else if (page.readOnly) footer.appendChild(el("span", "notice", `${DB_TYPES[currentKind()].label} · read-only`));
  else footer.appendChild(el("span", null, `${t.schema}.${t.name}`));
  footer.appendChild(el("span", "spacer"));
  footer.appendChild(buildPager(page));
  viewEl.appendChild(footer);
}

function findTableMeta(schema, name) {
  return state.schemas.find((item) => item.name === schema)?.tables.find((item) => item.name === name) ?? null;
}

function renderStructure() {
  viewEl.innerHTML = "";
  const t = state.table;
  const meta = t ? findTableMeta(t.schema, t.name) : null;
  if (!t || !meta) return renderWelcome();

  const info = el("div", "structure-meta");
  info.appendChild(el("span", "pill", meta.kind === "matview" ? "MATERIALIZED VIEW" : meta.kind.toUpperCase()));
  info.appendChild(el("span", null, `${meta.columns.length} ${plural(meta.columns.length, "column")}`));
  info.appendChild(el("span", null, meta.primaryKey ? `PK: ${meta.primaryKey}` : "No primary key"));
  if (meta.approxRows !== null && meta.approxRows >= 0) info.appendChild(el("span", null, `≈ ${fmtCount(meta.approxRows)} ${plural(meta.approxRows, "row")}`));
  viewEl.appendChild(info);

  const wrap = el("div", "gridwrap");
  const table = el("table", "grid structure-grid");
  const head = el("tr");
  for (const label of ["Column", "Type", "Nullable", "Key"]) head.appendChild(el("th", null, label));
  table.appendChild(head);
  for (const column of meta.columns) {
    const row = el("tr");
    row.appendChild(el("td", null, column.name));
    const type = el("td");
    type.appendChild(typeBadge(column.type));
    type.appendChild(document.createTextNode(` ${column.type}`));
    row.appendChild(type);
    row.appendChild(el("td", column.nullable ? "null" : "", column.nullable ? "YES" : "NO"));
    const key = el("td");
    if (column.pk) key.appendChild(el("span", "keypill", "PRIMARY KEY"));
    row.appendChild(key);
    table.appendChild(row);
  }
  wrap.appendChild(table);
  viewEl.appendChild(wrap);
  const footer = el("div", "datafoot");
  footer.appendChild(el("span", null, `${t.schema}.${t.name}`));
  footer.appendChild(el("span", "spacer"));
  footer.appendChild(el("span", null, currentKind() === "postgres" ? "pg_catalog metadata" : currentKind() === "mongodb" ? "Fields from the current document page" : "Redis metadata"));
  viewEl.appendChild(footer);
}

function renderWelcome() {
  viewEl.innerHTML = "";
  const welcome = el("div", "welcome");
  const logo = el("span", "welcome-logo");
  logo.appendChild(dbLogo());
  welcome.appendChild(logo);
  welcome.appendChild(el("h2", null, state.conns.length ? "Select an object in Explorer" : "Add a connection"));
  welcome.appendChild(el("p", null, state.conns.length
    ? isPostgres()
      ? "Open a table on the left or create an SQL console. The tree stays in place when you switch between objects."
      : currentKind() === "mongodb"
        ? "Select a collection on the left to browse documents."
        : "Open keys on the left to browse Redis keys and values."
    : "Use a separate DSN for each PostgreSQL, MongoDB, or Redis connection."));
  const actions = el("div", "welcome-actions");
  if (!state.conns.length || isPostgres()) {
    const primary = el("button", "btn primary", state.conns.length ? "New SQL console" : "Add connection");
    primary.addEventListener("click", () => state.conns.length ? openSqlConsole() : connectionsDialog());
    actions.appendChild(primary);
  }
  welcome.appendChild(actions);
  viewEl.appendChild(welcome);
}

function buildFilterBar(page, filter) {
  const bar = el("div", "fbar");
  bar.appendChild(el("span", "lbl", "Filter"));
  const colSel = el("select");
  for (const c of page.filterColumns ?? page.columns) {
    const o = el("option", null, c);
    o.value = c;
    colSel.appendChild(o);
  }
  colSel.value = filter.col;
  const OPS = [
    ["eq", "= equal to"], ["neq", "≠ not equal to"], ["gt", "> greater than"], ["gte", "≥"],
    ["lt", "< less than"], ["lte", "≤"], ["contains", "contains"], ["starts", "starts with"],
    ["isnull", "IS NULL"], ["notnull", "NOT NULL"],
  ];
  const opSel = el("select");
  for (const [v, label] of OPS) {
    const o = el("option", null, label);
    o.value = v;
    opSel.appendChild(o);
  }
  opSel.value = filter.op;
  const valInput = el("input");
  valInput.placeholder = "value";
  valInput.value = filter.val ?? "";
  const noValue = () => opSel.value === "isnull" || opSel.value === "notnull";
  valInput.style.display = noValue() ? "none" : "";
  opSel.addEventListener("change", () => { valInput.style.display = noValue() ? "none" : ""; });
  const applyBtn = el("button", "iconbtn", "Apply");
  applyBtn.addEventListener("click", async () => {
    const previous = state.table.filter;
    state.table.filter = { col: colSel.value, op: opSel.value, val: valInput.value };
    if (await reloadTable(0) === false) state.table.filter = previous;
  });
  const reset = el("button", "iconbtn", "✕");
  reset.title = "Clear filter";
  reset.addEventListener("click", async () => {
    const previous = state.table.filter;
    state.table.filter = null;
    if (await reloadTable(0) === false) state.table.filter = previous;
  });
  bar.append(colSel, opSel, valInput, applyBtn, reset);
  return bar;
}

function openDataMenu(anchor) {
  const t = state.table;
  const page = t?.page;
  if (!page) return;
  const prefs = tablePrefs();
  openMenu(anchor, [
    { label: "Columns:", disabled: true },
    ...page.columns.map((c) => ({
      label: c,
      checkbox: !prefs.hidden.includes(c),
      onToggle: async (checked) => {
        const p = tablePrefs();
        p.hidden = checked ? p.hidden.filter((x) => x !== c) : [...p.hidden, c];
        if (!checked && p.hidden.length >= page.columns.length) p.hidden = p.hidden.filter((x) => x !== c); // keep at least one
        await saveColsPrefs();
        render();
      },
    })),
    "-",
    { label: "Reset column widths and visibility", onClick: async () => { delete state.colsPrefs[colsKey()]; await saveColsPrefs(); render(); } },
    "-",
    { label: "Export CSV", onClick: () => exportTable("csv") },
    { label: "Export JSON", onClick: () => exportTable("json") },
    { label: "Export SQL (INSERT)", onClick: () => exportTable("sql"), disabled: !isPostgres() || !page.pk },
    "-",
    { label: "Copy page (TSV)", onClick: () => copyPage() },
  ]);
}

function download(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  const a = el("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function exportTable(format) {
  const t = state.table;
  const page = t?.page;
  if (!t || !page) return;
  const entries = visibleEntries(page);
  const names = entries.map((e) => e.name);
  const rows = page.rows.map((r) => entries.map((e) => r[e.index]));
  const base = `${t.schema}.${t.name}`;
  if (format === "csv") {
    const q = (v) => {
      const s = v === null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    download(`${base}.csv`, [names.map(q).join(","), ...rows.map((r) => r.map(q).join(","))].join("\n"), "text/csv");
  } else if (format === "json") {
    download(`${base}.json`, JSON.stringify(rows.map((r) => Object.fromEntries(names.map((n, i) => [n, r[i]]))), null, 2), "application/json");
  } else {
    const escSql = (v) => (v === null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
    download(`${base}.sql`, rows.map((r) =>
      `insert into "${t.schema}"."${t.name}" (${names.map((n) => `"${n}"`).join(", ")}) values (${r.map(escSql).join(", ")});`,
    ).join("\n"), "application/sql");
  }
  toast("success", `Exported ${rows.length} ${plural(rows.length, "row")}.`);
}

async function copyPage() {
  const page = state.table?.page;
  if (!page) return;
  const entries = visibleEntries(page);
  const lines = [
    entries.map((e) => e.name).join("\t"),
    ...page.rows.map((r) => entries.map((e) => (r[e.index] === null ? NULL_TEXT : esc(r[e.index]))).join("\t")),
  ];
  await host.writeClipboard(lines.join("\n")).catch(() => toast("error", "Failed to copy."));
  toast("success", `Copied ${page.rows.length} ${plural(page.rows.length, "row")}.`);
}

// ---------- view modes ----------

function renderJsonView(page, entries, marks) {
  const wrap = el("div", "jsonview");
  const pkIndex = page.pk ? page.columns.indexOf(page.pk) : -1;
  page.rows.slice(0, 200).forEach((row) => {
    const obj = Object.fromEntries(entries.map((e) => [e.name, row[e.index] === null ? null : row[e.index]]));
    const pretty = JSON.stringify(obj, null, 2);
    const block = el("div", "jrow");
    const headText = pkIndex >= 0 ? `${page.pk} = ${esc(row[pkIndex])}` : "row";
    const head = el("div", "jhead", headText + (marks?.deleted.has(String(row[pkIndex])) ? "  ·  deleted" : ""));
    const body = el("pre", "jbody");
    body.appendChild(renderJsonHighlighted(pretty));
    head.addEventListener("click", () => { body.style.display = body.style.display === "none" ? "" : "none"; });
    block.append(head, body);
    wrap.appendChild(block);
  });
  if (page.rows.length > 200) wrap.appendChild(el("div", "empty", `Showing 200 of ${fmtInt(page.rows.length)} ${plural(page.rows.length, "row")}.`));
  return wrap;
}

function renderTextView(page, entries) {
  const pre = el("div", "textview");
  const lines = [entries.map((e) => e.name).join(" | ")];
  for (const row of page.rows) {
    lines.push(entries.map((e) => (row[e.index] === null ? NULL_TEXT : esc(row[e.index]))).join(" | "));
  }
  pre.textContent = lines.join("\n");
  return pre;
}

// ---------- row inspector ----------

function openInspector(row) {
  const t = state.table;
  const connection = state.connId;
  const page = t?.page;
  if (!t || !page) return;
  const wrap = el("div", "sheetwrap");
  const sheet = el("div", "sheet");
  const header = el("header");
  const pkIndex = page.pk ? page.columns.indexOf(page.pk) : -1;
  const title = pkIndex >= 0 ? `${t.schema}.${t.name} — ${page.pk} = ${esc(row[pkIndex])}` : `${t.schema}.${t.name} — row`;
  const rowDeleted = pkIndex >= 0 && pendingMarks().deleted.has(String(row[pkIndex]));
  header.appendChild(el("h3", null, title));
  const closeBtn = el("button", "iconbtn", "✕");
  closeBtn.addEventListener("click", close);
  header.appendChild(closeBtn);
  sheet.appendChild(header);

  const body = el("div", "sbody");
  for (const meta of page.columnMeta) {
    const i = page.columns.indexOf(meta.name);
    const value = row[i];
    const block = el("div", "srow");
    const sh = el("div", "sh");
    sh.appendChild(typeBadge(meta.type));
    sh.appendChild(el("span", null, `${meta.name} — ${meta.type}${meta.pk ? " · PK" : ""}`));
    if (meta.name === page.pk) sh.appendChild(el("span", "pk", "PK"));
    block.appendChild(sh);
    const sv = el("div", `sv${value === null ? " null" : ""}`);
    if (value === null) {
      sv.textContent = NULL_TEXT;
    } else {
      sv.textContent = esc(value);
      const info = prettyValue(value);
      if (info) {
        sv.textContent = "";
        sv.classList.add("clickable");
        sv.appendChild(info.isJson ? renderJsonHighlighted(info.text) : plainPre(info.text));
        sv.firstChild.style.maxHeight = "140px";
        sv.addEventListener("click", () => {
          const canEdit = !rowDeleted && isCurrentTableContext(t, connection) && isPostgres() && !page.readOnly && page.pk && meta.name !== page.pk;
          valueViewDialog(meta.name, meta.type, value, {
            onEdit: canEdit ? () => {
              close();
              if (isCurrentTableContext(t, connection)) editCellDialog(row, meta.name);
            } : undefined,
          });
        });
      }
    }
    block.appendChild(sv);
    body.appendChild(block);
  }
  sheet.appendChild(body);

  const footer = el("footer");
  const copy = el("button", "btn", "Copy row");
  copy.addEventListener("click", async () => {
    const text = JSON.stringify(Object.fromEntries(page.columnMeta.map((m) => [m.name, row[page.columns.indexOf(m.name)]])));
    await host.writeClipboard(text).catch(() => toast("error", "Failed to copy."));
    toast("success", "Row copied.");
  });
  footer.appendChild(copy);
  if (page.pk && isPostgres() && !page.readOnly) {
    const edit = el("button", "btn", "Edit…");
    edit.disabled = rowDeleted;
    if (rowDeleted) edit.title = "This row is marked for deletion.";
    edit.addEventListener("click", () => {
      close();
      if (!rowDeleted && isCurrentTableContext(t, connection)) pickColumnDialog(row);
    });
    footer.appendChild(edit);
    const del = el("button", "btn danger", "Delete row");
    del.addEventListener("click", async () => {
      close();
      if (isCurrentTableContext(t, connection)) await deleteRowDialog(row);
    });
    footer.appendChild(del);
  }
  sheet.appendChild(footer);
  wrap.appendChild(sheet);
  wrap.addEventListener("mousedown", (event) => { if (event.target === wrap) close(); });
  const onKey = (event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } };
  function close() {
    wrap.remove();
    document.removeEventListener("keydown", onKey, true);
  }
  document.addEventListener("keydown", onKey, true);
  root.appendChild(wrap);
}

function pickColumnDialog(row) {
  const t = state.table;
  const connection = state.connId;
  const page = t?.page;
  if (!t || !page) return;
  dialog({
    title: "Edit column",
    build: (body, done) => {
      for (const meta of page.columnMeta) {
        if (meta.name === page.pk) continue;
        const b = el("button", "btn");
        b.style.alignSelf = "flex-start";
        b.appendChild(typeBadge(meta.type));
        b.appendChild(document.createTextNode(` ${meta.name} — ${meta.type}`));
        b.addEventListener("click", () => {
          done(null);
          if (isCurrentTableContext(t, connection)) editCellDialog(row, meta.name);
        });
        body.appendChild(b);
      }
    },
    actions: [{ label: "Cancel", value: null }],
  });
}

// ---------- SQL console ----------

const SQL_TEMPLATES = [
  ["SELECT *", "select * from  limit 100"],
  ["COUNT", "select count(*) from "],
  ["JOIN", "select *\nfrom  a\njoin  b on b. = a.\nlimit 100"],
  ["UPDATE", "update  set  = '' where\n-- caution: omitting WHERE affects all rows"],
  ["INSERT", "insert into  () values ()"],
];

function renderSql() {
  viewEl.innerHTML = "";
  const box = el("div", "sqlbox");
  box.style.position = "relative";

  const chips = el("div", "chips");
  for (const [label, tpl] of SQL_TEMPLATES) {
    const b = el("button", null, label);
    b.title = "Insert template";
    b.addEventListener("click", () => insertTemplate(tpl));
    chips.appendChild(b);
  }

  const editor = el("div", "editor");
  const pre = el("pre", "sql-hl");
  const textarea = document.createElement("textarea");
  textarea.placeholder = "SELECT * FROM … LIMIT 10;\n\nSELECT/WITH/EXPLAIN are read-only.\nOther statements require confirmation.";
  textarea.value = state.sql;
  textarea.spellcheck = false;
  const sync = () => {
    pre.innerHTML = highlightSql(textarea.value) + "\n";
    pre.scrollTop = textarea.scrollTop;
    pre.scrollLeft = textarea.scrollLeft;
  };
  textarea.addEventListener("input", () => {
    state.sql = textarea.value;
    sync();
    updateAutocomplete(textarea);
  });
  textarea.addEventListener("scroll", () => {
    pre.scrollTop = textarea.scrollTop;
    pre.scrollLeft = textarea.scrollLeft;
  });
  textarea.addEventListener("keydown", (event) => {
    if (handleAutocompleteKey(event, textarea)) return;
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      runSql();
    }
  });
  textarea.addEventListener("blur", () => setTimeout(closeAutocomplete, 150));
  editor.append(pre, textarea);
  sync();

  const bar = el("div", "databar");
  const run = el("button", "btn primary", "Run");
  run.title = "Ctrl/⌘+Enter";
  run.addEventListener("click", () => runSql());
  run.disabled = state.sqlBusy;
  const explain = el("button", "btn", "Explain");
  explain.title = "EXPLAIN ANALYZE for a SELECT query";
  explain.disabled = state.sqlBusy;
  explain.addEventListener("click", () => runExplain());
  bar.append(run, explain, el("span", "sqlmeta", state.sqlBusy ? "Running…" : "Ctrl/⌘+Enter"));
  box.append(bar, chips, editor);

  const result = el("div");
  result.style.cssText = "flex:1; min-height:0; display:flex; flex-direction:column;";
  box.appendChild(result);
  viewEl.appendChild(box);
  viewEl._result = result;
  viewEl._run = run;
  viewEl._explain = explain;
  renderSqlResult();
  renderHistory();
}

function insertTemplate(tpl) {
  const textarea = viewEl.querySelector(".editor textarea");
  if (!textarea) return;
  const pos = textarea.selectionStart ?? textarea.value.length;
  textarea.value = textarea.value.slice(0, pos) + tpl + textarea.value.slice(textarea.selectionEnd ?? pos);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = pos + tpl.indexOf(" ") + 1;
  state.sql = textarea.value;
  textarea.dispatchEvent(new Event("input"));
}

// --- autocomplete ---

let acBox = null;
let acItems = [];
let acSel = 0;
let acWordStart = 0;

function completionCandidates() {
  const tables = [];
  const columns = new Set();
  for (const schema of state.schemas) {
    for (const t of schema.tables) {
      tables.push({ name: t.name, kind: "table" });
      for (const c of t.columns) columns.add(c.name);
    }
  }
  const kw = [...SQL_KEYWORDS].filter((k) => k.length > 2).map((k) => ({ name: k.toUpperCase(), kind: "SQL" }));
  return { tables: tables.slice(0, 400), columns: [...columns].slice(0, 2000), keywords: kw };
}

function currentWord(textarea) {
  const pos = textarea.selectionStart ?? 0;
  const before = textarea.value.slice(0, pos);
  const m = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(before);
  return { word: m ? m[1] : "", start: pos - (m ? m[1].length : 0) };
}

function updateAutocomplete(textarea) {
  const { word } = currentWord(textarea);
  if (word.length < 2) return closeAutocomplete();
  const q = word.toLowerCase();
  const { tables, columns, keywords } = completionCandidates();
  acItems = [
    ...tables.filter((t) => t.name.toLowerCase().startsWith(q)).slice(0, 6),
    ...columns.filter((c) => c.toLowerCase().startsWith(q)).slice(0, 6).map((name) => ({ name, kind: "column" })),
    ...keywords.filter((k) => k.name.toLowerCase().startsWith(q)).slice(0, 4),
  ].slice(0, 12);
  if (!acItems.length) return closeAutocomplete();
  acSel = 0;
  paintAutocomplete(textarea);
}

function paintAutocomplete(textarea) {
  if (acBox) acBox.remove();
  acBox = el("div", "ac");
  acItems.forEach((item, i) => {
    const row = el("div", `aci${i === acSel ? " sel" : ""}`);
    row.appendChild(el("span", null, item.name));
    row.appendChild(el("span", "k", item.kind));
    row.addEventListener("mousedown", (event) => {
      event.preventDefault();
      acceptAutocomplete(textarea, i);
    });
    acBox.appendChild(row);
  });
  const box = viewEl.querySelector(".sqlbox");
  const editor = viewEl.querySelector(".editor");
  if (!box || !editor) return;
  acBox.style.left = "10px";
  acBox.style.right = "10px";
  acBox.style.top = `${editor.offsetTop + editor.offsetHeight + 2}px`;
  box.appendChild(acBox);
}

function acceptAutocomplete(textarea, i) {
  const item = acItems[i];
  if (!item) return;
  const { start } = currentWord(textarea);
  const pos = textarea.selectionStart ?? 0;
  textarea.value = textarea.value.slice(0, start) + item.name + textarea.value.slice(pos);
  textarea.selectionStart = textarea.selectionEnd = start + item.name.length;
  state.sql = textarea.value;
  closeAutocomplete();
  textarea.focus();
  textarea.dispatchEvent(new Event("input"));
}

function handleAutocompleteKey(event, textarea) {
  if (!acBox) return false;
  if (event.key === "ArrowDown") { event.preventDefault(); acSel = Math.min(acSel + 1, acItems.length - 1); paintAutocomplete(textarea); return true; }
  if (event.key === "ArrowUp") { event.preventDefault(); acSel = Math.max(acSel - 1, 0); paintAutocomplete(textarea); return true; }
  if (event.key === "Tab" || event.key === "Enter") { event.preventDefault(); acceptAutocomplete(textarea, acSel); return true; }
  if (event.key === "Escape") { event.preventDefault(); closeAutocomplete(); return true; }
  return false;
}

function closeAutocomplete(keep) {
  if (acBox && !keep) acBox.remove();
  if (!keep) acBox = null;
}

function renderSqlResult() {
  renderStatusBar();
  const result = viewEl._result;
  if (!result) return;
  result.innerHTML = "";
  const r = state.sqlResult;
  if (!r) return;
  const meta = el("div", "sqlmeta");
  meta.style.padding = "4px 10px";
  meta.textContent = r.command === "SELECT" || r.rows.length
    ? `${fmtInt(r.rowCount)} ${plural(r.rowCount, "row")} · ${r.ms} ms`
    : `Done: ${r.command || "OK"} · ${fmtInt(r.rowCount)} ${plural(r.rowCount, "row")} affected · ${r.ms} ms`;
  result.appendChild(meta);

  const isPlan = r.columns.length === 1 && /QUERY PLAN/i.test(r.columns[0]);
  const holder = el("div");
  holder.style.cssText = "flex:1; min-height:0; display:flex; flex-direction:column;";
  result.appendChild(holder);

  if (isPlan) {
    const pre = el("div", "textview");
    pre.textContent = r.rows.map((row) => row[0]).join("\n");
    holder.appendChild(pre);
    return;
  }

  if (!r.columns.length) return;
  const bar = el("div", "databar");
  bar.style.padding = "2px 10px 4px";
  bar.appendChild(seg(state.sqlViewMode, (v) => { state.sqlViewMode = v; renderSqlResult(); }));
  const copy = el("button", "iconbtn", "Copy");
  copy.title = "Copy result to clipboard (TSV)";
  copy.addEventListener("click", async () => {
    const lines = [r.columns.join("\t"), ...r.rows.map((row) => row.map((v) => (v === null ? NULL_TEXT : esc(v))).join("\t"))];
    await host.writeClipboard(lines.join("\n")).catch(() => toast("error", "Failed to copy."));
    toast("success", "Result copied.");
  });
  const dl = el("button", "iconbtn", "⤓ CSV");
  dl.addEventListener("click", () => {
    const q = (v) => {
      const s = v === null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    download("result.csv", [r.columns.map(q).join(","), ...r.rows.map((row) => row.map(q).join(","))].join("\n"), "text/csv");
  });
  bar.append(el("span", "spacer"), copy, dl);
  holder.appendChild(bar);

  if (state.sqlViewMode === "json") {
    const fakePage = { columns: r.columns, columnMeta: r.columns.map((c) => ({ name: c, type: "" })), rows: r.rows.slice(0, 200), pk: null };
    const entries = fakePage.columns.map((c, i) => ({ name: c, index: i }));
    holder.appendChild(renderJsonView(fakePage, entries, null));
  } else if (state.sqlViewMode === "text") {
    holder.appendChild(renderTextView({ columns: r.columns, rows: r.rows.slice(0, 500) }, r.columns.map((c, i) => ({ name: c, index: i }))));
  } else {
    const grid = buildGrid(r.columns, r.rows.slice(0, 200), {});
    holder.appendChild(grid);
  }
}

async function renderHistory() {
  const box = viewEl.querySelector(".sqlbox");
  if (!box) return;
  box.querySelector(".hist")?.remove();
  const hist = el("div", "hist");
  hist.appendChild(el("div", "hhead", "History"));
  if (!state.history.length) hist.appendChild(el("div", "hhead", "empty"));
  for (const h of state.history.slice(0, 15)) {
    const item = el("div", "hitem");
    item.appendChild(el("span", "k" + (h.kind === "query" ? " ro" : ""), h.kind === "query" ? "R" : "W"));
    item.appendChild(el("span", "hsql", h.sql.replace(/\s+/g, " ")));
    item.title = h.sql;
    item.addEventListener("click", () => {
      state.sql = h.sql;
      const textarea = viewEl.querySelector(".editor textarea");
      if (textarea) {
        textarea.value = h.sql;
        textarea.dispatchEvent(new Event("input"));
      }
    });
    hist.appendChild(item);
  }
  box.appendChild(hist);
}

function render() {
  hideBanner();
  closeMenu();
  closeAutocomplete();
  updateChrome();
  renderTree();
  viewEl.innerHTML = "";
  if (state.tab === "sql") return renderSql();
  if (state.mode === "data" && state.table) {
    return state.tableView === "structure" ? renderStructure() : renderData();
  }
  return renderWelcome();
}

// ---------- data actions ----------

async function loadConnections() {
  const data = await svc("GET", "/connections");
  state.conns = data.connections ?? [];
  if (!state.conns.some((c) => c.id === state.connId)) state.connId = state.conns[0]?.id ?? null;
}

function resetWorkspace() {
  state.openTables = [];
  state.table = null;
  state.tab = "tree";
  state.mode = "tree";
  state.tableView = "data";
  state.sqlOpen = false;
  state.sqlRunId += 1;
  state.sqlBusy = false;
  state.sqlResult = null;
  clearPending();
}

async function selectConnection(id) {
  if (!id || id === state.connId) return;
  if (!(await leaveDataGuard())) return;
  state.connId = id;
  await host.storage.set("prefs", { connection: id }).catch(() => {});
  state.schemas = [];
  state.treeReady = false;
  state.expanded.clear();
  state.pgVersion = null;
  resetWorkspace();
  render();
  try {
    await loadTree();
    loadPgVersion();
  } catch (error) {
    render();
    showBanner(error.message);
    return;
  }
  render();
}

async function refreshTree() {
  if (!state.connId) return;
  state.treeReady = false;
  renderTree();
  try {
    await loadTree();
    render();
  } catch (error) {
    showBanner(error.message);
    renderTree();
  }
}

async function loadTree() {
  if (!state.connId) {
    state.treeReady = true;
    return;
  }
  const connection = state.connId;
  try {
    const data = await svc("GET", "/introspect", { query: { connection } });
    if (state.connId !== connection) return;
    state.schemas = data.schemas ?? [];
    state.treeReady = true;
    if (!state.expanded.size) {
      const preferred = state.schemas.find((s) => s.name === "public") ?? state.schemas[0];
      if (preferred) state.expanded.add(preferred.name);
    }
  } catch (error) {
    if (state.connId === connection) state.treeReady = true;
    throw error;
  }
}

async function loadPgVersion() {
  if (!state.connId || state.pgVersion || !isPostgres()) return;
  const connection = state.connId;
  try {
    const data = await svc("POST", "/query", { body: { connection, sql: "show server_version", limit: 1 } });
    if (state.connId !== connection) return;
    state.pgVersion = data.rows?.[0]?.[0] ?? null;
    renderStatusBar();
  } catch {
    // best-effort
  }
}

async function loadHistory() {
  try {
    const data = await svc("GET", "/history");
    state.history = data.items ?? [];
    renderHistory();
  } catch {
    // history is best-effort
  }
}

async function openTable(schema, name) {
  let next = state.openTables.find((item) => item.schema === schema && item.name === name);
  if (next && state.table === next) {
    state.tab = "tree";
    state.mode = "data";
    state.tableView = "data";
    render();
    return;
  }
  if (!(await leaveDataGuard())) return;
  clearPending();
  if (!next) {
    next = { schema, name, page: null, filter: null };
    state.openTables.push(next);
  }
  state.table = next;
  state.tab = "tree";
  state.mode = "data";
  state.tableView = "data";
  render();
  await loadColsPrefs();
  if (state.table !== next) return;
  if (!next.page) await reloadTable(0);
}

async function closeTableTab(table) {
  const index = state.openTables.indexOf(table);
  if (index < 0) return;
  const current = state.table === table;
  if (current && !(await leaveDataGuard())) return;
  if (current) clearPending();
  state.openTables.splice(index, 1);
  let selectedTable = null;
  if (current) {
    state.table = state.openTables[Math.min(index, state.openTables.length - 1)] ?? null;
    selectedTable = state.table;
    state.mode = state.table ? "data" : "tree";
    state.tableView = "data";
    await loadColsPrefs();
  }
  render();
  if (selectedTable && state.table === selectedTable && !selectedTable.page && !selectedTable.loading) {
    await reloadTable(0, undefined, { target: selectedTable });
  }
}

async function reloadTable(offset = 0, order, { target = state.table, preservePending = false } = {}) {
  const t = target;
  if (!t || !state.openTables.includes(t)) return false;
  if (!preservePending && state.table === t && pendingCount()) {
    if (!(await leaveDataGuard())) return false;
    clearPending();
  }

  const connection = state.connId;
  const previous = t.page;
  const requestId = (t.requestId ?? 0) + 1;
  t.requestId = requestId;
  const query = {
    connection,
    schema: t.schema,
    table: t.name,
    offset: String(offset),
    limit: "100",
  };
  if (order) {
    query.order = order;
    if (previous && previous.order === order) query.desc = previous.desc ? "0" : "1";
    else query.desc = "0";
  } else if (previous) {
    query.order = previous.order;
    query.desc = previous.desc ? "1" : "0";
  }
  if (t.filter) {
    query.filterCol = t.filter.col;
    query.filterOp = t.filter.op;
    if (t.filter.val !== undefined && t.filter.val !== "") query.filterVal = t.filter.val;
  }
  let failure = null;
  t.loading = true;
  if (state.table === t && state.mode === "data") render();
  try {
    const page = await svc("GET", "/table", { query });
    if (t.requestId !== requestId || state.connId !== connection || !state.openTables.includes(t)) return true;
    t.loading = false;
    t.page = page;
    if (currentKind() === "mongodb") {
      const meta = findTableMeta(t.schema, t.name);
      if (meta) {
        meta.columns = page.columnMeta;
        meta.primaryKey = "_id";
      }
    }
  } catch (error) {
    if (t.requestId !== requestId || state.connId !== connection || !state.openTables.includes(t)) return true;
    t.loading = false;
    failure = error.message;
  }
  if (state.table === t && state.mode === "data") {
    render();
    if (failure) showBanner(failure);
  }
  return true;
}

async function runSql() {
  const sql = state.sql.trim();
  if (!sql || state.sqlBusy) return;
  const connection = state.connId;
  const table = state.table;
  const runId = ++state.sqlRunId;
  const readOnly = /^(select|with|explain|table|show|values)\b/i.test(sql);
  state.sqlBusy = true;
  if (viewEl._run) viewEl._run.disabled = true;
  if (viewEl._explain) viewEl._explain.disabled = true;
  try {
    if (!readOnly) {
      const ok = await confirmDialog(`Run this change?\n\n${sql.slice(0, 200)}${sql.length > 200 ? "…" : ""}`);
      if (!ok || runId !== state.sqlRunId || connection !== state.connId) return;
    }
    const result = readOnly
      ? await svc("POST", "/query", { body: { connection, sql, limit: 200 } })
      : await svc("POST", "/execute", { body: { connection, sql } });
    if (runId !== state.sqlRunId || connection !== state.connId) return;
    state.sqlResult = result;
    renderSqlResult();
    loadHistory();
    if (!readOnly && table && state.table === table && state.mode === "data") {
      await reloadTable(table.page?.offset ?? 0);
    }
  } catch (error) {
    if (runId !== state.sqlRunId || connection !== state.connId) return;
    state.sqlResult = null;
    showBanner(error.message);
    toast("error", error.message);
  } finally {
    if (runId === state.sqlRunId) {
      state.sqlBusy = false;
      if (viewEl._run) viewEl._run.disabled = false;
      if (viewEl._explain) viewEl._explain.disabled = false;
    }
  }
}

async function runExplain() {
  const sql = state.sql.trim().replace(/;+\s*$/, "");
  if (!sql || state.sqlBusy) return;
  if (!/^(select|with)\b/i.test(sql)) {
    toast("info", "Explain is available for SELECT queries.");
    return;
  }
  const connection = state.connId;
  const runId = ++state.sqlRunId;
  state.sqlBusy = true;
  if (viewEl._run) viewEl._run.disabled = true;
  if (viewEl._explain) viewEl._explain.disabled = true;
  try {
    const result = await svc("POST", "/query", {
      body: { connection, sql: `explain analyze ${sql}`, limit: 200 },
    });
    if (runId !== state.sqlRunId || connection !== state.connId) return;
    state.sqlResult = result;
    renderSqlResult();
  } catch (error) {
    if (runId !== state.sqlRunId || connection !== state.connId) return;
    state.sqlResult = null;
    showBanner(error.message);
    toast("error", error.message);
  } finally {
    if (runId === state.sqlRunId) {
      state.sqlBusy = false;
      if (viewEl._run) viewEl._run.disabled = false;
      if (viewEl._explain) viewEl._explain.disabled = false;
    }
  }
}

// ---------- edit dialogs ----------

function editCellDialog(row, col) {
  const t = state.table;
  const connection = state.connId;
  const page = t?.page;
  if (!t || !page) return;
  const colIndex = page.columns.indexOf(col);
  const current = row[colIndex];
  const meta = page.columnMeta.find((c) => c.name === col);
  const pkIndex = page.columns.indexOf(page.pk);
  const pkVal = row[pkIndex];
  let isNull = current === null;
  dialog({
    title: `Edit: ${t.schema}.${t.name}`,
    build: (body) => {
      dialogBodyRef = body;
      const label = el("label", "fld", `${col} — ${meta?.type ?? ""}${meta?.nullable ? "" : " NOT NULL"}`);
      label.prepend(typeBadge(meta?.type));
      const longValue = current !== null && (String(current).length > 60 || String(current).includes("\n"));
      const input = longValue ? el("textarea") : el("input");
      if (!longValue) input.type = "text";
      input.value = current === null ? "" : esc(current);
      if (!isNull) setTimeout(() => input.focus(), 30);
      label.appendChild(input);
      body.appendChild(label);
      const nullLabel = el("label");
      nullLabel.style.cssText = "display:flex;gap:6px;align-items:center;font-size:12px;color:var(--oc-muted,#999)";
      const checkbox = el("input");
      checkbox.type = "checkbox";
      checkbox.checked = isNull;
      checkbox.addEventListener("change", () => {
        isNull = checkbox.checked;
        input.disabled = isNull;
      });
      nullLabel.append(checkbox, document.createTextNode("NULL"));
      body.appendChild(nullLabel);
      body._input = input;
    },
    actions: [
      { label: "Cancel", value: null },
      {
        label: "Stage change",
        kind: "primary",
        onClick: async (done) => {
          if (!isCurrentTableContext(t, connection)) { done(null); return; }
          const body = dialogBodyRef;
          const newValue = isNull ? null : body._input.value;
          if (!isNull && newValue === esc(current)) { done(null); return; }
          if (!stageEdit(pkVal, col, current === null ? null : esc(current), newValue, isNull)) {
            done(null);
            toast("info", "This row is marked for deletion. The change was not staged.");
            return;
          }
          toast("info", `Change staged. Pending changes: ${pendingCount()}. Click “Apply”.`);
          done(true);
          render();
        },
      },
    ],
  });
}

function insertDialog() {
  const t = state.table;
  const page = t.page;
  const connection = state.connId;
  let formBody;
  let inserting = false;
  dialog({
    title: `New row: ${t.schema}.${t.name}`,
    isBusy: () => inserting,
    build: (body) => {
      formBody = body;
      const fields = [];
      for (const c of page.columnMeta) {
        const label = el("label", "fld", `${c.name} — ${c.type}${c.nullable ? "" : " NOT NULL"}`);
        label.prepend(typeBadge(c.type));
        const input = el("input");
        input.type = "text";
        input.placeholder = c.nullable ? "blank = omit" : "required";
        label.appendChild(input);
        body.appendChild(label);
        fields.push([c.name, input]);
      }
      body._fields = fields;
      body.appendChild(el("p", null, "Blank fields are omitted. To insert NULL, leave the field blank (provide a value for required columns)."));
    },
    actions: [
      { label: "Cancel", value: null },
      {
        label: "Insert",
        kind: "primary",
        onClick: async (done) => {
          if (inserting) return false;
          const values = {};
          for (const [name, input] of formBody._fields) {
            if (input.value.trim() !== "") values[name] = input.value;
          }
          inserting = true;
          const buttons = [...formBody.parentElement.querySelectorAll(".acts button")];
          buttons.forEach((button) => { button.disabled = true; });
          try {
            const data = await svc("POST", "/row", {
              body: { connection, schema: t.schema, table: t.name, values },
            });
            toast("success", `Inserted ${data.affected} ${plural(data.affected, "row")}.`);
            done(true);
            if (state.connId === connection && state.table === t && state.mode === "data") {
              await reloadTable(0, undefined, { target: t, preservePending: true });
            } else if (state.connId === connection && state.openTables.includes(t)) {
              t.page = null;
            }
          } catch (error) {
            inserting = false;
            buttons.forEach((button) => { button.disabled = false; });
            toast("error", error.message);
            return false;
          }
        },
      },
    ],
  });
}

async function deleteRowDialog(row) {
  const t = state.table;
  const connection = state.connId;
  const page = t?.page;
  if (!t || !page) return;
  const pkIndex = page.columns.indexOf(page.pk);
  const pkVal = esc(row[pkIndex]);
  const already = [...state.pending.values()].some((v) => v.op === "delete" && v.pkVal === pkVal);
  const ok = await confirmDialog(
    already
      ? `Undo deletion of row ${page.pk} = ${pkVal}?`
      : `Delete row ${page.pk} = ${pkVal} from ${t.schema}.${t.name}?\n\nThe deletion will be staged and applied when you click “Apply”.`,
    { yes: already ? "Undo deletion" : "Delete" },
  );
  if (!ok || !isCurrentTableContext(t, connection)) return;
  if (already) {
    state.pending.delete(`${SEP}del${SEP}${pkVal}`);
  } else {
    stageDelete(pkVal);
    toast("info", `Deletion staged. Pending changes: ${pendingCount()}.`);
  }
  render();
}

async function deleteConnection(id) {
  const connection = state.conns.find((item) => item.id === id);
  if (!connection) return;
  const ok = await confirmDialog(`Delete connection “${connection.name}”?`, { yes: "Delete" });
  if (!ok) return;
  const wasCurrent = state.connId === id;
  if (wasCurrent && !(await leaveDataGuard())) return;
  try {
    await svc("DELETE", "/connections", { query: { id } });
    await loadConnections();
    if (wasCurrent) {
      state.schemas = [];
      state.treeReady = false;
      state.expanded.clear();
      state.pgVersion = null;
      resetWorkspace();
      await loadTree().catch(() => {});
    }
    render();
  } catch (error) {
    toast("error", error.message);
  }
}

async function connectionsDialog() {
  await dialog({
    title: "New connection",
    className: "connection-dialog",
    build: (body, done) => {
      dialogBodyRef = body;
      body.style.display = "block";
      const layout = el("div", "connection-create");
      const tabs = el("div", "dbtype-tabs");
      tabs.setAttribute("role", "tablist");
      const form = el("div", "connection-form");
      layout.append(tabs, form);
      body.appendChild(layout);

      let selectedKind = DB_TYPES[currentKind()] ? currentKind() : "postgres";
      const heading = el("div", "form-title");
      const note = el("p", "form-note", "The connection will be tested before saving.");
      const nameLabel = el("label", "fld", "Name");
      const nameInput = el("input");
      nameInput.type = "text";
      nameInput.placeholder = "my-db";
      nameLabel.appendChild(nameInput);
      const dsnLabel = el("label", "fld", "DSN");
      const dsnInput = el("input");
      dsnInput.type = "text";
      dsnInput.spellcheck = false;
      dsnLabel.appendChild(dsnInput);
      const add = el("button", "btn primary", "Test and add");
      add.style.alignSelf = "flex-start";
      form.append(heading, note, nameLabel, dsnLabel, add);

      const paint = () => {
        const type = DB_TYPES[selectedKind];
        heading.textContent = type.label;
        dsnInput.placeholder = type.placeholder;
        for (const button of tabs.children) {
          const active = button.dataset.kind === selectedKind;
          button.classList.toggle("on", active);
          button.setAttribute("aria-selected", active ? "true" : "false");
        }
      };
      for (const [kind, type] of Object.entries(DB_TYPES)) {
        const button = el("button", "dbtype");
        button.dataset.kind = kind;
        button.setAttribute("role", "tab");
        button.append(el("span", "dbmonogram", type.short), el("span", null, type.label));
        button.addEventListener("click", () => {
          if (selectedKind === kind) return;
          selectedKind = kind;
          dsnInput.value = "";
          paint();
          dsnInput.focus();
        });
        tabs.appendChild(button);
      }
      paint();

      add.addEventListener("click", async () => {
        let data;
        try {
          add.disabled = true;
          add.textContent = "Testing…";
          data = await svc("POST", "/connections", {
            body: { name: nameInput.value.trim(), dsn: dsnInput.value.trim(), kind: selectedKind },
          });
        } catch (error) {
          toast("error", error.message);
          add.disabled = false;
          add.textContent = "Test and add";
          return;
        }

        toast("success", `Connected: ${data.connection.name}`);
        await loadConnections();
        done(true);
        if (!(await leaveDataGuard())) {
          render();
          return;
        }
        state.connId = data.connection.id;
        state.schemas = [];
        state.treeReady = false;
        state.expanded.clear();
        state.pgVersion = null;
        resetWorkspace();
        await host.storage.set("prefs", { connection: state.connId }).catch(() => {});
        render();
        try {
          await loadTree();
          loadPgVersion();
        } catch (error) {
          render();
          showBanner(error.message);
          return;
        }
        render();
      });
      setTimeout(() => nameInput.focus(), 0);
    },
    actions: [{ label: "Done", kind: "primary" }],
  });
}

// ---------- boot ----------

let booted = false;

host.onReady(async (ctx) => {
  applyHostReady(ctx, document.documentElement);
  if (booted) return; // the host may send ready again (panel shown, theme changed)
  booted = true;
  buildChrome();
  render();
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openPalette();
      return;
    }
  });
  try {
    await loadColsPrefs();
    const prefs = await host.storage.get("prefs").catch(() => undefined);
    if (prefs && typeof prefs === "object" && prefs.connection) state.connId = prefs.connection;
    await loadConnections();
    await loadTree();
    loadPgVersion();
  } catch (error) {
    render();
    showBanner(error.message ?? "Failed to load data.");
    return;
  }
  render();
});
