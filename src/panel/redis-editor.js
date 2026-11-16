// Redis/Valkey key lifecycle and optimistic typed-value editing.

export const REDIS_EDITOR_CSS = `
.sheet.redis-key-editor { width: min(92%, 540px); }
.sheet.redis-key-editor .sbody { gap: 10px; }
.redis-key-meta { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 3px 9px; font-size: 10.5px; }
.redis-key-meta dt { color: var(--oc-muted, #999); }
.redis-key-meta dd { margin: 0; min-width: 0; overflow-wrap: anywhere; font-family: var(--oc-mono, ui-monospace, monospace); }
.redis-section { border: 1px solid var(--oc-border, #333); border-radius: var(--oc-radius, 8px); padding: 8px; min-width: 0; }
.redis-section-head { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-bottom: 7px; }
.redis-section-head h4 { margin: 0; flex: 1; font-size: 11px; }
.redis-section-note { color: var(--oc-muted, #999); font-size: 10px; line-height: 1.45; }
.redis-warning { color: var(--oc-warning, #d29922); font-size: 10.5px; line-height: 1.5; }
.redis-error { color: var(--oc-error-text, #f88); font-size: 11px; white-space: pre-wrap; overflow-wrap: anywhere; }
.redis-read-limits { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 6px; align-items: end; }
.redis-read-limits label, .redis-ttl-row label { display: flex; flex-direction: column; gap: 3px; color: var(--oc-muted, #999); font-size: 10px; min-width: 0; }
.redis-key-editor input, .redis-create-form input, .redis-operation-form input {
  width: 100%; min-width: 0; padding: 5px 7px; border: 1px solid var(--oc-border, #333); border-radius: 6px;
  background: var(--oc-bg, #1e1e1e); color: var(--oc-fg, #eee); font: 11px/1.4 var(--oc-mono, ui-monospace, monospace);
}
.redis-ttl-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 6px; align-items: end; }
.redis-entry { border-top: 1px solid color-mix(in srgb, var(--oc-border, #333) 65%, transparent); padding: 7px 0; min-width: 0; }
.redis-entry:first-child { border-top: 0; padding-top: 0; }
.redis-entry:last-child { padding-bottom: 0; }
.redis-entry-head { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
.redis-entry-title { flex: 1; min-width: 80px; color: var(--oc-primary-text, #9dc1ff); font: 600 10.5px var(--oc-mono, ui-monospace, monospace); overflow-wrap: anywhere; }
.redis-entry-value { margin: 0; max-height: 150px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--oc-fg, #ddd); font: 10.5px/1.5 var(--oc-mono, ui-monospace, monospace); }
.redis-entry-value.empty { color: var(--oc-subtle, #777); font-style: italic; }
.redis-entry-actions { display: flex; gap: 3px; flex-wrap: wrap; }
.redis-stream-fields { display: flex; flex-direction: column; gap: 7px; }
.redis-stream-field { border: 1px solid var(--oc-border, #333); border-radius: 6px; padding: 7px; }
.redis-stream-field .redis-entry-head { margin-bottom: 5px; }
.redis-create-form, .redis-operation-form { display: flex; flex-direction: column; gap: 10px; }
.redis-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.redis-form-grid .wide { grid-column: 1 / -1; }
.redis-operation-form label.fld, .redis-create-form label.fld { min-width: 0; }
.redis-operation-form textarea, .redis-create-form textarea { min-height: 90px; max-height: 35vh; }
.redis-key-editor footer { flex-wrap: wrap; }
.redis-key-editor footer .spacer { flex: 1; }
@media (max-width: 560px) {
  .sheet.redis-key-editor { width: 94%; }
  .redis-read-limits { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .redis-read-limits .btn { grid-column: 1 / -1; justify-self: start; }
  .redis-ttl-row { grid-template-columns: minmax(0, 1fr) auto; }
  .redis-ttl-row .persist { grid-column: 1 / -1; justify-self: start; }
  .redis-form-grid { grid-template-columns: minmax(0, 1fr); }
  .redis-form-grid .wide { grid-column: auto; }
}
@media (max-width: 410px) {
  .overlay { padding: 8px; }
  .redis-key-editor .sbody { padding-inline: 9px; }
  .redis-read-limits, .redis-ttl-row { grid-template-columns: minmax(0, 1fr); }
  .redis-read-limits .btn, .redis-ttl-row .persist { grid-column: auto; }
}
`;

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const MAX_TTL = 2_147_483_647;

function readPositiveInteger(text, label, max = Number.MAX_SAFE_INTEGER) {
  if (!/^\d+$/.test(String(text).trim())) throw new Error(`${label} must be a non-negative integer.`);
  const value = Number(String(text).trim());
  if (!Number.isSafeInteger(value) || value > max) throw new Error(`${label} must be between 0 and ${max}.`);
  return value;
}

function readTtl(text) {
  if (!String(text).trim()) return null;
  const value = readPositiveInteger(text, "TTL", MAX_TTL);
  if (value < 1) throw new Error(`TTL must be empty or an integer from 1 to ${MAX_TTL} seconds.`);
  return value;
}

function textInput(value = "", placeholder = "") {
  const input = el("input");
  input.type = "text";
  input.value = value ?? "";
  input.placeholder = placeholder;
  input.spellcheck = false;
  return input;
}

function textArea(value = "", placeholder = "") {
  const input = el("textarea");
  input.value = value ?? "";
  input.placeholder = placeholder;
  input.spellcheck = false;
  return input;
}

function field(label, input, wide = false) {
  const wrapper = el("label", `fld${wide ? " wide" : ""}`, label);
  wrapper.appendChild(input);
  return wrapper;
}

function action(label, onClick, { kind = "", enabled = true, title = "" } = {}) {
  const button = el("button", `btn ${kind}`, label);
  button.disabled = !enabled;
  if (title) button.title = title;
  if (enabled) button.addEventListener("click", onClick);
  return button;
}

export function createRedisPanel({ svc, dialog, confirmDialog, toast }) {
  function operationDialog({ connection, title, primary = "Apply", success = "Redis operation applied.", build, onSuccess }) {
    let busy = false;
    let bodyRef = null;
    let errorRef = null;
    return dialog({
      title,
      className: "typed-dialog",
      isBusy: () => busy,
      build: (body) => {
        bodyRef = body;
        const form = el("div", "redis-operation-form");
        body.appendChild(form);
        body._readOperation = build(form);
        errorRef = el("div", "typed-error");
        errorRef.setAttribute("role", "alert");
        body.appendChild(errorRef);
        body.appendChild(el("div", "typed-note", "Value edits use optimistic snapshot checks. Additions, TTL changes, key deletion, and stream operations act on current key state. ⌘/Ctrl+Enter applies."));
      },
      actions: [
        { label: "Cancel", value: null },
        {
          label: primary,
          kind: "primary",
          shortcut: true,
          onClick: async (done) => {
            if (busy) return false;
            let operation;
            try {
              operation = bodyRef._readOperation();
              if (!operation || typeof operation !== "object") throw new Error("The Redis operation is incomplete.");
            } catch (error) {
              errorRef.textContent = error.message;
              return false;
            }
            busy = true;
            errorRef.textContent = "";
            const controls = [...bodyRef.parentElement.querySelectorAll("button, input, textarea, select")];
            const disabled = controls.map((control) => control.disabled);
            controls.forEach((control) => { control.disabled = true; });
            try {
              await svc("POST", "/redis/operation", { body: { connection, operation } });
              done(true);
              toast("success", success);
              await onSuccess?.();
            } catch (error) {
              busy = false;
              controls.forEach((control, index) => { control.disabled = disabled[index]; });
              errorRef.textContent = error.message;
              toast("error", error.message);
              return false;
            }
          },
        },
      ],
    });
  }

  function streamFieldsEditor(container, initial = [{ field: "", value: "" }]) {
    const rows = el("div", "redis-stream-fields");
    const addRow = (entry = { field: "", value: "" }) => {
      const row = el("div", "redis-stream-field");
      const head = el("div", "redis-entry-head");
      head.appendChild(el("span", "redis-entry-title", "Field / value"));
      const remove = el("button", "iconbtn danger", "Remove");
      remove.type = "button";
      remove.disabled = rows.childElementCount === 0;
      remove.addEventListener("click", () => {
        if (rows.childElementCount <= 1) return;
        row.remove();
        for (const item of rows.children) {
          const button = item.querySelector(".iconbtn");
          if (button) button.disabled = rows.childElementCount <= 1;
        }
      });
      head.appendChild(remove);
      const name = textInput(entry.field, "field");
      name.dataset.role = "field";
      const value = textArea(entry.value, "value");
      value.dataset.role = "value";
      row.append(head, field("Field", name), field("Value", value));
      rows.appendChild(row);
      for (const item of rows.children) {
        const button = item.querySelector(".iconbtn");
        if (button) button.disabled = rows.childElementCount <= 1;
      }
    };
    initial.forEach(addRow);
    const add = el("button", "iconbtn", "+ Add field");
    add.type = "button";
    add.addEventListener("click", () => addRow());
    container.append(rows, add);
    return () => [...rows.children].map((row) => ({
      field: row.querySelector("[data-role=field]").value,
      value: row.querySelector("[data-role=value]").value,
    }));
  }

  function openCreate({ connection, onCreated }) {
    let type = "string";
    return operationDialog({
      connection,
      title: "New Redis key",
      primary: "Create key",
      success: "Redis key created.",
      onSuccess: onCreated,
      build: (body) => {
        body.classList.add("redis-create-form");
        const key = textInput("", "key");
        const typeInput = el("select");
        for (const value of ["string", "hash", "list", "set", "zset", "stream"]) {
          const option = el("option", null, value);
          option.value = value;
          typeInput.appendChild(option);
        }
        const ttl = textInput("", "No expiry");
        const common = el("div", "redis-form-grid");
        common.append(field("Key", key, true), field("Type", typeInput), field("TTL seconds (optional)", ttl));
        body.appendChild(common);

        const stringValue = textArea("", "Value");
        const hashField = textInput("", "field");
        const hashValue = textArea("", "value");
        const listValue = textArea("", "value");
        const setMember = textInput("", "member");
        const zsetMember = textInput("", "member");
        const zsetScore = textInput("0", "0, 1.5, +inf, -inf");
        const streamId = textInput("*", "* or 1710000000000-0");
        const streamFields = el("div");
        const readStreamFields = streamFieldsEditor(streamFields);

        const sections = new Map();
        const addSection = (kind, nodes) => {
          const section = el("div", "redis-operation-form");
          section.append(...nodes);
          sections.set(kind, section);
          body.appendChild(section);
        };
        addSection("string", [field("String value", stringValue)]);
        addSection("hash", [field("Field", hashField), field("Value", hashValue)]);
        addSection("list", [field("First list value", listValue)]);
        addSection("set", [field("Member", setMember)]);
        addSection("zset", [field("Member", zsetMember), field("Score", zsetScore)]);
        addSection("stream", [field("Entry ID", streamId), field("Fields", streamFields)]);
        const paint = () => {
          for (const [kind, section] of sections) section.style.display = kind === type ? "" : "none";
        };
        typeInput.addEventListener("change", () => { type = typeInput.value; paint(); });
        paint();
        setTimeout(() => key.focus(), 30);
        return () => {
          if (!key.value.length) throw new Error("Redis key is required.");
          const operation = { op: "create", key: key.value, type, ttl: readTtl(ttl.value) };
          if (type === "string") operation.value = stringValue.value;
          else if (type === "hash") operation.entries = [{ field: hashField.value, value: hashValue.value }];
          else if (type === "list") operation.entries = [{ value: listValue.value }];
          else if (type === "set") operation.entries = [{ member: setMember.value }];
          else if (type === "zset") {
            if (!zsetScore.value.trim()) throw new Error("Sorted-set score is required.");
            operation.entries = [{ member: zsetMember.value, score: zsetScore.value.trim() }];
          } else {
            operation.entries = [{ id: streamId.value.trim() || "*", fields: readStreamFields() }];
          }
          return operation;
        };
      },
    });
  }

  function openKey({ connection, key, type, onListRefresh }) {
    const wrap = el("div", "sheetwrap");
    const sheet = el("div", "sheet redis-key-editor");
    const header = el("header");
    const title = el("h3", null, `Redis ${type} key`);
    const closeButton = el("button", "iconbtn", "✕");
    closeButton.title = "Close Key Editor";
    header.append(title, closeButton);
    const body = el("div", "sbody");
    const footer = el("footer");
    sheet.append(header, body, footer);
    wrap.appendChild(sheet);

    let snapshot = null;
    let loading = false;
    let busy = false;
    let closed = false;
    let errorText = "";
    let limit = 500;
    let valueLimit = 262144;
    let limitDraft = String(limit);
    let valueLimitDraft = String(valueLimit);
    let ttlDraft = "";

    const locked = () => busy || loading;
    function close() {
      if (busy || closed) return;
      closed = true;
      wrap.remove();
      document.removeEventListener("keydown", onKey, true);
    }
    closeButton.addEventListener("click", close);
    wrap.addEventListener("mousedown", (event) => { if (event.target === wrap) close(); });
    const onKey = (event) => {
      if (document.querySelector(".overlay")) return;
      if (event.key === "Escape") { event.stopPropagation(); close(); }
    };
    document.addEventListener("keydown", onKey, true);

    async function load() {
      if (closed) return;
      loading = true;
      errorText = "";
      render();
      try {
        const next = await svc("GET", "/redis/key", {
          query: { connection, key, type, limit: String(limit), valueLimit: String(valueLimit) },
        });
        if (closed) return;
        snapshot = next;
        ttlDraft = next.ttl > 0 ? String(next.ttl) : "";
      } catch (error) {
        if (!closed) {
          snapshot = null;
          errorText = error.message;
        }
      } finally {
        if (!closed) {
          loading = false;
          render();
        }
      }
    }

    async function runDirect(operation, { success = "Redis operation applied.", removeKey = false, refreshList = false } = {}) {
      if (locked() || closed) return;
      busy = true;
      errorText = "";
      render();
      try {
        await svc("POST", "/redis/operation", { body: { connection, operation } });
        toast("success", success);
        if (removeKey) {
          busy = false;
          close();
          await onListRefresh?.();
          return;
        }
        await load();
        if (refreshList) await onListRefresh?.();
      } catch (error) {
        if (!closed) {
          errorText = error.message;
          toast("error", error.message);
        }
      } finally {
        if (!closed) {
          busy = false;
          render();
        }
      }
    }

    function mutation(options) {
      if (locked() || !snapshot) return;
      return operationDialog({
        connection,
        ...options,
        onSuccess: async () => { await load(); },
      });
    }

    function editString() {
      const original = snapshot;
      mutation({
        title: `Edit string — ${key}`,
        primary: "Save string",
        success: "String value updated.",
        build: (form) => {
          const value = textArea(original.value, "Redis string value");
          form.appendChild(field("Full string value", value));
          setTimeout(() => value.focus(), 30);
          return () => ({ op: "string.set", key, expectedValue: original.value, value: value.value });
        },
      });
    }

    function hashForm(entry = null) {
      const original = snapshot;
      mutation({
        title: entry ? `Edit hash field — ${entry.field}` : `Add hash field — ${key}`,
        primary: entry ? "Save field" : "Add field",
        success: entry ? "Hash field updated." : "Hash field added.",
        build: (form) => {
          const name = textInput(entry?.field ?? "", "field");
          if (entry) name.disabled = true;
          const value = textArea(entry?.value ?? "", "value");
          form.append(field("Field", name), field("Value", value));
          setTimeout(() => (entry ? value : name).focus(), 30);
          return () => entry
            ? { op: "hash.update", key, field: entry.field, expectedValue: entry.value, value: value.value }
            : { op: "hash.add", key, field: name.value, value: value.value };
        },
      });
    }

    function listForm(entry = null, insert = false) {
      const original = snapshot;
      const isInsert = insert || !entry;
      mutation({
        title: isInsert ? `Insert list value — ${key}` : `Edit list index ${entry.index} — ${key}`,
        primary: isInsert ? "Insert value" : "Save value",
        success: isInsert ? "List value inserted." : "List value updated.",
        build: (form) => {
          const index = textInput(String(isInsert ? (entry?.index ?? original.total) : entry.index), "0");
          if (!isInsert) index.disabled = true;
          const value = textArea(isInsert ? "" : entry.value, "value");
          form.append(field("Zero-based index", index), field("Value", value));
          form.appendChild(el("div", "typed-note", isInsert
            ? `Expected list length: ${original.total}. Inserting before an existing item also checks its exact current value.`
            : "The exact value at this index is checked before updating."));
          setTimeout(() => value.focus(), 30);
          return () => {
            if (isInsert) {
              const at = readPositiveInteger(index.value, "List index", original.total);
              const operation = { op: "list.insert", key, index: at, value: value.value, expectedLength: original.total };
              if (at < original.total) {
                const pivot = original.entries[at];
                if (!pivot || pivot.truncated) throw new Error("The insertion pivot is unavailable or truncated. Reload a complete snapshot first.");
                operation.expectedValue = pivot.value;
              }
              return operation;
            }
            return { op: "list.update", key, index: entry.index, expectedValue: entry.value, value: value.value };
          };
        },
      });
    }

    function setForm(entry = null) {
      mutation({
        title: entry ? `Replace set member — ${key}` : `Add set member — ${key}`,
        primary: entry ? "Replace member" : "Add member",
        success: entry ? "Set member replaced." : "Set member added.",
        build: (form) => {
          const member = textInput(entry?.member ?? "", "member");
          form.appendChild(field(entry ? "New member" : "Member", member));
          setTimeout(() => member.focus(), 30);
          return () => entry
            ? { op: "set.replace", key, member: entry.member, newMember: member.value }
            : { op: "set.add", key, member: member.value };
        },
      });
    }

    function zsetForm(entry = null, rename = false) {
      mutation({
        title: entry ? `${rename ? "Rename" : "Edit score"} — ${entry.member}` : `Add sorted-set member — ${key}`,
        primary: entry ? "Save member" : "Add member",
        success: entry ? "Sorted-set member updated." : "Sorted-set member added.",
        build: (form) => {
          const member = textInput(rename || !entry ? entry?.member ?? "" : entry.member, "member");
          if (entry && !rename) member.disabled = true;
          const score = textInput(entry?.score ?? "0", "0, 1.5, +inf, -inf");
          if (entry && rename) {
            form.append(field("New member", member), field("Score", score));
          } else {
            form.append(field("Member", member), field("Score", score));
          }
          setTimeout(() => (rename || !entry ? member : score).focus(), 30);
          return () => {
            if (!score.value.trim()) throw new Error("Sorted-set score is required.");
            if (!entry) return { op: "zset.add", key, member: member.value, score: score.value.trim() };
            if (rename) return {
              op: "zset.replace", key, member: entry.member, newMember: member.value,
              expectedScore: String(entry.score), score: score.value.trim(),
            };
            return { op: "zset.score", key, member: entry.member, expectedScore: String(entry.score), score: score.value.trim() };
          };
        },
      });
    }

    function streamAppend() {
      mutation({
        title: `Append stream entry — ${key}`,
        primary: "Append entry",
        success: "Stream entry appended.",
        build: (form) => {
          const id = textInput("*", "* or 1710000000000-0");
          const fields = el("div");
          const readFields = streamFieldsEditor(fields);
          form.append(field("Entry ID", id), field("Fields", fields));
          form.appendChild(el("div", "typed-note", "Stream entries are append-only in this editor. Existing entries can be deleted but never modified in place."));
          setTimeout(() => id.focus(), 30);
          return () => ({ op: "stream.add", key, id: id.value.trim() || "*", fields: readFields() });
        },
      });
    }

    async function deleteEntry(entry) {
      if (locked() || !snapshot) return;
      const current = snapshot;
      let operation;
      let subject;
      if (current.type === "hash") {
        operation = { op: "hash.delete", key, field: entry.field, expectedValue: entry.value };
        subject = `hash field “${entry.field}”`;
      } else if (current.type === "list") {
        operation = { op: "list.delete", key, index: entry.index, expectedValue: entry.value };
        subject = `list index ${entry.index}`;
      } else if (current.type === "set") {
        operation = { op: "set.remove", key, member: entry.member };
        subject = "this set member";
      } else if (current.type === "zset") {
        operation = { op: "zset.remove", key, member: entry.member, expectedScore: String(entry.score) };
        subject = `sorted-set member “${entry.member}”`;
      } else {
        operation = { op: "stream.delete", key, id: entry.id };
        subject = `stream entry ${entry.id}`;
      }
      if (!(await confirmDialog(`Delete ${subject} from Redis key “${key}”?`, { yes: "Delete" }))) return;
      const removesEmptyKey = current.total === 1 && ["hash", "list", "set", "zset"].includes(current.type);
      await runDirect(operation, {
        success: removesEmptyKey ? "Redis entry deleted; refreshing the key list." : "Redis entry deleted.",
        removeKey: removesEmptyKey,
      });
    }

    function renderEntry(entry) {
      const box = el("div", "redis-entry");
      const head = el("div", "redis-entry-head");
      let label;
      let value;
      if (snapshot.type === "hash") { label = entry.field; value = entry.value; }
      else if (snapshot.type === "list") { label = `index ${entry.index}`; value = entry.value; }
      else if (snapshot.type === "set") { label = "member"; value = entry.member; }
      else if (snapshot.type === "zset") { label = `score ${entry.score}`; value = entry.member; }
      else { label = entry.id; value = entry.fields.map((item) => `${item.field} = ${item.value}`).join("\n"); }
      head.appendChild(el("span", "redis-entry-title", label));
      const actions = el("div", "redis-entry-actions");
      const stream = snapshot.type === "stream";
      const editable = !stream && snapshot.writable && !entry.truncated && !locked();
      const reason = snapshot.truncated && !stream
        ? "Reload a complete, untruncated snapshot before editing."
        : entry.truncated && !stream ? "This entry is truncated and cannot be edited safely." : "";
      if (!stream) {
        const editLabel = snapshot.type === "set" ? "Replace" : snapshot.type === "zset" ? "Score" : "Edit";
        const editHandler = snapshot.type === "hash" ? () => hashForm(entry)
          : snapshot.type === "list" ? () => listForm(entry)
            : snapshot.type === "set" ? () => setForm(entry)
              : () => zsetForm(entry);
        actions.appendChild(action(editLabel, editHandler, { enabled: editable, title: reason }));
        if (snapshot.type === "list") actions.appendChild(action("Insert before", () => listForm(entry, true), { enabled: editable, title: reason }));
        if (snapshot.type === "zset") actions.appendChild(action("Rename", () => zsetForm(entry, true), { enabled: editable, title: reason }));
      }
      const removable = stream ? !locked() : editable;
      actions.appendChild(action("Delete", () => deleteEntry(entry), { kind: "danger", enabled: removable, title: reason }));
      head.appendChild(actions);
      box.appendChild(head);
      const pre = el("pre", `redis-entry-value${value === "" ? " empty" : ""}`, value === "" ? "(empty string)" : value);
      box.appendChild(pre);
      if (entry.truncated) box.appendChild(el("div", "redis-warning", stream
        ? "Some field values are truncated. Append and delete by entry ID remain available; field content is read-only."
        : "This value is truncated. Its edit and delete actions are disabled to prevent data loss."));
      return box;
    }

    function renderSnapshot() {
      const meta = el("dl", "redis-key-meta");
      meta.append(el("dt", null, "Key"), el("dd", null, snapshot.key));
      meta.append(el("dt", null, "Type"), el("dd", null, snapshot.type));
      meta.append(el("dt", null, "TTL"), el("dd", null, snapshot.ttl === -1 ? "No expiry (-1)" : `${snapshot.ttl} seconds`));
      body.appendChild(meta);

      const limits = el("div", "redis-section");
      const limitHead = el("div", "redis-section-head");
      limitHead.appendChild(el("h4", null, "Snapshot read limits"));
      limits.appendChild(limitHead);
      const readLimits = el("div", "redis-read-limits");
      const limitInput = textInput(limitDraft, "1–500");
      const valueInput = textInput(valueLimitDraft, "1–1000000");
      limitInput.addEventListener("input", () => { limitDraft = limitInput.value; });
      valueInput.addEventListener("input", () => { valueLimitDraft = valueInput.value; });
      const reload = action("Reload", async () => {
        if (locked()) return;
        try {
          const nextLimit = readPositiveInteger(limitDraft, "Entry limit", 500);
          const nextValueLimit = readPositiveInteger(valueLimitDraft, "Value byte limit", 1_000_000);
          if (nextLimit < 1 || nextValueLimit < 1) throw new Error("Read limits must be positive.");
          limit = nextLimit;
          valueLimit = nextValueLimit;
          await load();
        } catch (error) {
          errorText = error.message;
          render();
        }
      }, { enabled: !locked() });
      readLimits.append(field("Entries (max 500)", limitInput), field("Value bytes (max 1,000,000)", valueInput), reload);
      limits.appendChild(readLimits);
      body.appendChild(limits);

      const ttlSection = el("div", "redis-section");
      const ttlHead = el("div", "redis-section-head");
      ttlHead.appendChild(el("h4", null, "Expiration"));
      ttlSection.appendChild(ttlHead);
      const ttlRow = el("div", "redis-ttl-row");
      const ttlInput = textInput(ttlDraft, "No expiry");
      ttlInput.disabled = locked();
      ttlInput.addEventListener("input", () => { ttlDraft = ttlInput.value; });
      const setTtl = action("Set expiry", () => {
        try {
          const ttl = readTtl(ttlInput.value);
          if (ttl === null) throw new Error("Enter a positive TTL, or use Remove expiry.");
          runDirect({ op: "ttl", key, ttl }, { success: "Redis TTL updated.", refreshList: true });
        } catch (error) {
          errorText = error.message;
          render();
        }
      }, { enabled: !locked() });
      const persist = action("Remove expiry", () => runDirect({ op: "ttl", key, ttl: null }, { success: "Redis expiry removed.", refreshList: true }), {
        enabled: !locked() && snapshot.ttl !== -1,
        title: snapshot.ttl === -1 ? "This key already has no expiry." : "Keep the key until it is deleted.",
      });
      persist.classList.add("persist");
      ttlRow.append(field("TTL seconds", ttlInput), setTtl, persist);
      ttlSection.appendChild(ttlRow);
      ttlSection.appendChild(el("div", "redis-section-note", "TTL changes apply to the key's current state, not only the loaded snapshot."));
      body.appendChild(ttlSection);

      if (snapshot.truncated) {
        const detail = snapshot.entriesTruncated
          ? `Showing ${snapshot.returned} of ${snapshot.total} entries. Increase the entry limit and reload.`
          : "One or more values are truncated. Increase the value byte limit and reload.";
        body.appendChild(el("div", "redis-warning", `${detail} ${snapshot.type === "stream" ? "Stream append/delete remain available." : "All value mutations are disabled until the snapshot is complete."} The service caps reads at 500 entries and 1,000,000 bytes per value.`));
      }

      if (snapshot.type === "string") {
        const section = el("div", "redis-section");
        const head = el("div", "redis-section-head");
        head.appendChild(el("h4", null, "String value"));
        head.appendChild(action("Edit string", editString, {
          kind: "primary",
          enabled: snapshot.writable && !snapshot.truncated && !locked(),
          title: snapshot.truncated ? "A truncated string cannot be overwritten. Increase the byte limit first." : "",
        }));
        section.appendChild(head);
        section.appendChild(el("pre", `redis-entry-value${snapshot.value === "" ? " empty" : ""}`, snapshot.value === "" ? "(empty string)" : snapshot.value));
        body.appendChild(section);
        return;
      }

      const section = el("div", "redis-section");
      const head = el("div", "redis-section-head");
      const titles = { hash: "Hash fields", list: "List values", set: "Set members", zset: "Sorted-set members", stream: "Stream entries" };
      head.appendChild(el("h4", null, `${titles[snapshot.type]} · ${snapshot.returned}/${snapshot.total}`));
      const addLabels = { hash: "Add field", list: "Append / insert", set: "Add member", zset: "Add member", stream: "Append entry" };
      const addHandlers = { hash: () => hashForm(), list: () => listForm(), set: () => setForm(), zset: () => zsetForm(), stream: streamAppend };
      const canAdd = snapshot.type === "stream" ? !locked() : snapshot.writable && !locked();
      head.appendChild(action(addLabels[snapshot.type], addHandlers[snapshot.type], {
        kind: "primary",
        enabled: canAdd,
        title: !canAdd && snapshot.type !== "stream" ? "Reload a complete, untruncated snapshot before structural edits." : "",
      }));
      section.appendChild(head);
      if (snapshot.type === "stream") section.appendChild(el("div", "redis-section-note", "Append and delete only. In-place stream edits and delete/recreate shortcuts are intentionally unavailable."));
      if (!snapshot.entries.length) section.appendChild(el("div", "empty", "This key has no entries."));
      else snapshot.entries.forEach((entry) => section.appendChild(renderEntry(entry)));
      body.appendChild(section);
    }

    function render() {
      if (closed) return;
      title.textContent = `Redis ${snapshot?.type ?? type} key`;
      closeButton.disabled = busy;
      body.innerHTML = "";
      footer.innerHTML = "";
      if (loading) body.appendChild(el("div", "busy", "Loading an editor-safe Redis snapshot…"));
      else if (!snapshot) body.appendChild(el("div", "empty", "The key snapshot is not available."));
      else renderSnapshot();
      if (errorText) {
        const error = el("div", "redis-error", errorText);
        error.setAttribute("role", "alert");
        body.appendChild(error);
        if (!snapshot && !loading) body.appendChild(action("Retry", load, { kind: "primary" }));
      }
      const del = action("Delete key", async () => {
        if (locked() || !snapshot) return;
        if (!(await confirmDialog(`Delete Redis ${snapshot.type} key “${key}” and all of its current values? This operation is not limited to the loaded snapshot.`, { yes: "Delete key" }))) return;
        await runDirect({ op: "delete", key }, { success: "Redis key deleted.", removeKey: true });
      }, { kind: "danger", enabled: !!snapshot && !locked() });
      const spacer = el("span", "spacer");
      const closeFooterButton = action("Close", close, { enabled: !busy });
      footer.append(del, spacer, closeFooterButton);
    }

    document.getElementById("root").appendChild(wrap);
    render();
    load();
    return { close, reload: load };
  }

  return { openCreate, openKey };
}
