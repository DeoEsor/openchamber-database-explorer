(() => {
  // node_modules/@openchamber/sdk/dist/api-version.js
  var OPENCHAMBER_SDK_CHANNEL = "openchamber.sdk";
  var OPENCHAMBER_SDK_API_VERSION = 1;
  // node_modules/@openchamber/sdk/dist/scrollbar-style.js
  var GUEST_SCROLLING_ATTRIBUTE = "data-oc-scrolling";
  var GUEST_SCROLLBAR_CSS = `
:root {
  /* Quiet at rest like the app's own thumbs; hover gives a clear grab target. */
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 18%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 36%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
:hover, [${GUEST_SCROLLING_ATTRIBUTE}] {
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  :hover::-webkit-scrollbar-thumb, [${GUEST_SCROLLING_ATTRIBUTE}]::-webkit-scrollbar-thumb { background: var(--oc-scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;
  function installGuestScrollbarActivity(doc) {
    const root = doc.documentElement;
    if (root.hasAttribute("data-oc-scrollbar-activity"))
      return;
    root.setAttribute("data-oc-scrollbar-activity", "");
    const timers = new WeakMap;
    doc.addEventListener("scroll", (event) => {
      const target = event.target === doc ? root : event.target;
      if (!(target instanceof Element))
        return;
      if (!target.hasAttribute("data-oc-scrolling"))
        target.setAttribute("data-oc-scrolling", "");
      const pending = timers.get(target);
      if (pending !== undefined)
        clearTimeout(pending);
      timers.set(target, setTimeout(() => {
        timers.delete(target);
        target.removeAttribute("data-oc-scrolling");
      }, 1000));
    }, { capture: true, passive: true });
  }
  var GUEST_SCROLLBAR_SCRIPT = `(${installGuestScrollbarActivity.toString()})(document);`;
  // node_modules/@openchamber/sdk/dist/workspace.js
  var GUEST_STORAGE_KEY_MAX = 128;
  var GUEST_STORAGE_VALUE_BYTES = 65536;
  // node_modules/@openchamber/sdk/dist/shells.js
  var GUEST_SHELL_ID_MAX = 128;
  var GUEST_SHELL_OUTPUT_TAIL_MAX = 65536;
  // node_modules/@openchamber/sdk/dist/status-controls.js
  var GUEST_STATUS_CONTROLS_MAX = 4;
  var GUEST_STATUS_CONTROL_ID = /^[a-z][a-z0-9-]{0,39}$/;
  var GUEST_STATUS_CONTROL_LABEL_MAX = 60;
  var GUEST_STATUS_CONTROL_OPTIONS_MAX = 16;
  var GUEST_STATUS_CONTROL_VALUE_MAX = 80;
  var isControlObject = (value) => Object(value) === value && !Array.isArray(value);
  var hasOnlyKeys = (value, keys) => Object.keys(value).every((key) => keys.includes(key));
  var isLabel = (value) => String(value) === value && value.length >= 1 && value.length <= GUEST_STATUS_CONTROL_LABEL_MAX;
  var isValue = (value) => String(value) === value && value.length >= 1 && value.length <= GUEST_STATUS_CONTROL_VALUE_MAX;
  var isGuestStatusControls = (controls) => {
    if (!Array.isArray(controls) || controls.length > GUEST_STATUS_CONTROLS_MAX)
      return false;
    const ids = new Set;
    for (const control of controls) {
      if (!isControlObject(control) || !GUEST_STATUS_CONTROL_ID.test(control.id) || !isLabel(control.label))
        return false;
      if (control.disabled !== undefined && control.disabled !== true && control.disabled !== false)
        return false;
      if (ids.has(control.id))
        return false;
      ids.add(control.id);
      if (control.kind === "button") {
        if (!hasOnlyKeys(control, ["kind", "id", "label", "disabled"]))
          return false;
        continue;
      }
      if (control.kind !== "select" || !hasOnlyKeys(control, ["kind", "id", "label", "value", "options", "disabled"]))
        return false;
      if (!isValue(control.value) || !Array.isArray(control.options) || control.options.length < 1 || control.options.length > GUEST_STATUS_CONTROL_OPTIONS_MAX)
        return false;
      const values = new Set;
      for (const option of control.options) {
        if (!isControlObject(option) || !hasOnlyKeys(option, ["value", "label"]) || !isValue(option.value) || !isLabel(option.label) || values.has(option.value))
          return false;
        values.add(option.value);
      }
      if (!values.has(control.value))
        return false;
    }
    return true;
  };
  // node_modules/@openchamber/sdk/dist/manifest.js
  var TRACKER_URL_TOKENS = ["{id}", "{segment}", "{segments+}"];
  var TRACKER_URL_TOKEN_SET = new Set(TRACKER_URL_TOKENS);
  // node_modules/@openchamber/sdk/dist/session-events.js
  var GUEST_SESSION_EVENT_TYPES = ["turn-finished", "turn-failed", "permission-asked", "question-asked"];
  var SESSION_EVENTS_IDLE_MS = 10 * 60000;
  var EVENT_TYPES = new Set(GUEST_SESSION_EVENT_TYPES);
  // node_modules/@openchamber/sdk/dist/file-editor.js
  var GUEST_FILE_EDITOR_CONTENT_MAX = 20000000;
  var GUEST_FILE_EDITOR_VERSION_MAX = 256;
  var patternExpressions = new Map;
  var fileEditorPayloadSize = (value) => ("bytes" in value) ? value.bytes.byteLength : value.content.length;
  var sameFileEditorDocument = (left, right) => {
    if (left.path !== right.path || left.readOnly !== right.readOnly)
      return false;
    if (left.encoding === "text" || right.encoding === "text") {
      return left.encoding === "text" && right.encoding === "text" && left.content === right.content;
    }
    if (left.bytes.byteLength !== right.bytes.byteLength)
      return false;
    for (let index = 0;index < left.bytes.byteLength; index += 1) {
      if (left.bytes[index] !== right.bytes[index])
        return false;
    }
    return true;
  };
  // node_modules/@openchamber/sdk/dist/popover.js
  var GUEST_POPOVER_ID = /^[A-Za-z0-9_-]{1,80}$/;
  var GUEST_POPOVER_COORDINATE_MAX = 1e5;
  var GUEST_POPOVER_WIDTH_MIN = 160;
  var GUEST_POPOVER_WIDTH_MAX = 640;
  var GUEST_POPOVER_HEIGHT_MIN = 48;
  var GUEST_POPOVER_HEIGHT_MAX = 480;
  var GUEST_POPOVER_DATA_MAX = 16000;
  var GUEST_POPOVER_DATA_DEPTH_MAX = 32;
  var GUEST_POPOVER_SIDES = ["left", "right", "top", "bottom"];
  var hasBoundedJsonTree = (value, depth = 0, budget = { remaining: GUEST_POPOVER_DATA_MAX }) => {
    if (--budget.remaining < 0 || depth >= GUEST_POPOVER_DATA_DEPTH_MAX)
      return false;
    if (value === null)
      return true;
    const children = Array.isArray(value) ? value : Object(value) === value ? Object.values(value) : [];
    for (const item of children) {
      if (!hasBoundedJsonTree(item, depth + 1, budget))
        return false;
    }
    return true;
  };
  var isFiniteJson = (value) => {
    if (value === null || value === true || value === false)
      return true;
    if (Array.isArray(value))
      return Object.keys(value).every((key) => /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length) && value.every(isFiniteJson);
    if (Object(value) === value) {
      const prototype = Object.getPrototypeOf(value);
      return (prototype === null || prototype === Object.prototype) && Object.values(value).every(isFiniteJson);
    }
    return String(value) === value || Number.isFinite(value);
  };
  var isGuestPopoverRequest = (request) => {
    try {
      if (String(request.id) !== request.id || !GUEST_POPOVER_ID.test(request.id) || !Number.isFinite(request.anchor.x) || Math.abs(request.anchor.x) > GUEST_POPOVER_COORDINATE_MAX || !Number.isFinite(request.anchor.y) || Math.abs(request.anchor.y) > GUEST_POPOVER_COORDINATE_MAX || !Number.isFinite(request.anchor.width) || !Number.isFinite(request.anchor.height) || request.anchor.width <= 0 || request.anchor.height <= 0 || request.anchor.width > GUEST_POPOVER_COORDINATE_MAX || request.anchor.height > GUEST_POPOVER_COORDINATE_MAX || !Number.isInteger(request.width) || request.width < GUEST_POPOVER_WIDTH_MIN || request.width > GUEST_POPOVER_WIDTH_MAX || !Number.isInteger(request.height) || request.height < GUEST_POPOVER_HEIGHT_MIN || request.height > GUEST_POPOVER_HEIGHT_MAX || request.side !== undefined && !GUEST_POPOVER_SIDES.includes(request.side) || request.focus !== undefined && request.focus !== true && request.focus !== false || !hasBoundedJsonTree(request.data) || !isFiniteJson(request.data))
        return false;
      return JSON.stringify(request.data).length <= GUEST_POPOVER_DATA_MAX;
    } catch {
      return false;
    }
  };

  // node_modules/@openchamber/sdk/dist/contract.js
  var GUEST_FILE_STAT_KINDS = ["file", "directory", "other", "missing"];
  var isStartSessionResult = (value) => Boolean(value && "sessionId" in value);
  var isPromptResult = (value) => Boolean(value && "sent" in value && !("sessionId" in value));
  var GUEST_COMMIT_SHA = /^[0-9a-f]{7,64}$/i;
  var isGuestCommitSha = (value) => GUEST_COMMIT_SHA.test(value);
  var GUEST_TOAST_MAX = 500;
  var GUEST_CLIPBOARD_TEXT_MAX = 32000;
  var GUEST_COMPOSE_TEXT_MAX = 16000;
  var GUEST_ATTACH_ID_MAX = 128;
  var GUEST_ATTACH_TITLE_MAX = 200;
  var GUEST_ATTACH_URL_MAX = 2000;
  var GUEST_ATTACH_TEXT_MAX = 16000;
  var GUEST_ATTACH_AUTHOR_MAX = 80;
  var GUEST_ATTACH_BRANCH_MAX = 200;
  var GUEST_ATTACH_DATA_MAX = 16000;
  var GUEST_REQUEST_PATH_MAX = 2000;
  var GUEST_REQUEST_TIMEOUT_MS = 20000;
  var GUEST_FILE_PATH_MAX = 1024;
  var GUEST_FILE_CONTENT_MAX = 2000000;
  var GUEST_GENERATE_PROMPT_MAX = 64000;
  var GUEST_GENERATE_SYSTEM_MAX = 8000;
  var GUEST_GENERATE_OUTPUT_TOKENS_MAX = 4000;
  var GUEST_GENERATE_TIMEOUT_MS = 960000;
  var GUEST_GENERATE_LATE_KEEP_MS = 60 * 60000;
  var GUEST_BADGE_MAX = 999;
  var GUEST_FRAME_HEIGHT_MAX = 1e4;
  var GUEST_RESOLVE_ERROR_MAX = 500;
  var HOST_REQUEST_ERROR_CODES = [
    "HOST_UNAVAILABLE",
    "HOST_TIMEOUT",
    "HOST_REJECTED",
    "DISCONNECTED",
    "DISABLED",
    "BAD_PATH",
    "NO_INTEGRATION",
    "NO_SERVICE",
    "SERVICE_FAILED",
    "REQUEST_FAILED",
    "RESPONSE_TOO_LARGE",
    "NO_SESSION",
    "SESSION_BUSY",
    "NOT_GRANTED",
    "NO_DIRECTORY",
    "NOT_FOUND",
    "FILE_TOO_LARGE",
    "DENIED",
    "NO_MODEL",
    "MODEL_FAILED",
    "UNSUPPORTED"
  ];
  var SERVICE_STATUS_VALUES = ["stopped", "starting", "ready", "failed"];
  var hostRequestErrorCodeSet = new Set(HOST_REQUEST_ERROR_CODES);
  var isHostRequestErrorCode = (value) => hostRequestErrorCodeSet.has(value);
  var resolveHostRequestErrorCode = (value) => value && isHostRequestErrorCode(value) ? value : "HOST_REJECTED";
  var isJsonValue = (value) => {
    if (value === undefined)
      return false;
    if (value === null || value === true || value === false)
      return true;
    if (String(value) === value)
      return true;
    if (Number(value) === value)
      return Number.isFinite(value);
    if (Array.isArray(value))
      return value.every(isJsonValue);
    if (Object(value) === value)
      return Object.values(value).every(isJsonValue);
    return false;
  };
  var isAttachData = (value) => isJsonValue(value) && JSON.stringify(value).length <= GUEST_ATTACH_DATA_MAX;
  var clampBranch = (value) => value?.trim().slice(0, GUEST_ATTACH_BRANCH_MAX) ?? "";
  var clampAttachRequest = (request) => {
    const id = request.id.trim().slice(0, GUEST_ATTACH_ID_MAX);
    const title = request.title.trim().slice(0, GUEST_ATTACH_TITLE_MAX);
    const url = request.url.trim().slice(0, GUEST_ATTACH_URL_MAX);
    const text = request.text?.trim().slice(0, GUEST_ATTACH_TEXT_MAX);
    const author = request.author?.trim().slice(0, GUEST_ATTACH_AUTHOR_MAX);
    const kind = request.kind === "pull" ? "pull" : "issue";
    const next = {
      providerId: request.providerId.trim(),
      id,
      title: title || id,
      url,
      kind
    };
    if (text) {
      next.text = text;
    }
    if (author) {
      next.author = author;
    }
    if (kind === "pull") {
      const head = clampBranch(request.branches?.head);
      const base = clampBranch(request.branches?.base);
      if (head && base) {
        next.branches = { head, base };
      }
    }
    if (isAttachData(request.data)) {
      next.data = request.data;
    }
    return next;
  };
  var clampStartSessionRequest = (request) => {
    const next = clampAttachRequest(request);
    if (request.projectId)
      next.projectId = request.projectId;
    if (request.navigation)
      next.navigation = request.navigation;
    if (request.worktree) {
      next.worktree = request.worktree;
    }
    return next;
  };
  var clampPromptRequest = (request) => {
    const next = {
      text: request.text.trim().slice(0, GUEST_COMPOSE_TEXT_MAX)
    };
    if (request.send) {
      next.send = true;
    }
    return next;
  };
  var clampBadgeCount = (count) => {
    if (count === null || !Number.isFinite(count))
      return null;
    return Math.min(GUEST_BADGE_MAX, Math.max(0, Math.round(count)));
  };
  var clampFrameHeight = (height) => {
    if (!Number.isFinite(height))
      return 0;
    return Math.min(GUEST_FRAME_HEIGHT_MAX, Math.max(0, Math.ceil(height)));
  };
  var isGuestFilePath = (value) => value.length > 0 && value.length <= GUEST_FILE_PATH_MAX && !value.includes("\x00") && !value.includes("\\");
  var isGuestRequestPath = (value) => {
    if (!value.startsWith("/") || value.includes("\x00") || value.includes("\\") || value.includes("://")) {
      return false;
    }
    if (value.length > GUEST_REQUEST_PATH_MAX) {
      return false;
    }
    const segments = value.split("/");
    return !segments.some((segment) => segment === "." || segment === "..");
  };
  var serviceStatusSet = new Set(SERVICE_STATUS_VALUES);
  var isServiceStatusResult = (value) => Boolean(value && "status" in value && serviceStatusSet.has(String(value.status)) && !("body" in value));
  var isGuestRequestResult = (value) => Boolean(value && "status" in value && "body" in value && Number.isInteger(value.status));
  var isFileReadResult = (value) => Boolean(value && "content" in value && String(value.content) === value.content);
  var isFileWriteResult = (value) => Boolean(value && "written" in value && value.written === true);
  var isFileListResult = (value) => Boolean(value && "entries" in value && Array.isArray(value.entries));
  var fileStatKindSet = new Set(GUEST_FILE_STAT_KINDS);
  var isFileStatResult = (value) => Boolean(value && "kind" in value && "size" in value && fileStatKindSet.has(String(value.kind)) && Number.isFinite(value.size));
  var isGenerateResult = (value) => Boolean(value && "text" in value && String(value.text) === value.text && !("status" in value));
  var HOST_PUSH_TYPES = new Set([
    "workspace",
    "shells",
    "ready",
    "directory",
    "session",
    "connection",
    "settings",
    "session-lifecycle",
    "item",
    "resolve",
    "action",
    "status-control-event",
    "popover-closed",
    "file-open",
    "file-snapshot",
    "file-saved",
    "generate-late"
  ]);
  var asWireRecord = (data) => Object(data) === data ? data : null;
  var isNonEmptyString = (value) => String(value) === value && value.length > 0;
  var readResultMessage = (wire) => {
    if (!isNonEmptyString(wire.id))
      return null;
    if (wire.ok === true) {
      const message = {
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "result",
        id: wire.id,
        ok: true
      };
      if (Object(wire.payload) === wire.payload) {
        message.payload = wire.payload;
      }
      return message;
    }
    if (wire.ok === false && isNonEmptyString(wire.error)) {
      return {
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "result",
        id: wire.id,
        ok: false,
        error: wire.error,
        code: resolveHostRequestErrorCode(isNonEmptyString(wire.code) ? wire.code : undefined)
      };
    }
    return null;
  };
  var readHostMessage = (data) => {
    const wire = asWireRecord(data);
    if (!wire || wire.channel !== OPENCHAMBER_SDK_CHANNEL || wire.v !== OPENCHAMBER_SDK_API_VERSION)
      return null;
    if (wire.type === "result")
      return readResultMessage(wire);
    if (!HOST_PUSH_TYPES.has(String(wire.type)) || Object(wire.payload) !== wire.payload)
      return null;
    return wire;
  };

  // node_modules/@openchamber/sdk/dist/host.js
  var isKeyEvent = (event) => ("key" in event) && ("metaKey" in event) && ("ctrlKey" in event);
  var isSaveShortcut = (event) => (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s";

  class HostRequestError extends Error {
    code;
    constructor(code, message) {
      super(message);
      this.name = "HostRequestError";
      this.code = code;
    }
  }
  var rejectBadPath = () => Promise.reject(new HostRequestError("BAD_PATH", 'Request path must start with "/" and stay on the declared origin.'));
  var rejectBadFilePath = () => Promise.reject(new HostRequestError("BAD_PATH", `File path must be 1 to ${GUEST_FILE_PATH_MAX} characters without NUL or backslash.`));
  var deviceStorageScope = (options) => {
    if (options === undefined)
      return;
    if (Object(options) !== options || Array.isArray(options) || options.scope !== undefined && options.scope !== "instance" && options.scope !== "device") {
      throw new HostRequestError("HOST_REJECTED", 'Storage scope must be "instance" or "device".');
    }
    return options.scope === "device" ? "device" : undefined;
  };
  var nextId = (n) => {
    n.value += 1;
    return `oc-${n.value}`;
  };
  var connectHost = (options = {}) => {
    const target = options.target ?? ("window" in globalThis ? window : null);
    if (!target) {
      throw new HostRequestError("HOST_UNAVAILABLE", "No window. connectHost runs in a browser frame.");
    }
    const acceptSource = options.acceptSource ?? ((source) => source === target.parent);
    const requestTimeoutMs = options.requestTimeoutMs ?? GUEST_REQUEST_TIMEOUT_MS;
    const readyListeners = new Set;
    const directoryListeners = new Set;
    const sessionListeners = new Set;
    const lifecycleListeners = new Set;
    const connectionListeners = new Set;
    const settingsListeners = new Set;
    const itemListeners = new Set;
    const statusControlListeners = new Set;
    const popoverClosedListeners = new Set;
    const lateGenerateListeners = new Set;
    const unclaimedLateGenerate = [];
    let resolveHandler = null;
    let actionHandler = null;
    const fileOpenListeners = new Set;
    const fileSavedListeners = new Set;
    let fileSnapshotHandler = null;
    let lastFile = null;
    let saveShortcutInstalled = false;
    const pending = new Map;
    const workspaceListeners = new Map;
    const shellsListeners = new Map;
    let disposed = false;
    const ids = { value: 0 };
    let lastReady = null;
    let lastLifecycle = null;
    let popoverPointerActive = false;
    let popoverFocusActive = false;
    let popoverActivityReported = null;
    const lifecycleFromSession = (session) => {
      if (!session)
        return null;
      return {
        sessionId: session.id,
        phase: session.busy ? "started" : "completed"
      };
    };
    const post = (message) => {
      target.parent.postMessage(message, "*");
    };
    const listenForLateGenerate = () => {
      if (disposed || target.parent === target || lateGenerateListeners.size === 0 || lastReady?.features?.lateGenerateResults !== true)
        return;
      post({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: "generate-late-listen" });
    };
    const emit = (listeners, value) => {
      for (const listener of listeners) {
        try {
          listener(value);
        } catch (error) {
          console.error(error);
        }
      }
    };
    const onMessage = (event) => {
      if (!(event instanceof MessageEvent))
        return;
      if (!acceptSource(event.source))
        return;
      const message = readHostMessage(event.data);
      if (!message)
        return;
      if (message.type === "workspace") {
        const listener = workspaceListeners.get(message.payload.subscriptionId);
        if (listener)
          emit([listener], message.payload.snapshot);
        return;
      }
      if (message.type === "shells") {
        const listener = shellsListeners.get(message.payload.subscriptionId);
        if (listener)
          emit([listener], message.payload.snapshot);
        return;
      }
      if (message.type === "ready") {
        lastReady = message.payload;
        lastLifecycle = lifecycleFromSession(message.payload.session);
        emit(readyListeners, message.payload);
        emit(directoryListeners, message.payload.directory);
        emit(sessionListeners, message.payload.session);
        if (lastLifecycle) {
          emit(lifecycleListeners, lastLifecycle);
        }
        emit(connectionListeners, message.payload.connection);
        emit(settingsListeners, message.payload.settings);
        emit(itemListeners, message.payload.item);
        listenForLateGenerate();
        return;
      }
      if (message.type === "generate-late") {
        if (lateGenerateListeners.size === 0)
          unclaimedLateGenerate.push(message.payload);
        else
          emit(lateGenerateListeners, message.payload);
        return;
      }
      if (message.type === "directory") {
        if (lastReady) {
          lastReady = { ...lastReady, directory: message.payload.directory };
        }
        emit(directoryListeners, message.payload.directory);
        return;
      }
      if (message.type === "session") {
        if (lastReady) {
          lastReady = { ...lastReady, session: message.payload.session };
        }
        if (!message.payload.session) {
          lastLifecycle = null;
        } else if (lastLifecycle?.sessionId !== message.payload.session.id) {
          lastLifecycle = lifecycleFromSession(message.payload.session);
        }
        emit(sessionListeners, message.payload.session);
        return;
      }
      if (message.type === "session-lifecycle") {
        lastLifecycle = message.payload;
        emit(lifecycleListeners, message.payload);
        return;
      }
      if (message.type === "connection") {
        if (lastReady) {
          lastReady = { ...lastReady, connection: message.payload.connection };
        }
        emit(connectionListeners, message.payload.connection);
        return;
      }
      if (message.type === "settings") {
        if (lastReady) {
          lastReady = { ...lastReady, settings: message.payload.settings };
        }
        emit(settingsListeners, message.payload.settings);
        return;
      }
      if (message.type === "item") {
        if (lastReady) {
          lastReady = { ...lastReady, item: message.payload.item };
        }
        emit(itemListeners, message.payload.item);
        return;
      }
      if (message.type === "status-control-event") {
        emit(statusControlListeners, message.payload);
        return;
      }
      if (message.type === "popover-closed") {
        emit(popoverClosedListeners, message.payload);
        return;
      }
      if (message.type === "action") {
        const answer = (payload) => {
          if (!disposed)
            post({
              channel: OPENCHAMBER_SDK_CHANNEL,
              v: OPENCHAMBER_SDK_API_VERSION,
              type: "action-result",
              id: message.id,
              payload
            });
        };
        const handler = actionHandler;
        if (!handler) {
          answer({ ok: false, error: "This extension does not handle background actions." });
          return;
        }
        Promise.resolve().then(() => handler(message.payload)).then(() => answer({ ok: true }), (error) => {
          const text = (error instanceof Error ? error.message : String(error)).trim();
          answer({ ok: false, error: (text || "Action failed.").slice(0, GUEST_RESOLVE_ERROR_MAX) });
        });
        return;
      }
      if (message.type === "file-open") {
        const next = message.payload;
        if (lastFile && sameFileEditorDocument(lastFile, next))
          return;
        lastFile = next;
        emit(fileOpenListeners, message.payload);
        return;
      }
      if (message.type === "file-saved") {
        emit(fileSavedListeners, message.payload.version);
        return;
      }
      if (message.type === "file-snapshot") {
        const answer = (payload) => {
          if (!disposed)
            post({
              channel: OPENCHAMBER_SDK_CHANNEL,
              v: OPENCHAMBER_SDK_API_VERSION,
              type: "file-snapshot-result",
              id: message.id,
              payload
            });
        };
        const fail = (text) => answer({ error: (text.trim() || "Could not read the edited file.").slice(0, GUEST_RESOLVE_ERROR_MAX) });
        const handler = fileSnapshotHandler;
        if (!handler) {
          fail("This extension does not edit files.");
          return;
        }
        Promise.resolve().then(() => handler(message.payload.purpose)).then((snapshot) => {
          if (fileEditorPayloadSize(snapshot) > GUEST_FILE_EDITOR_CONTENT_MAX) {
            fail(`The file is over ${GUEST_FILE_EDITOR_CONTENT_MAX} ${"bytes" in snapshot ? "bytes" : "characters"}.`);
            return;
          }
          if (snapshot.version.length > GUEST_FILE_EDITOR_VERSION_MAX) {
            fail(`The snapshot version is over ${GUEST_FILE_EDITOR_VERSION_MAX} characters.`);
            return;
          }
          answer({ snapshot: "bytes" in snapshot ? { bytes: snapshot.bytes, version: snapshot.version } : { content: snapshot.content, version: snapshot.version } });
        }, (error) => fail(error instanceof Error ? error.message : String(error)));
        return;
      }
      if (message.type === "resolve") {
        const answer = (payload) => {
          post({
            channel: OPENCHAMBER_SDK_CHANNEL,
            v: OPENCHAMBER_SDK_API_VERSION,
            type: "resolve-result",
            id: message.id,
            payload
          });
        };
        const handler = resolveHandler;
        if (!handler) {
          answer({ error: "This extension does not resolve commands." });
          return;
        }
        Promise.resolve().then(() => handler(message.payload)).then((item) => answer({ item: item ? clampAttachRequest(item) : null }), (error) => {
          const text = (error instanceof Error ? error.message : String(error)).trim();
          answer({ error: (text || "Command failed.").slice(0, GUEST_RESOLVE_ERROR_MAX) });
        });
        return;
      }
      const waiter = pending.get(message.id);
      if (!waiter)
        return;
      clearTimeout(waiter.timer);
      pending.delete(message.id);
      if (message.ok) {
        waiter.resolve(message.payload);
        return;
      }
      waiter.reject(new HostRequestError(message.code, message.error));
    };
    target.addEventListener("message", onMessage);
    post({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: "hello"
    });
    const send = (message, timeoutMs = requestTimeoutMs) => {
      if (disposed || target.parent === target) {
        return Promise.reject(new HostRequestError("HOST_UNAVAILABLE", "No host frame. This page is not in an iframe."));
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(message.id);
          reject(new HostRequestError("HOST_TIMEOUT", "Host did not answer in time."));
        }, timeoutMs);
        pending.set(message.id, { resolve, reject, timer });
        post(message);
      });
    };
    const request = (message) => send(message).then(() => {
      return;
    });
    const envelope = { channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION };
    const notify = (message) => {
      if (!disposed && target.parent !== target)
        post(message);
    };
    const requestFileSave = () => notify({ ...envelope, type: "file-save" });
    const onSaveShortcut = (event) => {
      if (!isKeyEvent(event) || !isSaveShortcut(event))
        return;
      event.preventDefault();
      requestFileSave();
    };
    const onPopoverEscape = (event) => {
      if (!isKeyEvent(event) || event.key !== "Escape" || lastReady?.surface !== "popover" || !lastReady.popover)
        return;
      event.preventDefault();
      closePopover(lastReady.popover.id, "escape").catch(() => {
        return;
      });
    };
    const reportPopoverActivity = () => {
      const popover = lastReady?.surface === "popover" ? lastReady.popover : undefined;
      if (!popover)
        return;
      const active = popoverPointerActive || popoverFocusActive;
      if (popoverActivityReported === active)
        return;
      popoverActivityReported = active;
      setPopoverAnchorActive(popover.id, active).catch(() => {
        return;
      });
    };
    const onPopoverPointerOver = () => {
      if (lastReady?.surface !== "popover" || popoverPointerActive)
        return;
      popoverPointerActive = true;
      reportPopoverActivity();
    };
    const onPopoverPointerOut = (event) => {
      if (lastReady?.surface !== "popover" || event.relatedTarget !== null || !popoverPointerActive)
        return;
      popoverPointerActive = false;
      reportPopoverActivity();
    };
    const onPopoverFocus = () => {
      if (lastReady?.surface !== "popover" || popoverFocusActive)
        return;
      popoverFocusActive = true;
      reportPopoverActivity();
    };
    const onPopoverBlur = () => {
      if (lastReady?.surface !== "popover" || !popoverFocusActive)
        return;
      popoverFocusActive = false;
      reportPopoverActivity();
    };
    const requireIdentity = (value, maximum = 1024) => {
      if (!value.trim() || value.length > maximum)
        throw new HostRequestError("HOST_REJECTED", `Identity must contain 1 to ${maximum} characters.`);
    };
    const readWorkspace = async (query) => {
      if (query.kind !== "projects")
        requireIdentity(query.projectId);
      const result = await send({ ...envelope, type: "workspace-read", id: nextId(ids), payload: query });
      if (!result || !("kind" in result) || !("state" in result) || result.kind !== query.kind) {
        throw new HostRequestError("HOST_REJECTED", "Host did not return workspace data.");
      }
      return result;
    };
    const subscribeWorkspace = async (query, listener) => {
      if (query.kind !== "projects")
        requireIdentity(query.projectId);
      const subscriptionId = nextId(ids);
      workspaceListeners.set(subscriptionId, listener);
      try {
        await request({ ...envelope, type: "workspace-subscribe", id: nextId(ids), payload: { subscriptionId, query } });
      } catch (error) {
        workspaceListeners.delete(subscriptionId);
        if (!disposed)
          post({ ...envelope, type: "workspace-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        throw error;
      }
      return () => {
        if (!workspaceListeners.delete(subscriptionId) || disposed)
          return;
        post({ ...envelope, type: "workspace-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
      };
    };
    const subscribeShells = async (scope, listener) => {
      if (scope.kind === "session")
        requireIdentity(scope.sessionId);
      if (scope.kind === "project")
        requireIdentity(scope.projectId);
      const subscriptionId = nextId(ids);
      shellsListeners.set(subscriptionId, listener);
      try {
        await request({ ...envelope, type: "shells-subscribe", id: nextId(ids), payload: { subscriptionId, scope } });
      } catch (error) {
        shellsListeners.delete(subscriptionId);
        if (!disposed)
          post({ ...envelope, type: "shells-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        throw error;
      }
      return () => {
        if (!shellsListeners.delete(subscriptionId) || disposed)
          return;
        post({ ...envelope, type: "shells-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
      };
    };
    const storage = async (payload) => {
      if ("key" in payload && (payload.key.length === 0 || payload.key.length > GUEST_STORAGE_KEY_MAX)) {
        throw new HostRequestError("HOST_REJECTED", "Storage key must contain 1 to 128 characters.");
      }
      if (payload.op === "set" && !isJsonValue(payload.value)) {
        throw new HostRequestError("HOST_REJECTED", "Storage values must be JSON.");
      }
      if (payload.op === "set" && new TextEncoder().encode(JSON.stringify(payload.value)).length > GUEST_STORAGE_VALUE_BYTES) {
        throw new HostRequestError("HOST_REJECTED", "Storage value exceeds 64 KiB.");
      }
      if (payload.scope === "device" && lastReady?.features?.deviceStorage !== true) {
        throw new HostRequestError("UNSUPPORTED", "This host does not support device storage.");
      }
      const result = await send({ ...envelope, type: "storage", id: nextId(ids), payload });
      if (!result || !("storage" in result) || result.op !== payload.op)
        throw new HostRequestError("HOST_REJECTED", "Host did not return storage data.");
      return result;
    };
    const closePopover = (id, reason) => lastReady?.features?.popovers !== true && !(lastReady?.surface === "popover" && lastReady.popover?.id === id) ? Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support popovers.")) : request({ ...envelope, type: "popover-close", id: nextId(ids), payload: reason ? { id, reason } : { id } });
    const setPopoverAnchorActive = (id, active) => lastReady?.features?.popovers !== true && !(lastReady?.surface === "popover" && lastReady.popover?.id === id) ? Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support popovers.")) : request({ ...envelope, type: "popover-anchor", id: nextId(ids), payload: { id, active } });
    target.addEventListener("keydown", onPopoverEscape, true);
    target.addEventListener("pointerover", onPopoverPointerOver);
    target.addEventListener("pointermove", onPopoverPointerOver);
    target.addEventListener("pointerout", onPopoverPointerOut);
    target.addEventListener("focus", onPopoverFocus);
    target.addEventListener("blur", onPopoverBlur);
    return {
      onAction: (handler) => {
        actionHandler = handler;
        return () => {
          if (actionHandler === handler)
            actionHandler = null;
        };
      },
      listProjects: async () => {
        const result = await readWorkspace({ kind: "projects" });
        if (result.kind !== "projects")
          throw new HostRequestError("HOST_REJECTED", "Expected projects.");
        return result;
      },
      listWorktrees: async (projectId) => {
        const result = await readWorkspace({ kind: "worktrees", projectId });
        if (result.kind !== "worktrees")
          throw new HostRequestError("HOST_REJECTED", "Expected worktrees.");
        return result;
      },
      listSessions: async (projectId) => {
        const result = await readWorkspace({ kind: "sessions", projectId });
        if (result.kind !== "sessions")
          throw new HostRequestError("HOST_REJECTED", "Expected sessions.");
        return result;
      },
      onProjects: (listener) => subscribeWorkspace({ kind: "projects" }, (snapshot) => {
        if (snapshot.kind === "projects")
          listener(snapshot);
      }),
      onWorktrees: (projectId, listener) => subscribeWorkspace({ kind: "worktrees", projectId }, (snapshot) => {
        if (snapshot.kind === "worktrees")
          listener(snapshot);
      }),
      onSessions: (projectId, listener) => subscribeWorkspace({ kind: "sessions", projectId }, (snapshot) => {
        if (snapshot.kind === "sessions")
          listener(snapshot);
      }),
      onRunningShells: (scope, listener) => subscribeShells(scope, listener),
      readShellOutput: async (shellId, options2) => {
        requireIdentity(shellId, GUEST_SHELL_ID_MAX);
        const cursor = options2?.cursor;
        if (cursor !== undefined && (!Number.isInteger(cursor) || cursor < 0)) {
          throw new HostRequestError("HOST_REJECTED", "Shell output cursor must be a non-negative integer.");
        }
        const tailBytes = options2?.tailBytes;
        if (tailBytes !== undefined && (!Number.isInteger(tailBytes) || tailBytes < 1 || tailBytes > GUEST_SHELL_OUTPUT_TAIL_MAX)) {
          throw new HostRequestError("HOST_REJECTED", `Shell output tailBytes must be an integer between 1 and ${GUEST_SHELL_OUTPUT_TAIL_MAX}.`);
        }
        const result = await send({ ...envelope, type: "shell-output", id: nextId(ids), payload: { shellId, cursor, tailBytes } });
        const output = result;
        if (!output || typeof output.output !== "string" || !Number.isFinite(output.cursor)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return shell output.");
        }
        return output;
      },
      stopShell: async (shellId) => {
        requireIdentity(shellId, GUEST_SHELL_ID_MAX);
        const result = await send({ ...envelope, type: "shell-stop", id: nextId(ids), payload: { shellId } });
        if (result?.stopped !== true)
          throw new HostRequestError("HOST_REJECTED", "Host did not stop the shell.");
        return { stopped: true };
      },
      openSession: async (sessionId) => {
        requireIdentity(sessionId);
        await request({ ...envelope, type: "open-session", id: nextId(ids), payload: { sessionId } });
      },
      storage: {
        get: async (key, options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "get", key };
          if (scope)
            payload.scope = scope;
          const result = await storage(payload);
          return result.op === "get" && result.found ? result.value : undefined;
        },
        set: async (key, value, options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "set", key, value };
          if (scope)
            payload.scope = scope;
          await storage(payload);
        },
        delete: async (key, options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "delete", key };
          if (scope)
            payload.scope = scope;
          await storage(payload);
        },
        keys: async (options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "keys" };
          if (scope)
            payload.scope = scope;
          const result = await storage(payload);
          if (result.op !== "keys")
            throw new HostRequestError("HOST_REJECTED", "Expected storage keys.");
          return result.keys;
        }
      },
      onReady: (listener) => {
        readyListeners.add(listener);
        if (lastReady)
          listener(lastReady);
        return () => {
          readyListeners.delete(listener);
        };
      },
      onDirectory: (listener) => {
        directoryListeners.add(listener);
        if (lastReady)
          listener(lastReady.directory);
        return () => {
          directoryListeners.delete(listener);
        };
      },
      onSession: (listener) => {
        sessionListeners.add(listener);
        if (lastReady)
          listener(lastReady.session);
        return () => {
          sessionListeners.delete(listener);
        };
      },
      onSessionLifecycle: (listener) => {
        lifecycleListeners.add(listener);
        if (lastLifecycle)
          listener(lastLifecycle);
        return () => {
          lifecycleListeners.delete(listener);
        };
      },
      onConnection: (listener) => {
        connectionListeners.add(listener);
        if (lastReady)
          listener(lastReady.connection);
        return () => {
          connectionListeners.delete(listener);
        };
      },
      onSettings: (listener) => {
        settingsListeners.add(listener);
        if (lastReady)
          listener(lastReady.settings);
        return () => {
          settingsListeners.delete(listener);
        };
      },
      onItem: (listener) => {
        itemListeners.add(listener);
        if (lastReady)
          listener(lastReady.item);
        return () => {
          itemListeners.delete(listener);
        };
      },
      onStatusControl: (listener) => {
        statusControlListeners.add(listener);
        return () => {
          statusControlListeners.delete(listener);
        };
      },
      onPopoverClosed: (listener) => {
        popoverClosedListeners.add(listener);
        return () => {
          popoverClosedListeners.delete(listener);
        };
      },
      setStatusControls: (controls) => {
        if (lastReady?.features?.statusControls !== true) {
          return Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support status controls."));
        }
        if (!isGuestStatusControls(controls)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", "Status controls must have unique bounded ids and valid selected options."));
        }
        return request({ ...envelope, type: "status-controls", id: nextId(ids), payload: { controls } });
      },
      openPopover: (payload) => {
        if (lastReady?.features?.popovers !== true) {
          return Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support popovers."));
        }
        if (!isGuestPopoverRequest(payload)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", "Popover requests need bounded geometry and JSON data."));
        }
        return request({ ...envelope, type: "popover-open", id: nextId(ids), payload });
      },
      closePopover,
      setPopoverAnchorActive,
      onResolve: (handler) => {
        resolveHandler = handler;
        return () => {
          if (resolveHandler === handler)
            resolveHandler = null;
        };
      },
      toast: (payload) => {
        const message = payload.message.trim();
        if (!message || message.length > GUEST_TOAST_MAX) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `Toast message must contain 1 to ${GUEST_TOAST_MAX} characters.`));
        }
        if (payload.copy && payload.copy !== true && (!payload.copy.text.length || payload.copy.text.length > GUEST_CLIPBOARD_TEXT_MAX)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `Toast copy text must contain 1 to ${GUEST_CLIPBOARD_TEXT_MAX} characters.`));
        }
        return request({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "toast",
          id: nextId(ids),
          payload: { ...payload, message }
        });
      },
      openUrl: (url) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "open-url",
        id: nextId(ids),
        payload: { url }
      }),
      openCommit: (sha) => isGuestCommitSha(sha) ? request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "open-commit",
        id: nextId(ids),
        payload: { sha }
      }) : Promise.reject(new HostRequestError("HOST_REJECTED", "Commit id must be 7 to 64 hex characters.")),
      openSurface: (surfaceId) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "open-surface",
        id: nextId(ids),
        payload: { surfaceId }
      }),
      writeClipboard: (text) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "clipboard-write",
        id: nextId(ids),
        payload: { text }
      }),
      compose: (payload) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "compose",
        id: nextId(ids),
        payload
      }),
      attach: (payload) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "attach",
        id: nextId(ids),
        payload: clampAttachRequest(payload)
      }),
      startSession: async (payload) => {
        if (payload.projectId !== undefined)
          requireIdentity(payload.projectId);
        const worktree = payload.worktree;
        if (worktree && worktree !== true) {
          if (worktree.kind === "existing")
            requireIdentity(worktree.directory);
          else {
            if (worktree.name !== undefined)
              requireIdentity(worktree.name, 200);
            if (worktree.baseBranch !== undefined)
              requireIdentity(worktree.baseBranch, 200);
          }
        }
        const result = await send({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "start-session",
          id: nextId(ids),
          payload: clampStartSessionRequest(payload)
        }, options.requestTimeoutMs ?? 180000);
        if (!isStartSessionResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return a session.");
        }
        return result;
      },
      prompt: (payload) => send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "prompt",
        id: nextId(ids),
        payload: clampPromptRequest(payload)
      }).then((result) => {
        if (!isPromptResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return a prompt result.");
        }
        return result;
      }),
      sessionLink: (payload) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "session-link",
        id: nextId(ids),
        payload: clampAttachRequest(payload)
      }),
      close: () => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "close",
        id: nextId(ids)
      }),
      oauthStart: () => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "oauth-start",
        id: nextId(ids)
      }),
      oauthDisconnect: () => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "oauth-disconnect",
        id: nextId(ids)
      }),
      request: (payload) => (isGuestRequestPath(payload.path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "request",
        id: nextId(ids),
        payload
      }) : rejectBadPath()).then((result) => {
        if (!isGuestRequestResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host request result was empty.");
        }
        return result;
      }),
      serviceRequest: (payload) => (isGuestRequestPath(payload.path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "service-request",
        id: nextId(ids),
        payload
      }) : rejectBadPath()).then((result) => {
        if (!isGuestRequestResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host service request result was empty.");
        }
        return result;
      }),
      serviceStatus: () => send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "service-status",
        id: nextId(ids)
      }).then((result) => {
        if (!isServiceStatusResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return service status.");
        }
        return result;
      }),
      readFile: (path) => (isGuestFilePath(path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "file-read",
        id: nextId(ids),
        payload: { path }
      }) : rejectBadFilePath()).then((result) => {
        if (!isFileReadResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return file content.");
        }
        return result;
      }),
      writeFile: (path, content) => {
        if (!isGuestFilePath(path)) {
          return rejectBadFilePath();
        }
        if (content.length > GUEST_FILE_CONTENT_MAX) {
          return Promise.reject(new HostRequestError("FILE_TOO_LARGE", `Content is over ${GUEST_FILE_CONTENT_MAX} characters.`));
        }
        return send({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "file-write",
          id: nextId(ids),
          payload: { path, content }
        }).then((result) => {
          if (!isFileWriteResult(result)) {
            throw new HostRequestError("HOST_REJECTED", "Host did not confirm the write.");
          }
          return result;
        });
      },
      listDir: (path) => (isGuestFilePath(path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "file-list",
        id: nextId(ids),
        payload: { path }
      }) : rejectBadFilePath()).then((result) => {
        if (!isFileListResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return directory entries.");
        }
        return result;
      }),
      stat: (path) => (isGuestFilePath(path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "file-stat",
        id: nextId(ids),
        payload: { path }
      }) : rejectBadFilePath()).then((result) => {
        if (!isFileStatResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return file status.");
        }
        return result;
      }),
      generate: (input) => {
        const prompt = input.prompt.trim();
        const system = input.system?.trim();
        if (prompt.length === 0 || prompt.length > GUEST_GENERATE_PROMPT_MAX) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `Prompt must be 1 to ${GUEST_GENERATE_PROMPT_MAX} characters.`));
        }
        if (system !== undefined && (system.length === 0 || system.length > GUEST_GENERATE_SYSTEM_MAX)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `System prompt must be 1 to ${GUEST_GENERATE_SYSTEM_MAX} characters.`));
        }
        const maxOutputTokens = input.maxOutputTokens === undefined ? undefined : Math.min(GUEST_GENERATE_OUTPUT_TOKENS_MAX, Math.max(1, Math.floor(input.maxOutputTokens)));
        if (maxOutputTokens !== undefined && !Number.isFinite(maxOutputTokens)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", "maxOutputTokens must be a number."));
        }
        const payload = { prompt };
        if (system !== undefined)
          payload.system = system;
        if (maxOutputTokens !== undefined)
          payload.maxOutputTokens = maxOutputTokens;
        return send({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "generate",
          id: nextId(ids),
          payload
        }, options.requestTimeoutMs ?? GUEST_GENERATE_TIMEOUT_MS).then((result) => {
          if (!isGenerateResult(result)) {
            throw new HostRequestError("HOST_REJECTED", "Host did not return generated text.");
          }
          return result;
        });
      },
      onLateGenerateResult: (listener) => {
        lateGenerateListeners.add(listener);
        for (const result of unclaimedLateGenerate.splice(0))
          emit([listener], result);
        listenForLateGenerate();
        return () => {
          lateGenerateListeners.delete(listener);
        };
      },
      setBadge: (count) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "badge",
        id: nextId(ids),
        payload: { count: clampBadgeCount(count) }
      }),
      setHeight: (height) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "resize",
        id: nextId(ids),
        payload: { height: clampFrameHeight(height) }
      }),
      onFileOpen: (listener) => {
        fileOpenListeners.add(listener);
        if (!saveShortcutInstalled) {
          saveShortcutInstalled = true;
          target.addEventListener("keydown", onSaveShortcut, true);
        }
        if (lastFile)
          listener(lastFile);
        return () => {
          fileOpenListeners.delete(listener);
        };
      },
      onFileSnapshot: (handler) => {
        fileSnapshotHandler = handler;
        return () => {
          if (fileSnapshotHandler === handler)
            fileSnapshotHandler = null;
        };
      },
      onFileSaved: (listener) => {
        fileSavedListeners.add(listener);
        return () => {
          fileSavedListeners.delete(listener);
        };
      },
      reportFileChange: (change) => notify({ ...envelope, type: "file-change", payload: { dirty: change.dirty, edited: change.edited } }),
      requestFileSave,
      reportFileUnsupported: () => notify({ ...envelope, type: "file-unsupported" }),
      dispose: () => {
        for (const subscriptionId of workspaceListeners.keys()) {
          post({ ...envelope, type: "workspace-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        }
        workspaceListeners.clear();
        for (const subscriptionId of shellsListeners.keys()) {
          post({ ...envelope, type: "shells-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        }
        shellsListeners.clear();
        disposed = true;
        resolveHandler = null;
        actionHandler = null;
        fileSnapshotHandler = null;
        fileOpenListeners.clear();
        fileSavedListeners.clear();
        if (saveShortcutInstalled)
          target.removeEventListener("keydown", onSaveShortcut, true);
        target.removeEventListener("message", onMessage);
        target.removeEventListener("keydown", onPopoverEscape, true);
        target.removeEventListener("pointerover", onPopoverPointerOver);
        target.removeEventListener("pointermove", onPopoverPointerOver);
        target.removeEventListener("pointerout", onPopoverPointerOut);
        target.removeEventListener("focus", onPopoverFocus);
        target.removeEventListener("blur", onPopoverBlur);
        for (const waiter of pending.values()) {
          clearTimeout(waiter.timer);
          waiter.reject(new HostRequestError("HOST_UNAVAILABLE", "Host client was disposed."));
        }
        pending.clear();
        readyListeners.clear();
        directoryListeners.clear();
        sessionListeners.clear();
        lifecycleListeners.clear();
        connectionListeners.clear();
        settingsListeners.clear();
        itemListeners.clear();
        statusControlListeners.clear();
        popoverClosedListeners.clear();
        lateGenerateListeners.clear();
        unclaimedLateGenerate.length = 0;
      }
    };
  };
  // node_modules/@openchamber/sdk/dist/service-providers.js
  var BROWSER_CONTROL_ACTIONS = [
    "browser.open",
    "browser.snapshot",
    "browser.click",
    "browser.type",
    "browser.select",
    "browser.scroll",
    "browser.back",
    "browser.forward",
    "browser.inspect",
    "browser.capture",
    "browser.resize",
    "browser.close"
  ];
  var BROWSER_PROVIDER_IDLE_MS = 10 * 60000;
  var CONTROL_ACTIONS = new Set(BROWSER_CONTROL_ACTIONS);
  var SOURCE_CONTROL_PROVIDER_IDLE_MS = 10 * 60000;
  var NOTIFICATIONS_PROVIDER_IDLE_MS = 10 * 60000;
  var TRACKER_PROVIDER_IDLE_MS = 10 * 60000;
  // node_modules/@openchamber/sdk/dist/service-surface.js
  var SURFACE_CONTROLLERS = ["none", "agent", "user"];
  var CONTROLLERS = new Set(SURFACE_CONTROLLERS);
  // node_modules/@openchamber/sdk/dist/ui/theme.js
  var TOKEN_VARS = [
    ["--oc-bg", "background"],
    ["--oc-elevated", "elevated"],
    ["--oc-fg", "foreground"],
    ["--oc-muted", "muted"],
    ["--oc-subtle", "subtle"],
    ["--oc-border", "border"],
    ["--oc-hover", "hover"],
    ["--oc-selection", "selection"],
    ["--oc-focus", "focus"],
    ["--oc-primary", "primary"],
    ["--oc-muted-surface", "mutedSurface"],
    ["--oc-elevated-fg", "elevatedForeground"],
    ["--oc-active", "active"],
    ["--oc-selection-fg", "selectionForeground"],
    ["--oc-primary-fg", "primaryForeground"],
    ["--oc-primary-text", "primaryText"],
    ["--oc-success-text", "successText"],
    ["--oc-warning-text", "warningText"],
    ["--oc-error-text", "errorText"],
    ["--oc-info-text", "infoText"],
    ["--oc-success", "success"],
    ["--oc-warning", "warning"],
    ["--oc-error", "error"],
    ["--oc-info", "info"],
    ["--oc-font", "font"],
    ["--oc-mono", "mono"],
    ["--oc-radius", "radius"],
    ["--surface-background", "background"],
    ["--surface-elevated", "elevated"],
    ["--surface-foreground", "foreground"],
    ["--surface-muted-foreground", "muted"],
    ["--surface-subtle", "subtle"],
    ["--interactive-border", "border"],
    ["--interactive-hover", "hover"],
    ["--interactive-selection", "selection"],
    ["--interactive-focus-ring", "focus"],
    ["--primary", "primary"],
    ["--surface-muted", "mutedSurface"],
    ["--surface-elevated-foreground", "elevatedForeground"],
    ["--interactive-active", "active"],
    ["--interactive-selection-foreground", "selectionForeground"],
    ["--primary-foreground", "primaryForeground"],
    ["--primary-text", "primaryText"],
    ["--success-text", "successText"],
    ["--warning-text", "warningText"],
    ["--error-text", "errorText"],
    ["--info-text", "infoText"],
    ["--status-success", "success"],
    ["--status-warning", "warning"],
    ["--status-error", "error"],
    ["--status-info", "info"],
    ["--font-sans", "font"],
    ["--font-mono", "mono"],
    ["--radius", "radius"]
  ];
  var SYNTAX_TOKEN_VARS = [
    ["--oc-syntax-keyword", "--syntax-keyword", "syntaxKeyword"],
    ["--oc-syntax-string", "--syntax-string", "syntaxString"],
    ["--oc-syntax-number", "--syntax-number", "syntaxNumber"],
    ["--oc-syntax-function", "--syntax-function", "syntaxFunction"],
    ["--oc-syntax-type", "--syntax-type", "syntaxType"],
    ["--oc-syntax-comment", "--syntax-comment", "syntaxComment"],
    ["--oc-syntax-variable", "--syntax-variable", "syntaxVariable"],
    ["--oc-syntax-operator", "--syntax-operator", "syntaxOperator"]
  ];
  var applyHostTheme = (theme, root) => {
    root.style.colorScheme = theme.mode;
    for (const [name, key] of TOKEN_VARS) {
      root.style.setProperty(name, theme.tokens[key]);
    }
    for (const [alias, hostName, key] of SYNTAX_TOKEN_VARS) {
      const value = theme.tokens[key] ?? "";
      root.style.setProperty(alias, value);
      root.style.setProperty(hostName, value);
    }
    root.style.setProperty("font-family", theme.tokens.font);
    root.style.setProperty("font-size", "0.875rem");
    root.style.setProperty("line-height", "1.45");
    root.style.setProperty("color", theme.tokens.foreground);
  };
  var applyHostReady = (ctx, root) => {
    applyHostTheme(ctx.theme, root);
    if (root.dataset) {
      root.dataset.ocSurface = ctx.surface;
      root.dataset.ocTheme = ctx.theme.mode;
    }
  };
  // node_modules/@openchamber/sdk/dist/ui/style.js
  var OC_ALIAS = {
    "surface-background": "bg",
    "surface-elevated": "elevated",
    "surface-elevated-foreground": "elevated-fg",
    "surface-foreground": "fg",
    "surface-muted-foreground": "muted",
    "surface-muted": "muted-surface",
    "surface-subtle": "subtle",
    "interactive-border": "border",
    "interactive-hover": "hover",
    "interactive-active": "active",
    "interactive-selection": "selection",
    "interactive-selection-foreground": "selection-fg",
    "interactive-focus-ring": "focus",
    primary: "primary",
    "primary-foreground": "primary-fg",
    "primary-text": "primary-text",
    "success-text": "success-text",
    "warning-text": "warning-text",
    "error-text": "error-text",
    "info-text": "info-text",
    "status-success": "success",
    "status-warning": "warning",
    "status-error": "error",
    "status-info": "info",
    "font-sans": "font",
    "font-mono": "mono",
    radius: "radius"
  };
  var v = (name, fallback) => `var(--${name}, var(--oc-${OC_ALIAS[name]}, ${fallback}))`;
  var bg = v("surface-background", "transparent");
  var elevated = v("surface-elevated", "transparent");
  var elevatedFg = v("surface-elevated-foreground", "inherit");
  var fg = v("surface-foreground", "inherit");
  var muted = v("surface-muted-foreground", "gray");
  var secondary = v("surface-muted", "transparent");
  var border = v("interactive-border", "currentColor");
  var hover = v("interactive-hover", "transparent");
  var active = v("interactive-active", "transparent");
  var selection = v("interactive-selection", "transparent");
  var selectionFg = v("interactive-selection-foreground", "inherit");
  var primary = v("primary", "currentColor");
  var primaryText = v("primary-text", "inherit");
  var errorText = v("error-text", "inherit");
  var font = v("font-sans", "inherit");
  var mono = v("font-mono", "monospace");
  var radius = v("radius", "9px");
  var controlRadius = `calc(${radius} - 2px)`;
  var smallRadius = `calc(${radius} - 4px)`;
  var mix = (color, pct, base = "transparent") => `color-mix(in srgb, ${color} ${pct}%, ${base})`;
  var focusFill = `background-image: linear-gradient(${hover}, ${hover});`;
  var field = (edge, width = "0.5px") => `box-shadow: inset 0 0 0 ${width} ${edge}, var(--oc-sdk-field-lift);`;
  var raised = "border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);";
  var litButton = "box-shadow: var(--oc-sdk-lit);";
  var darkLift = `inset 0 0.5px 0 0 ${mix(fg, 8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`;
  var THEME_VARS = `
:root {
  --oc-sdk-edge: ${mix(fg, 16)};
  --oc-sdk-field-bg: ${elevated};
  --oc-sdk-raised-bg: ${bg};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${mix(fg, 14)};
  --oc-sdk-field-bg: ${mix(bg, 50, elevated)};
  --oc-sdk-raised-bg: ${elevated};
  --oc-sdk-field-lift: ${darkLift};
  --oc-sdk-raised-lift: ${darkLift};
  --oc-sdk-lit: ${darkLift};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`;
  var tone = (name) => {
    const color = v(`status-${name}`, "currentColor");
    return `
.oc-sdk[data-tone="${name}"], .oc-sdk [data-tone="${name}"] { --oc-sdk-tone: ${color}; --oc-sdk-tone-text: ${v(`${name}-text`, "inherit")}; }`;
  };
  var UI_SIZE_CSS = `
.oc-sdk { box-sizing: border-box; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 12px; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; }
.oc-sdk-btn[data-size="sm"] { gap: 6px; height: 28px; padding: 0 10px; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { gap: 4px; height: 24px; padding: 0 8px; font-size: 0.75rem; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: 14px; height: 14px; }

.oc-sdk-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: 32px; padding: 0 10px; border: 0; font-size: 0.875rem; line-height: 1.45; appearance: none; }
textarea.oc-sdk-input { height: auto; padding: 8px 10px; resize: vertical; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: 34px; padding-right: 34px; }
.oc-sdk-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); pointer-events: none; }
.oc-sdk-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: 24px; height: 24px; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; width: auto; max-width: 100%; min-width: 0; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; text-align: left; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: 2px; min-width: 160px; max-width: calc(100vw - 16px); max-height: min(320px, calc(100vh - 16px)); overflow: auto; padding: 4px; border: 1px solid transparent; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: 2px 2px 4px; }
.oc-sdk-popup-search .oc-sdk-input { height: 28px; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; }
.oc-sdk-option-check { flex: 0 0 auto; display: inline-flex; width: 14px; visibility: hidden; }
.oc-sdk-option[aria-selected="true"] > .oc-sdk-option-check { visibility: visible; }
.oc-sdk-popup-empty { padding: 8px; font-size: 0.8125rem; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: 8px; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-top: 3px; border: 1px solid transparent; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: 36px; height: 20px; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; }

.oc-sdk-tabs { display: inline-flex; gap: 2px; padding: 2px; max-width: 100%; overflow: auto; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: 1px 6px; font-size: 11px; font-weight: 500; line-height: 16px; white-space: nowrap; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; text-align: left; }
.oc-sdk-row-lead { flex: 0 0 auto; width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-list-empty { padding: 16px 8px; text-align: center; font-size: 0.8125rem; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 40px 16px; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; }
.oc-sdk-empty-action { margin-top: 12px; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: 8px; font-size: 0.8125rem; }
.oc-sdk-spinner-ring { width: 16px; height: 16px; border: 2px solid transparent; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: 12px; height: 12px; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: 12px; padding: 8px 12px; border: 1px solid transparent; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-banner-body { font-size: 0.8125rem; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: 8px; width: 100%; margin: 8px 0; font-size: 0.75rem; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: 4px 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: 6px; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; transform-origin: left; transition: transform 200ms ease-out; }
.oc-sdk-progress-value { display: inline-flex; align-items: center; gap: 2px; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { font-weight: 600; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text img { display: block; max-width: 100%; margin: 8px 0; }
`;
  var GUEST_UI_LOOK_CSS = `${THEME_VARS}
.oc-sdk { color: ${fg}; font-family: ${font}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${focusFill} }
.oc-sdk-mono { font-family: ${mono}; }
.oc-sdk-muted { color: ${muted}; }
${tone("success")}${tone("warning")}${tone("error")}${tone("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${primary}; --oc-sdk-tone-text: ${primaryText}; }

.oc-sdk-btn { border-radius: ${controlRadius}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${smallRadius}; }
.oc-sdk-btn[data-variant="default"] { color: ${primaryText}; background: ${mix(primary, 10, bg)}; border-color: ${mix(primary, 12)}; ${litButton} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${mix(primary, 16, bg)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${mix(primary, 22, bg)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${secondary}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${active}, ${active}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${elevatedFg}; ${raised} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${active}, ${active}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${hover}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${active}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${v("status-error", "red")}; color: ${errorText}; background: ${mix("var(--oc-sdk-tone)", 7, bg)}; border-color: ${mix("var(--oc-sdk-tone)", 12)}; ${litButton} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${mix("var(--oc-sdk-tone)", 9, bg)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${mix("var(--oc-sdk-tone)", 11, bg)}; box-shadow: none; }

.oc-sdk-field-note { color: ${muted}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${errorText}; }
.oc-sdk-input { border-radius: ${controlRadius}; background: var(--oc-sdk-field-bg); color: ${elevatedFg}; ${field("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${muted}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${field(mix(fg, 26), "1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${field(v("status-error", "red"), "1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${mono}; }

.oc-sdk-search-icon { color: ${muted}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${primary}; }
.oc-sdk-search-clear { border-radius: ${smallRadius}; color: ${muted}; }
.oc-sdk-search-clear:hover { background: ${hover}; color: ${fg}; }

.oc-sdk-trigger { border-radius: ${controlRadius}; background: var(--oc-sdk-raised-bg); color: ${elevatedFg}; ${raised} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${active}, ${active}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${muted}; }
.oc-sdk-trigger-chevron { color: ${muted}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${elevatedFg}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${elevated}; background-clip: padding-box; color: ${elevatedFg}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${hover}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${selection}; color: ${selectionFg}; }
.oc-sdk-option-check { color: ${fg}; }
.oc-sdk-option[data-destructive="true"] { color: ${errorText}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${mix(v("status-error", "red"), 10)}; }
.oc-sdk-option-hint { color: ${muted}; }
.oc-sdk-popup-empty { color: ${muted}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${border}; border-radius: 4px; color: ${fg}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${mix(fg, 60, border)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${border}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${bg}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${primary}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${focusFill} }
.oc-sdk-check-desc { color: ${muted}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${mix(fg, 4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${muted}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${fg}; }
.oc-sdk-tab[aria-selected="true"] { color: ${selectionFg}; background: ${selection}; border-color: ${border}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${elevatedFg}; background: var(--oc-sdk-raised-bg); ${raised} }
.oc-sdk-tab-count { color: ${muted}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${mix(fg, 6)}; color: ${muted}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${mix("var(--oc-sdk-tone)", 15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${hover}; }
.oc-sdk-row[aria-selected="true"] { background: ${selection}; color: ${selectionFg}; }
.oc-sdk-row-lead { font-family: ${mono}; color: ${muted}; }
.oc-sdk-row-sub { color: ${muted}; }
.oc-sdk-row-meta { color: ${muted}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${muted}; }

.oc-sdk-empty-body { color: ${muted}; }

.oc-sdk-spinner { color: ${muted}; }
.oc-sdk-spinner-ring { border-color: ${border}; border-top-color: ${primary}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${mix("var(--oc-sdk-tone)", 10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${muted}; }

.oc-sdk-separator { color: ${muted}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${mix(border, 40)}; }

.oc-sdk-progress-label { color: ${muted}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${mix(fg, 6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${primary}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${v("status-success", "currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${v("success-text", "inherit")}; }

.oc-sdk-text a { color: ${primaryText}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${mix(border, 60)}; }
`;
  var UI_CSS = `
${GUEST_SCROLLBAR_CSS}
${UI_SIZE_CSS}
${GUEST_UI_LOOK_CSS}`;
  // src/panel/redis-editor.js
  var REDIS_EDITOR_CSS = `
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
  var el2 = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls)
      node.className = cls;
    if (text !== undefined)
      node.textContent = text;
    return node;
  };
  var MAX_TTL = 2147483647;
  function readPositiveInteger(text, label, max = Number.MAX_SAFE_INTEGER) {
    if (!/^\d+$/.test(String(text).trim()))
      throw new Error(`${label} must be a non-negative integer.`);
    const value = Number(String(text).trim());
    if (!Number.isSafeInteger(value) || value > max)
      throw new Error(`${label} must be between 0 and ${max}.`);
    return value;
  }
  function readTtl(text) {
    if (!String(text).trim())
      return null;
    const value = readPositiveInteger(text, "TTL", MAX_TTL);
    if (value < 1)
      throw new Error(`TTL must be empty or an integer from 1 to ${MAX_TTL} seconds.`);
    return value;
  }
  function textInput(value = "", placeholder = "") {
    const input = el2("input");
    input.type = "text";
    input.value = value ?? "";
    input.placeholder = placeholder;
    input.spellcheck = false;
    return input;
  }
  function textArea(value = "", placeholder = "") {
    const input = el2("textarea");
    input.value = value ?? "";
    input.placeholder = placeholder;
    input.spellcheck = false;
    return input;
  }
  function field2(label, input, wide = false) {
    const wrapper = el2("label", `fld${wide ? " wide" : ""}`, label);
    wrapper.appendChild(input);
    return wrapper;
  }
  function action(label, onClick, { kind = "", enabled = true, title = "" } = {}) {
    const button2 = el2("button", `btn ${kind}`, label);
    button2.disabled = !enabled;
    if (title)
      button2.title = title;
    if (enabled)
      button2.addEventListener("click", onClick);
    return button2;
  }
  function createRedisPanel({ svc, dialog, confirmDialog, toast }) {
    function operationDialog({ connection, title, primary: primary2 = "Apply", success = "Redis operation applied.", build, onSuccess }) {
      let busy = false;
      let bodyRef = null;
      let errorRef = null;
      return dialog({
        title,
        className: "typed-dialog",
        isBusy: () => busy,
        build: (body) => {
          bodyRef = body;
          const form = el2("div", "redis-operation-form");
          body.appendChild(form);
          body._readOperation = build(form);
          errorRef = el2("div", "typed-error");
          errorRef.setAttribute("role", "alert");
          body.appendChild(errorRef);
          body.appendChild(el2("div", "typed-note", "Value edits use optimistic snapshot checks. Additions, TTL changes, key deletion, and stream operations act on current key state. ⌘/Ctrl+Enter applies."));
        },
        actions: [
          { label: "Cancel", value: null },
          {
            label: primary2,
            kind: "primary",
            shortcut: true,
            onClick: async (done) => {
              if (busy)
                return false;
              let operation;
              try {
                operation = bodyRef._readOperation();
                if (!operation || typeof operation !== "object")
                  throw new Error("The Redis operation is incomplete.");
              } catch (error) {
                errorRef.textContent = error.message;
                return false;
              }
              busy = true;
              errorRef.textContent = "";
              const controls = [...bodyRef.parentElement.querySelectorAll("button, input, textarea, select")];
              const disabled = controls.map((control) => control.disabled);
              controls.forEach((control) => {
                control.disabled = true;
              });
              try {
                await svc("POST", "/redis/operation", { body: { connection, operation } });
                done(true);
                toast("success", success);
                await onSuccess?.();
              } catch (error) {
                busy = false;
                controls.forEach((control, index) => {
                  control.disabled = disabled[index];
                });
                errorRef.textContent = error.message;
                toast("error", error.message);
                return false;
              }
            }
          }
        ]
      });
    }
    function streamFieldsEditor(container, initial = [{ field: "", value: "" }]) {
      const rows = el2("div", "redis-stream-fields");
      const addRow = (entry = { field: "", value: "" }) => {
        const row = el2("div", "redis-stream-field");
        const head = el2("div", "redis-entry-head");
        head.appendChild(el2("span", "redis-entry-title", "Field / value"));
        const remove = el2("button", "iconbtn danger", "Remove");
        remove.type = "button";
        remove.disabled = rows.childElementCount === 0;
        remove.addEventListener("click", () => {
          if (rows.childElementCount <= 1)
            return;
          row.remove();
          for (const item of rows.children) {
            const button2 = item.querySelector(".iconbtn");
            if (button2)
              button2.disabled = rows.childElementCount <= 1;
          }
        });
        head.appendChild(remove);
        const name = textInput(entry.field, "field");
        name.dataset.role = "field";
        const value = textArea(entry.value, "value");
        value.dataset.role = "value";
        row.append(head, field2("Field", name), field2("Value", value));
        rows.appendChild(row);
        for (const item of rows.children) {
          const button2 = item.querySelector(".iconbtn");
          if (button2)
            button2.disabled = rows.childElementCount <= 1;
        }
      };
      initial.forEach(addRow);
      const add = el2("button", "iconbtn", "+ Add field");
      add.type = "button";
      add.addEventListener("click", () => addRow());
      container.append(rows, add);
      return () => [...rows.children].map((row) => ({
        field: row.querySelector("[data-role=field]").value,
        value: row.querySelector("[data-role=value]").value
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
          const typeInput = el2("select");
          for (const value of ["string", "hash", "list", "set", "zset", "stream"]) {
            const option = el2("option", null, value);
            option.value = value;
            typeInput.appendChild(option);
          }
          const ttl = textInput("", "No expiry");
          const common = el2("div", "redis-form-grid");
          common.append(field2("Key", key, true), field2("Type", typeInput), field2("TTL seconds (optional)", ttl));
          body.appendChild(common);
          const stringValue = textArea("", "Value");
          const hashField = textInput("", "field");
          const hashValue = textArea("", "value");
          const listValue = textArea("", "value");
          const setMember = textInput("", "member");
          const zsetMember = textInput("", "member");
          const zsetScore = textInput("0", "0, 1.5, +inf, -inf");
          const streamId = textInput("*", "* or 1710000000000-0");
          const streamFields = el2("div");
          const readStreamFields = streamFieldsEditor(streamFields);
          const sections = new Map;
          const addSection = (kind, nodes) => {
            const section = el2("div", "redis-operation-form");
            section.append(...nodes);
            sections.set(kind, section);
            body.appendChild(section);
          };
          addSection("string", [field2("String value", stringValue)]);
          addSection("hash", [field2("Field", hashField), field2("Value", hashValue)]);
          addSection("list", [field2("First list value", listValue)]);
          addSection("set", [field2("Member", setMember)]);
          addSection("zset", [field2("Member", zsetMember), field2("Score", zsetScore)]);
          addSection("stream", [field2("Entry ID", streamId), field2("Fields", streamFields)]);
          const paint = () => {
            for (const [kind, section] of sections)
              section.style.display = kind === type ? "" : "none";
          };
          typeInput.addEventListener("change", () => {
            type = typeInput.value;
            paint();
          });
          paint();
          setTimeout(() => key.focus(), 30);
          return () => {
            if (!key.value.length)
              throw new Error("Redis key is required.");
            const operation = { op: "create", key: key.value, type, ttl: readTtl(ttl.value) };
            if (type === "string")
              operation.value = stringValue.value;
            else if (type === "hash")
              operation.entries = [{ field: hashField.value, value: hashValue.value }];
            else if (type === "list")
              operation.entries = [{ value: listValue.value }];
            else if (type === "set")
              operation.entries = [{ member: setMember.value }];
            else if (type === "zset") {
              if (!zsetScore.value.trim())
                throw new Error("Sorted-set score is required.");
              operation.entries = [{ member: zsetMember.value, score: zsetScore.value.trim() }];
            } else {
              operation.entries = [{ id: streamId.value.trim() || "*", fields: readStreamFields() }];
            }
            return operation;
          };
        }
      });
    }
    function openKey({ connection, key, type, onListRefresh }) {
      const wrap = el2("div", "sheetwrap");
      const sheet = el2("div", "sheet redis-key-editor");
      const header = el2("header");
      const title = el2("h3", null, `Redis ${type} key`);
      const closeButton = el2("button", "iconbtn", "✕");
      closeButton.title = "Close Key Editor";
      header.append(title, closeButton);
      const body = el2("div", "sbody");
      const footer = el2("footer");
      sheet.append(header, body, footer);
      wrap.appendChild(sheet);
      let snapshot = null;
      let loading = false;
      let busy = false;
      let closed = false;
      let errorText2 = "";
      let limit = 500;
      let valueLimit = 262144;
      let limitDraft = String(limit);
      let valueLimitDraft = String(valueLimit);
      let ttlDraft = "";
      const locked = () => busy || loading;
      function close() {
        if (busy || closed)
          return;
        closed = true;
        wrap.remove();
        document.removeEventListener("keydown", onKey, true);
      }
      closeButton.addEventListener("click", close);
      wrap.addEventListener("mousedown", (event) => {
        if (event.target === wrap)
          close();
      });
      const onKey = (event) => {
        if (document.querySelector(".overlay"))
          return;
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      };
      document.addEventListener("keydown", onKey, true);
      async function load() {
        if (closed)
          return;
        loading = true;
        errorText2 = "";
        render();
        try {
          const next = await svc("GET", "/redis/key", {
            query: { connection, key, type, limit: String(limit), valueLimit: String(valueLimit) }
          });
          if (closed)
            return;
          snapshot = next;
          ttlDraft = next.ttl > 0 ? String(next.ttl) : "";
        } catch (error) {
          if (!closed) {
            snapshot = null;
            errorText2 = error.message;
          }
        } finally {
          if (!closed) {
            loading = false;
            render();
          }
        }
      }
      async function runDirect(operation, { success = "Redis operation applied.", removeKey = false, refreshList = false } = {}) {
        if (locked() || closed)
          return;
        busy = true;
        errorText2 = "";
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
          if (refreshList)
            await onListRefresh?.();
        } catch (error) {
          if (!closed) {
            errorText2 = error.message;
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
        if (locked() || !snapshot)
          return;
        return operationDialog({
          connection,
          ...options,
          onSuccess: async () => {
            await load();
          }
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
            form.appendChild(field2("Full string value", value));
            setTimeout(() => value.focus(), 30);
            return () => ({ op: "string.set", key, expectedValue: original.value, value: value.value });
          }
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
            if (entry)
              name.disabled = true;
            const value = textArea(entry?.value ?? "", "value");
            form.append(field2("Field", name), field2("Value", value));
            setTimeout(() => (entry ? value : name).focus(), 30);
            return () => entry ? { op: "hash.update", key, field: entry.field, expectedValue: entry.value, value: value.value } : { op: "hash.add", key, field: name.value, value: value.value };
          }
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
            const index = textInput(String(isInsert ? entry?.index ?? original.total : entry.index), "0");
            if (!isInsert)
              index.disabled = true;
            const value = textArea(isInsert ? "" : entry.value, "value");
            form.append(field2("Zero-based index", index), field2("Value", value));
            form.appendChild(el2("div", "typed-note", isInsert ? `Expected list length: ${original.total}. Inserting before an existing item also checks its exact current value.` : "The exact value at this index is checked before updating."));
            setTimeout(() => value.focus(), 30);
            return () => {
              if (isInsert) {
                const at = readPositiveInteger(index.value, "List index", original.total);
                const operation = { op: "list.insert", key, index: at, value: value.value, expectedLength: original.total };
                if (at < original.total) {
                  const pivot = original.entries[at];
                  if (!pivot || pivot.truncated)
                    throw new Error("The insertion pivot is unavailable or truncated. Reload a complete snapshot first.");
                  operation.expectedValue = pivot.value;
                }
                return operation;
              }
              return { op: "list.update", key, index: entry.index, expectedValue: entry.value, value: value.value };
            };
          }
        });
      }
      function setForm(entry = null) {
        mutation({
          title: entry ? `Replace set member — ${key}` : `Add set member — ${key}`,
          primary: entry ? "Replace member" : "Add member",
          success: entry ? "Set member replaced." : "Set member added.",
          build: (form) => {
            const member = textInput(entry?.member ?? "", "member");
            form.appendChild(field2(entry ? "New member" : "Member", member));
            setTimeout(() => member.focus(), 30);
            return () => entry ? { op: "set.replace", key, member: entry.member, newMember: member.value } : { op: "set.add", key, member: member.value };
          }
        });
      }
      function zsetForm(entry = null, rename = false) {
        mutation({
          title: entry ? `${rename ? "Rename" : "Edit score"} — ${entry.member}` : `Add sorted-set member — ${key}`,
          primary: entry ? "Save member" : "Add member",
          success: entry ? "Sorted-set member updated." : "Sorted-set member added.",
          build: (form) => {
            const member = textInput(rename || !entry ? entry?.member ?? "" : entry.member, "member");
            if (entry && !rename)
              member.disabled = true;
            const score = textInput(entry?.score ?? "0", "0, 1.5, +inf, -inf");
            if (entry && rename) {
              form.append(field2("New member", member), field2("Score", score));
            } else {
              form.append(field2("Member", member), field2("Score", score));
            }
            setTimeout(() => (rename || !entry ? member : score).focus(), 30);
            return () => {
              if (!score.value.trim())
                throw new Error("Sorted-set score is required.");
              if (!entry)
                return { op: "zset.add", key, member: member.value, score: score.value.trim() };
              if (rename)
                return {
                  op: "zset.replace",
                  key,
                  member: entry.member,
                  newMember: member.value,
                  expectedScore: String(entry.score),
                  score: score.value.trim()
                };
              return { op: "zset.score", key, member: entry.member, expectedScore: String(entry.score), score: score.value.trim() };
            };
          }
        });
      }
      function streamAppend() {
        mutation({
          title: `Append stream entry — ${key}`,
          primary: "Append entry",
          success: "Stream entry appended.",
          build: (form) => {
            const id = textInput("*", "* or 1710000000000-0");
            const fields = el2("div");
            const readFields = streamFieldsEditor(fields);
            form.append(field2("Entry ID", id), field2("Fields", fields));
            form.appendChild(el2("div", "typed-note", "Stream entries are append-only in this editor. Existing entries can be deleted but never modified in place."));
            setTimeout(() => id.focus(), 30);
            return () => ({ op: "stream.add", key, id: id.value.trim() || "*", fields: readFields() });
          }
        });
      }
      async function deleteEntry(entry) {
        if (locked() || !snapshot)
          return;
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
        if (!await confirmDialog(`Delete ${subject} from Redis key “${key}”?`, { yes: "Delete" }))
          return;
        const removesEmptyKey = current.total === 1 && ["hash", "list", "set", "zset"].includes(current.type);
        await runDirect(operation, {
          success: removesEmptyKey ? "Redis entry deleted; refreshing the key list." : "Redis entry deleted.",
          removeKey: removesEmptyKey
        });
      }
      function renderEntry(entry) {
        const box = el2("div", "redis-entry");
        const head = el2("div", "redis-entry-head");
        let label;
        let value;
        if (snapshot.type === "hash") {
          label = entry.field;
          value = entry.value;
        } else if (snapshot.type === "list") {
          label = `index ${entry.index}`;
          value = entry.value;
        } else if (snapshot.type === "set") {
          label = "member";
          value = entry.member;
        } else if (snapshot.type === "zset") {
          label = `score ${entry.score}`;
          value = entry.member;
        } else {
          label = entry.id;
          value = entry.fields.map((item) => `${item.field} = ${item.value}`).join(`
`);
        }
        head.appendChild(el2("span", "redis-entry-title", label));
        const actions = el2("div", "redis-entry-actions");
        const stream = snapshot.type === "stream";
        const editable = !stream && snapshot.writable && !entry.truncated && !locked();
        const reason = snapshot.truncated && !stream ? "Reload a complete, untruncated snapshot before editing." : entry.truncated && !stream ? "This entry is truncated and cannot be edited safely." : "";
        if (!stream) {
          const editLabel = snapshot.type === "set" ? "Replace" : snapshot.type === "zset" ? "Score" : "Edit";
          const editHandler = snapshot.type === "hash" ? () => hashForm(entry) : snapshot.type === "list" ? () => listForm(entry) : snapshot.type === "set" ? () => setForm(entry) : () => zsetForm(entry);
          actions.appendChild(action(editLabel, editHandler, { enabled: editable, title: reason }));
          if (snapshot.type === "list")
            actions.appendChild(action("Insert before", () => listForm(entry, true), { enabled: editable, title: reason }));
          if (snapshot.type === "zset")
            actions.appendChild(action("Rename", () => zsetForm(entry, true), { enabled: editable, title: reason }));
        }
        const removable = stream ? !locked() : editable;
        actions.appendChild(action("Delete", () => deleteEntry(entry), { kind: "danger", enabled: removable, title: reason }));
        head.appendChild(actions);
        box.appendChild(head);
        const pre = el2("pre", `redis-entry-value${value === "" ? " empty" : ""}`, value === "" ? "(empty string)" : value);
        box.appendChild(pre);
        if (entry.truncated)
          box.appendChild(el2("div", "redis-warning", stream ? "Some field values are truncated. Append and delete by entry ID remain available; field content is read-only." : "This value is truncated. Its edit and delete actions are disabled to prevent data loss."));
        return box;
      }
      function renderSnapshot() {
        const meta = el2("dl", "redis-key-meta");
        meta.append(el2("dt", null, "Key"), el2("dd", null, snapshot.key));
        meta.append(el2("dt", null, "Type"), el2("dd", null, snapshot.type));
        meta.append(el2("dt", null, "TTL"), el2("dd", null, snapshot.ttl === -1 ? "No expiry (-1)" : `${snapshot.ttl} seconds`));
        body.appendChild(meta);
        const limits = el2("div", "redis-section");
        const limitHead = el2("div", "redis-section-head");
        limitHead.appendChild(el2("h4", null, "Snapshot read limits"));
        limits.appendChild(limitHead);
        const readLimits = el2("div", "redis-read-limits");
        const limitInput = textInput(limitDraft, "1–500");
        const valueInput = textInput(valueLimitDraft, "1–1000000");
        limitInput.addEventListener("input", () => {
          limitDraft = limitInput.value;
        });
        valueInput.addEventListener("input", () => {
          valueLimitDraft = valueInput.value;
        });
        const reload = action("Reload", async () => {
          if (locked())
            return;
          try {
            const nextLimit = readPositiveInteger(limitDraft, "Entry limit", 500);
            const nextValueLimit = readPositiveInteger(valueLimitDraft, "Value byte limit", 1e6);
            if (nextLimit < 1 || nextValueLimit < 1)
              throw new Error("Read limits must be positive.");
            limit = nextLimit;
            valueLimit = nextValueLimit;
            await load();
          } catch (error) {
            errorText2 = error.message;
            render();
          }
        }, { enabled: !locked() });
        readLimits.append(field2("Entries (max 500)", limitInput), field2("Value bytes (max 1,000,000)", valueInput), reload);
        limits.appendChild(readLimits);
        body.appendChild(limits);
        const ttlSection = el2("div", "redis-section");
        const ttlHead = el2("div", "redis-section-head");
        ttlHead.appendChild(el2("h4", null, "Expiration"));
        ttlSection.appendChild(ttlHead);
        const ttlRow = el2("div", "redis-ttl-row");
        const ttlInput = textInput(ttlDraft, "No expiry");
        ttlInput.disabled = locked();
        ttlInput.addEventListener("input", () => {
          ttlDraft = ttlInput.value;
        });
        const setTtl = action("Set expiry", () => {
          try {
            const ttl = readTtl(ttlInput.value);
            if (ttl === null)
              throw new Error("Enter a positive TTL, or use Remove expiry.");
            runDirect({ op: "ttl", key, ttl }, { success: "Redis TTL updated.", refreshList: true });
          } catch (error) {
            errorText2 = error.message;
            render();
          }
        }, { enabled: !locked() });
        const persist = action("Remove expiry", () => runDirect({ op: "ttl", key, ttl: null }, { success: "Redis expiry removed.", refreshList: true }), {
          enabled: !locked() && snapshot.ttl !== -1,
          title: snapshot.ttl === -1 ? "This key already has no expiry." : "Keep the key until it is deleted."
        });
        persist.classList.add("persist");
        ttlRow.append(field2("TTL seconds", ttlInput), setTtl, persist);
        ttlSection.appendChild(ttlRow);
        ttlSection.appendChild(el2("div", "redis-section-note", "TTL changes apply to the key's current state, not only the loaded snapshot."));
        body.appendChild(ttlSection);
        if (snapshot.truncated) {
          const detail = snapshot.entriesTruncated ? `Showing ${snapshot.returned} of ${snapshot.total} entries. Increase the entry limit and reload.` : "One or more values are truncated. Increase the value byte limit and reload.";
          body.appendChild(el2("div", "redis-warning", `${detail} ${snapshot.type === "stream" ? "Stream append/delete remain available." : "All value mutations are disabled until the snapshot is complete."} The service caps reads at 500 entries and 1,000,000 bytes per value.`));
        }
        if (snapshot.type === "string") {
          const section2 = el2("div", "redis-section");
          const head2 = el2("div", "redis-section-head");
          head2.appendChild(el2("h4", null, "String value"));
          head2.appendChild(action("Edit string", editString, {
            kind: "primary",
            enabled: snapshot.writable && !snapshot.truncated && !locked(),
            title: snapshot.truncated ? "A truncated string cannot be overwritten. Increase the byte limit first." : ""
          }));
          section2.appendChild(head2);
          section2.appendChild(el2("pre", `redis-entry-value${snapshot.value === "" ? " empty" : ""}`, snapshot.value === "" ? "(empty string)" : snapshot.value));
          body.appendChild(section2);
          return;
        }
        const section = el2("div", "redis-section");
        const head = el2("div", "redis-section-head");
        const titles = { hash: "Hash fields", list: "List values", set: "Set members", zset: "Sorted-set members", stream: "Stream entries" };
        head.appendChild(el2("h4", null, `${titles[snapshot.type]} · ${snapshot.returned}/${snapshot.total}`));
        const addLabels = { hash: "Add field", list: "Append / insert", set: "Add member", zset: "Add member", stream: "Append entry" };
        const addHandlers = { hash: () => hashForm(), list: () => listForm(), set: () => setForm(), zset: () => zsetForm(), stream: streamAppend };
        const canAdd = snapshot.type === "stream" ? !locked() : snapshot.writable && !locked();
        head.appendChild(action(addLabels[snapshot.type], addHandlers[snapshot.type], {
          kind: "primary",
          enabled: canAdd,
          title: !canAdd && snapshot.type !== "stream" ? "Reload a complete, untruncated snapshot before structural edits." : ""
        }));
        section.appendChild(head);
        if (snapshot.type === "stream")
          section.appendChild(el2("div", "redis-section-note", "Append and delete only. In-place stream edits and delete/recreate shortcuts are intentionally unavailable."));
        if (!snapshot.entries.length)
          section.appendChild(el2("div", "empty", "This key has no entries."));
        else
          snapshot.entries.forEach((entry) => section.appendChild(renderEntry(entry)));
        body.appendChild(section);
      }
      function render() {
        if (closed)
          return;
        title.textContent = `Redis ${snapshot?.type ?? type} key`;
        closeButton.disabled = busy;
        body.innerHTML = "";
        footer.innerHTML = "";
        if (loading)
          body.appendChild(el2("div", "busy", "Loading an editor-safe Redis snapshot…"));
        else if (!snapshot)
          body.appendChild(el2("div", "empty", "The key snapshot is not available."));
        else
          renderSnapshot();
        if (errorText2) {
          const error = el2("div", "redis-error", errorText2);
          error.setAttribute("role", "alert");
          body.appendChild(error);
          if (!snapshot && !loading)
            body.appendChild(action("Retry", load, { kind: "primary" }));
        }
        const del = action("Delete key", async () => {
          if (locked() || !snapshot)
            return;
          if (!await confirmDialog(`Delete Redis ${snapshot.type} key “${key}” and all of its current values? This operation is not limited to the loaded snapshot.`, { yes: "Delete key" }))
            return;
          await runDirect({ op: "delete", key }, { success: "Redis key deleted.", removeKey: true });
        }, { kind: "danger", enabled: !!snapshot && !locked() });
        const spacer = el2("span", "spacer");
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

  // src/panel/main.js
  var host = connectHost();

  class ServiceError extends Error {
  }
  var FAILURE_TEXT = {
    needsApproval: "Allow the DB Connect service in Settings → Extensions.",
    paused: "The DB Connect extension is disabled in Settings.",
    failed: "The DB Connect service crashed. It will restart on the next refresh.",
    unreachable: "Could not reach the DB Connect service."
  };
  var failureKey = (error) => {
    if (!(error instanceof HostRequestError))
      return null;
    if (error.code === "NO_SERVICE" || error.code === "NOT_GRANTED")
      return "needsApproval";
    if (error.code === "DISABLED")
      return "paused";
    if (error.code === "SERVICE_FAILED")
      return "failed";
    return "unreachable";
  };
  async function svc(method, path, { query, body } = {}) {
    let result;
    try {
      result = await host.serviceRequest({
        method,
        path,
        query,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (error) {
      const key = failureKey(error);
      throw key ? new ServiceError(FAILURE_TEXT[key]) : error;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(result.body);
    } catch {}
    if (result.status !== 200) {
      const message = parsed && typeof parsed.error === "string" ? parsed.error : `The service returned status ${result.status}.`;
      throw new ServiceError(message);
    }
    if (parsed === null)
      throw new ServiceError("The service returned an unexpected response.");
    return parsed;
  }
  var state = {
    conns: [],
    connId: null,
    tab: "tree",
    mode: "tree",
    tableView: "data",
    openTables: [],
    sqlOpen: false,
    explorerVisible: true,
    schemas: [],
    treeReady: false,
    filter: "",
    expanded: new Set,
    table: null,
    sql: "",
    sqlResult: null,
    sqlBusy: false,
    sqlRunId: 0,
    batchBusy: false,
    history: [],
    pgVersion: null,
    viewMode: "table",
    sqlViewMode: "table",
    colsPrefs: {},
    pending: new Map,
    pendingFor: null
  };
  var DB_TYPES = {
    postgres: { label: "PostgreSQL", short: "PG", placeholder: "postgres://user:pass@127.0.0.1:5432/db" },
    mongodb: { label: "MongoDB", short: "MG", placeholder: "mongodb://user:pass@127.0.0.1:27017/db" },
    redis: { label: "Redis", short: "RD", placeholder: "redis://:password@127.0.0.1:6379/0" }
  };
  var currentConnection = () => state.conns.find((c) => c.id === state.connId) ?? null;
  var currentKind = () => currentConnection()?.kind ?? "postgres";
  var isPostgres = () => currentKind() === "postgres";
  var objectKindLabel = (kind) => ({ view: "VIEW", matview: "MV", collection: "COLL", keys: "KEYS", partitioned: "PART" })[kind];
  var el3 = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls)
      node.className = cls;
    if (text !== undefined)
      node.textContent = text;
    return node;
  };
  var esc = (v2) => v2 === null || v2 === undefined ? "" : String(v2);
  var NULL_TEXT = "∅";
  var SEP = "␟";
  var prettyValue = (raw) => {
    if (raw === null || raw === undefined)
      return null;
    const s = String(raw);
    if (/^\s*[[{]/.test(s)) {
      try {
        return { text: JSON.stringify(JSON.parse(s), null, 2), isJson: true };
      } catch {}
    }
    if (s.length > 60 || s.includes(`
`))
      return { text: s, isJson: false };
    return null;
  };
  var toast = (kind, message) => host.toast({ kind, message }).catch(() => {});
  var dialogBodyRef = null;
  var TYPE_BADGE = [
    [/^(boolean|bool)/, "✓", "--oc-info"],
    [/^uuid/, "#", "--oc-warning"],
    [/json/, "{}", "--oc-success"],
    [/(date|time)\b|timestamp/, "◷", "--oc-warning"],
    [/(bigint|smallint|integer|int|serial|oid)/, "12", "--oc-primary-text"],
    [/(numeric|decimal|real|double|float|money)/, "π", "--oc-primary-text"],
    [/(text|char|varchar|name)/, "Aa", "--oc-muted"]
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
  var typeClass = (type) => {
    const t = String(type ?? "").toLowerCase();
    if (/^(boolean|bool)/.test(t))
      return "bool";
    if (/^(int|bigint|smallint|numeric|decimal|real|double|float|serial|money|oid)/.test(t))
      return "num";
    if (/^uuid/.test(t))
      return "uuid";
    return "";
  };
  var uuidShort = (s) => s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
  var CSS2 = `
${GUEST_UI_LOOK_CSS}
${REDIS_EDITOR_CSS}
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
.dialog-body { display: contents; }
.dialog.typed-dialog { max-width: 560px; padding: 0; gap: 0; overflow: hidden; }
.typed-dialog > h3 { padding: 14px 16px 11px; border-bottom: 1px solid var(--oc-border, #333); }
.typed-dialog .dialog-body { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: auto; padding: 14px 16px; }
.typed-dialog .acts { flex: none; padding: 10px 16px; border-top: 1px solid var(--oc-border, #333); background: var(--oc-elevated, #262626); }
.typed-field { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.typed-field-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.typed-field-name { color: var(--oc-fg, #eee); font: 600 12px var(--oc-mono, ui-monospace, monospace); overflow: hidden; text-overflow: ellipsis; }
.typed-field-type, .typed-constraint { flex: none; color: var(--oc-muted, #999); font: 9.5px var(--oc-mono, ui-monospace, monospace); padding: 1px 5px; border: 1px solid var(--oc-border, #3a3a3a); border-radius: 4px; }
.typed-constraint { color: var(--oc-warning, #d29922); }
.typed-modes { display: flex; gap: 2px; align-self: flex-start; padding: 2px; background: var(--oc-bg, #1e1e1e); border: 1px solid var(--oc-border, #333); border-radius: 6px; }
.typed-modes button { border: 0; border-radius: 4px; padding: 3px 9px; background: transparent; color: var(--oc-muted, #999); cursor: pointer; font: inherit; font-size: 10px; }
.typed-modes button.on { color: var(--oc-fg, #eee); background: var(--oc-hover, #363636); box-shadow: 0 1px 2px rgb(0 0 0 / .25); }
.typed-input-row { display: flex; gap: 6px; align-items: center; min-width: 0; }
.typed-input-row > input, .typed-input-row > textarea { flex: 1; min-width: 0; }
.dialog .typed-input-row input[type=date], .dialog .typed-input-row input[type=time], .dialog .typed-input-row input[type=datetime-local], .dialog .typed-input-row select {
  padding: 5px 8px; border-radius: var(--oc-radius, 8px); border: 1px solid var(--oc-border, #333);
  background: var(--oc-bg, #1e1e1e); color: var(--oc-fg, #eee); font: 12px/1.4 var(--oc-mono, ui-monospace, monospace); color-scheme: dark;
}
.typed-input-row input:disabled, .typed-input-row textarea:disabled, .typed-input-row select:disabled { opacity: .48; cursor: not-allowed; }
.typed-tools { display: flex; gap: 5px; flex-wrap: wrap; }
.typed-tools .iconbtn { flex: none; }
.typed-preview { color: var(--oc-muted, #999); font: 10px/1.45 var(--oc-mono, ui-monospace, monospace); word-break: break-all; }
.typed-preview strong { color: var(--oc-primary-text, #9dc1ff); font-weight: 500; }
.typed-error { color: var(--oc-error-text, #f88); font-size: 11px; min-height: 0; }
.typed-note { color: var(--oc-muted, #999); font-size: 10.5px; line-height: 1.5; }
.typed-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.typed-form-grid .typed-field.wide { grid-column: 1 / -1; }
@media (max-width: 560px) { .typed-form-grid { grid-template-columns: minmax(0, 1fr); } }

/* MongoDB canonical document editing */
.dialog.document-dialog { max-width: 680px; }
.document-tabs { display: flex; gap: 3px; align-self: flex-start; padding: 2px; border: 1px solid var(--oc-border, #333); border-radius: 6px; background: var(--oc-bg, #1e1e1e); }
.document-tabs button { border: 0; border-radius: 4px; padding: 4px 12px; background: transparent; color: var(--oc-muted, #999); cursor: pointer; font: inherit; font-size: 10.5px; }
.document-tabs button.on { color: var(--oc-fg, #eee); background: var(--oc-hover, #363636); }
.document-json { min-height: 300px; max-height: 50vh; width: 100%; }
.document-fields { display: flex; flex-direction: column; gap: 11px; }
.document-fields .typed-field { padding-bottom: 10px; border-bottom: 1px solid color-mix(in srgb, var(--oc-border, #333) 60%, transparent); }
.document-fields .typed-field:last-child { border-bottom: 0; }
.document-new-field { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; align-items: end; padding-top: 4px; }
.document-new-field label { min-width: 0; }
.document-review { max-height: 50vh; overflow: auto; }
.document-review pre { margin: 4px 0 0; max-height: 180px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 10px/1.45 var(--oc-mono, ui-monospace, monospace); }
.grid td.missing { color: var(--oc-subtle, #666); font-style: italic; }
.grid tr.openable { cursor: pointer; }
@media (max-width: 560px) { .document-json { min-height: 240px; } }

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
.sheet footer { display: flex; gap: 8px; flex-wrap: wrap; padding: 10px 12px; border-top: 1px solid var(--oc-border, #2a2a2a); }

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
  function dialog({ title, build, actions, className = "", isBusy = () => false }) {
    return new Promise((resolve) => {
      const overlay = el3("div", "overlay");
      const box = el3("div", `dialog${className ? ` ${className}` : ""}`);
      box.appendChild(el3("h3", null, title));
      const done = (value) => {
        overlay.remove();
        document.removeEventListener("keydown", onKey, true);
        resolve(value);
      };
      const body = el3("div", "dialog-body");
      if (build)
        build(body, done);
      box.appendChild(body);
      const acts = el3("div", "acts");
      const actionButtons = [];
      for (const action2 of actions) {
        const btn = el3("button", `btn ${action2.kind ?? ""}`, action2.label);
        btn.addEventListener("click", async () => {
          if (action2.onClick) {
            const result = await action2.onClick(done);
            if (result === false)
              return;
          } else {
            done(action2.value);
          }
        });
        actionButtons.push({ action: action2, btn });
        acts.appendChild(btn);
      }
      box.appendChild(acts);
      const onKey = (event) => {
        const overlays = document.querySelectorAll(".overlay");
        if (overlays.length && overlays[overlays.length - 1] !== overlay)
          return;
        if (event.key === "Escape") {
          event.stopPropagation();
          if (!isBusy())
            done(null);
        } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          const submit = actionButtons.find(({ action: action2, btn }) => action2.shortcut && !btn.disabled);
          if (submit && !isBusy()) {
            event.preventDefault();
            event.stopPropagation();
            submit.btn.click();
          }
        }
      };
      document.addEventListener("keydown", onKey, true);
      overlay.appendChild(box);
      overlay.addEventListener("mousedown", (event) => {
        if (event.target === overlay && !isBusy())
          done(null);
      });
      document.getElementById("root").appendChild(overlay);
    });
  }
  var confirmDialog = (text, { danger = true, yes = "Run" } = {}) => dialog({
    title: "Confirmation",
    build: (body) => body.appendChild(el3("p", null, text)),
    actions: [
      { label: "Cancel", value: false },
      { label: yes, value: true, kind: danger ? "danger" : "primary", shortcut: true }
    ]
  }).then((v2) => v2 === true);
  var redisPanel = createRedisPanel({ svc, dialog, confirmDialog, toast });
  function openMenu(anchor, items, { align = "right" } = {}) {
    closeMenu();
    const menu = el3("div", "menu");
    for (const item of items) {
      if (item === "-") {
        menu.appendChild(el3("div", "msep"));
        continue;
      }
      if (item.checkbox !== undefined) {
        const row2 = el3("div", "mi");
        const label = el3("label");
        const cb = el3("input");
        cb.type = "checkbox";
        cb.checked = item.checkbox;
        cb.addEventListener("change", () => item.onToggle(cb.checked));
        label.append(cb, document.createTextNode(item.label));
        row2.appendChild(label);
        menu.appendChild(row2);
        continue;
      }
      const row = el3("div", `mi${item.disabled ? " dis" : ""}`, item.label);
      if (!item.disabled)
        row.addEventListener("click", () => {
          closeMenu();
          item.onClick?.();
        });
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
      if (!menu.contains(event.target) && event.target !== anchor)
        closeMenu();
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
  function renderJsonHighlighted(text) {
    const pre = el3("pre", "vv json");
    if (text.length > 200000) {
      pre.textContent = text;
      return pre;
    }
    const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last)
        pre.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = el3("span");
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
    if (last < text.length)
      pre.appendChild(document.createTextNode(text.slice(last)));
    return pre;
  }
  var plainPre = (text) => {
    const pre = el3("pre", "vv");
    pre.textContent = text;
    return pre;
  };
  function valueViewDialog(colName, type, raw, { onEdit } = {}) {
    const info = prettyValue(raw);
    if (!info)
      return false;
    const actions = [
      {
        label: "Copy",
        onClick: async () => {
          await host.writeClipboard(info.text).catch(() => toast("error", "Failed to copy."));
        }
      }
    ];
    if (onEdit)
      actions.push({ label: "Edit", kind: "primary", onClick: (done) => {
        done(null);
        onEdit();
      } });
    actions.push({ label: "Close", value: null });
    dialog({
      title: type ? `${colName} — ${type}` : colName,
      build: (body) => body.appendChild(info.isJson ? renderJsonHighlighted(info.text) : plainPre(info.text)),
      actions
    });
    return true;
  }
  var SQL_KEYWORDS = new Set("select from where insert into values update set delete join left right inner outer full cross on group by order having limit offset union all distinct as and or not null is in like between case when then else end returning with explain analyze table show exists any some asc desc primary key foreign references unique index view create alter drop truncate grant revoke".split(" "));
  var escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function highlightSql(text) {
    const re = /(--[^\n]*)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;
    let out = "";
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last)
        out += escapeHtml(text.slice(last, m.index));
      const token = m[0];
      if (m[1] !== undefined)
        out += `<span class="sc">${escapeHtml(token)}</span>`;
      else if (m[2] !== undefined)
        out += `<span class="ss">${escapeHtml(token)}</span>`;
      else if (m[3] !== undefined)
        out += `<span class="sn">${escapeHtml(token)}</span>`;
      else
        out += SQL_KEYWORDS.has(token.toLowerCase()) ? `<span class="sk">${escapeHtml(token)}</span>` : escapeHtml(token);
      last = m.index + token.length;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }
  var root = document.getElementById("root");
  var viewEl = null;
  var treeEl = null;
  var workspaceEl = null;
  var objectTabsEl = null;
  var workspaceTabsEl = null;
  var bannerEl = null;
  var statusEl = null;
  function showBanner(text, kind = "error") {
    hideBanner();
    bannerEl = el3("div", `banner ${kind}`, text);
    workspaceEl.insertBefore(bannerEl, viewEl);
  }
  var hideBanner = () => {
    if (bannerEl)
      bannerEl.remove();
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
    const style = el3("style");
    style.textContent = CSS2;
    document.head.appendChild(style);
    const top = el3("div", "topbar");
    const brand = el3("div", "brand");
    const explorerToggle = el3("button", "brand-toggle");
    explorerToggle.appendChild(dbLogo());
    explorerToggle.title = "Show or hide Database Explorer";
    explorerToggle.setAttribute("aria-label", "Show or hide Database Explorer");
    explorerToggle.addEventListener("click", () => {
      state.explorerVisible = !state.explorerVisible;
      root.classList.toggle("explorer-hidden", !state.explorerVisible);
    });
    brand.append(explorerToggle, el3("span", "brand-name", "Database Explorer"));
    top.appendChild(brand);
    const path = el3("span", "app-path");
    top.append(path, el3("span", "spacer"));
    const actions = el3("div", "top-actions");
    const pal = el3("button", "iconbtn", "⌘ K");
    pal.title = "Go to table (Ctrl/⌘+K)";
    pal.addEventListener("click", () => openPalette());
    const gear = el3("button", "iconbtn", "⚙");
    gear.title = "Add connection";
    gear.setAttribute("aria-label", "Add connection");
    gear.addEventListener("click", () => connectionsDialog());
    actions.append(pal, gear);
    top.appendChild(actions);
    root.appendChild(top);
    const workbench = el3("div", "workbench");
    const sidebar = el3("aside", "sidebar");
    const connection = el3("button", "connection-picker");
    connection.addEventListener("click", () => openConnectionMenu(connection));
    sidebar.appendChild(connection);
    const explorerHead = el3("div", "explorer-head");
    explorerHead.appendChild(el3("span", "section-title", "Database Explorer"));
    const refresh = el3("button", "iconbtn", "⟳");
    refresh.title = "Refresh database schema";
    refresh.addEventListener("click", () => refreshTree());
    const hide = el3("button", "iconbtn", "⟨");
    hide.title = "Hide Explorer";
    hide.addEventListener("click", () => {
      state.explorerVisible = false;
      root.classList.add("explorer-hidden");
    });
    explorerHead.append(refresh, hide);
    sidebar.appendChild(explorerHead);
    treeEl = el3("div", "explorer-view");
    sidebar.appendChild(treeEl);
    workbench.appendChild(sidebar);
    workspaceEl = el3("section", "workspace");
    objectTabsEl = el3("div", "object-tabs");
    workspaceTabsEl = el3("div", "workspace-tabs");
    viewEl = el3("div", "view");
    workspaceEl.append(objectTabsEl, workspaceTabsEl, viewEl);
    workbench.appendChild(workspaceEl);
    root.appendChild(workbench);
    statusEl = el3("div", "statusbar");
    root.appendChild(statusEl);
    root._connection = connection;
    root._path = path;
  }
  function updateChrome() {
    const conn = state.conns.find((c) => c.id === state.connId);
    const picker = root._connection;
    picker.innerHTML = "";
    const icon2 = el3("span", "dbicon");
    icon2.appendChild(dbLogo());
    const copy = el3("span", "conn-copy");
    copy.appendChild(el3("span", "conn-name", conn?.name ?? "Add connection"));
    copy.appendChild(el3("span", "conn-detail", conn ? `${DB_TYPES[conn.kind]?.label ?? "PostgreSQL"} · ${conn.host}:${conn.port}/${conn.database}` : "PostgreSQL · MongoDB · Redis"));
    picker.append(icon2, copy);
    if (conn)
      picker.appendChild(el3("span", "online"));
    picker.appendChild(el3("span", "chevron", "▼"));
    root._path.textContent = conn ? `${conn.database || conn.name}${state.table ? ` / ${state.table.schema}` : ""}` : "Database Explorer";
    root.classList.toggle("explorer-hidden", !state.explorerVisible);
    renderObjectTabs();
    renderWorkspaceTabs();
    renderStatusBar();
  }
  function openConnectionMenu(anchor) {
    if (!state.conns.length)
      return connectionsDialog();
    const current = currentConnection();
    openMenu(anchor, [
      ...state.conns.map((conn) => ({
        label: `${conn.id === state.connId ? "✓" : "　"} ${conn.name} · ${DB_TYPES[conn.kind]?.short ?? "DB"} · ${conn.host}:${conn.port}/${conn.database}`,
        onClick: () => selectConnection(conn.id)
      })),
      "-",
      { label: "Add connection…", onClick: () => connectionsDialog() },
      ...current ? [{ label: `Delete “${current.name}”…`, onClick: () => deleteConnection(current.id) }] : []
    ], { align: "left" });
  }
  function renderObjectTabs() {
    objectTabsEl.innerHTML = "";
    for (const table of state.openTables) {
      const active2 = state.tab === "tree" && state.mode === "data" && state.table === table;
      const tab = el3("div", `objtab${active2 ? " on" : ""}`);
      tab.tabIndex = 0;
      tab.setAttribute("role", "button");
      tab.title = `${table.schema}.${table.name}`;
      tab.appendChild(el3("span", "objicon", "▦"));
      tab.appendChild(el3("span", "objschema", `${table.schema}.`));
      tab.appendChild(el3("span", "objname", table.name));
      const close = el3("button", "objclose", "×");
      close.title = "Close tab";
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        closeTableTab(table);
      });
      tab.appendChild(close);
      tab.addEventListener("click", () => openTable(table.schema, table.name));
      tab.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ")
          openTable(table.schema, table.name);
      });
      objectTabsEl.appendChild(tab);
    }
    if (state.sqlOpen && isPostgres()) {
      const tab = el3("div", `objtab${state.tab === "sql" ? " on" : ""}`);
      tab.tabIndex = 0;
      tab.setAttribute("role", "button");
      tab.append(el3("span", "objicon", "›_"), el3("span", "objname", "console.sql"));
      const close = el3("button", "objclose", "×");
      close.title = "Close console";
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        state.sqlOpen = false;
        if (state.tab === "sql")
          state.tab = "tree";
        render();
      });
      tab.appendChild(close);
      tab.addEventListener("click", () => openSqlConsole());
      tab.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ")
          openSqlConsole();
      });
      objectTabsEl.appendChild(tab);
    }
    if (isPostgres()) {
      const add = el3("button", "objtab new", "+");
      add.title = "New SQL console";
      add.addEventListener("click", () => openSqlConsole());
      objectTabsEl.appendChild(add);
    }
  }
  function renderWorkspaceTabs() {
    workspaceTabsEl.innerHTML = "";
    const items = [
      ["data", "▦  Data"],
      ...isPostgres() ? [["sql", "›_  SQL"]] : [],
      ["structure", "☷  Structure"]
    ];
    for (const [view, label] of items) {
      const active2 = view === "sql" ? state.tab === "sql" : state.tab === "tree" && state.mode === "data" && state.tableView === view;
      const button2 = el3("button", `wtab${active2 ? " on" : ""}`, label);
      if (view !== "sql" && !state.table) {
        button2.disabled = true;
        button2.title = "Select a table in Explorer first";
      } else {
        button2.addEventListener("click", () => {
          if (view === "sql")
            return openSqlConsole();
          state.tab = "tree";
          state.mode = "data";
          state.tableView = view;
          render();
        });
      }
      workspaceTabsEl.appendChild(button2);
    }
    workspaceTabsEl.appendChild(el3("span", "hint", "Ctrl/⌘+K — Find objects"));
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
    if (!statusEl)
      return;
    statusEl.innerHTML = "";
    const conn = state.conns.find((c) => c.id === state.connId);
    if (conn) {
      const s = el3("span", "s connection-status");
      s.append(el3("span", "online"), document.createTextNode(conn.name));
      statusEl.appendChild(s);
    }
    if (state.pgVersion)
      statusEl.appendChild(el3("span", "s", `PG ${state.pgVersion}`));
    const sqlActive = state.tab === "sql";
    const ms = sqlActive ? state.sqlResult?.ms : state.table?.page?.ms;
    if (typeof ms === "number") {
      const s = el3("span", `s${ms < 400 ? " ok" : ""}`);
      s.textContent = `${ms} ms`;
      statusEl.appendChild(s);
    }
    const total = sqlActive ? state.sqlResult?.rowCount : state.table?.page?.total;
    const unit = sqlActive || isPostgres() ? plural(total, "row") : currentKind() === "mongodb" ? plural(total, "document") : plural(total, "key");
    if (typeof total === "number")
      statusEl.appendChild(el3("span", "s", `${fmtInt(total)} ${unit}`));
    statusEl.appendChild(el3("span", "s end", sqlActive ? "SQL console" : state.tableView === "structure" ? "Schema" : "Ready"));
  }
  function openPalette() {
    if (!state.schemas.length) {
      toast("info", "Connect to a database first.");
      return;
    }
    const items = [];
    for (const schema of state.schemas) {
      for (const t of schema.tables)
        items.push({ schema: schema.name, table: t });
    }
    let filtered = items.slice(0, 50);
    let sel = 0;
    const overlay = el3("div", "overlay");
    const box = el3("div", "dialog pal");
    box.style.maxWidth = "460px";
    const input = el3("input");
    input.placeholder = "Table or schema…";
    const list = el3("div", "plist");
    box.append(input, list);
    overlay.appendChild(box);
    const paint = () => {
      list.innerHTML = "";
      filtered.forEach((item, i) => {
        const row = el3("div", `pi${i === sel ? " sel" : ""}`);
        row.appendChild(el3("span", null, `${item.schema}.${item.table.name}`));
        const kindLabel = objectKindLabel(item.table.kind);
        if (kindLabel)
          row.appendChild(el3("span", "pk", kindLabel));
        const meta = el3("span", "pmeta");
        meta.textContent = item.table.approxRows !== null && item.table.approxRows >= 0 ? `~${fmtCount(item.table.approxRows)}` : "";
        row.appendChild(meta);
        row.addEventListener("click", () => choose(i));
        row.addEventListener("mousemove", () => {
          if (sel !== i) {
            sel = i;
            paint();
          }
        });
        list.appendChild(row);
      });
      if (!filtered.length)
        list.appendChild(el3("div", "empty", "No matches found."));
    };
    const applyFilter = () => {
      const q = input.value.trim().toLowerCase();
      filtered = (q ? items.filter((x) => `${x.schema}.${x.table.name}`.toLowerCase().includes(q)) : items).slice(0, 50);
      sel = 0;
      paint();
    };
    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
    };
    const choose = (i) => {
      const item = filtered[i];
      if (!item)
        return;
      close();
      openTable(item.schema, item.table.name);
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        sel = Math.min(sel + 1, filtered.length - 1);
        paint();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        sel = Math.max(sel - 1, 0);
        paint();
      } else if (event.key === "Enter") {
        event.preventDefault();
        choose(sel);
      }
    };
    input.addEventListener("input", applyFilter);
    document.addEventListener("keydown", onKey, true);
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay)
        close();
    });
    document.getElementById("root").appendChild(overlay);
    paint();
    setTimeout(() => input.focus(), 30);
  }
  var pendingKeyFor = (t) => `${t.schema}.${t.name}`;
  var isCurrentTableContext = (t, connection) => state.connId === connection && state.table === t && state.openTables.includes(t);
  function ensurePendingScope() {
    const t = state.table;
    if (!t)
      return false;
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
    if (!ensurePendingScope())
      return false;
    const key = `${pkVal}${SEP}${col}`;
    if (state.pending.has(`${SEP}del${SEP}${pkVal}`))
      return false;
    state.pending.set(key, { op: "update", pkVal: String(pkVal), col, old: oldValue, now: valNull ? null : newValue, valNull });
    return true;
  }
  function stageDelete(pkVal) {
    if (!ensurePendingScope())
      return;
    for (const [key, value] of state.pending)
      if (value.pkVal === String(pkVal))
        state.pending.delete(key);
    state.pending.set(`${SEP}del${SEP}${pkVal}`, { op: "delete", pkVal: String(pkVal) });
  }
  function pendingMarks() {
    const cells = new Set;
    const deleted = new Set;
    const replaced = new Set;
    for (const [key, value] of state.pending) {
      if (value.op === "delete" || value.op === "mongo-delete")
        deleted.add(value.pkVal);
      else if (value.op === "mongo-update") {
        for (const field3 of value.changes.keys())
          cells.add(`${value.pkVal}${SEP}${field3}`);
      } else if (value.op === "mongo-replace")
        replaced.add(value.pkVal);
      else
        cells.add(key);
    }
    return { cells, deleted, replaced };
  }
  async function applyPendingDialog() {
    if (currentKind() === "mongodb")
      return applyMongoPendingDialog();
    return applyPostgresPendingDialog();
  }
  async function applyPostgresPendingDialog() {
    const t = state.table;
    const page = t?.page;
    if (!t || !page || !page.pk || state.batchBusy)
      return;
    const entries = [...state.pending.entries()];
    const ops = entries.map(([, op]) => op);
    if (!ops.length)
      return;
    const connection = state.connId;
    const scope = pendingKeyFor(t);
    let applying = false;
    state.batchBusy = true;
    try {
      const ok = await dialog({
        title: `Apply ${ops.length} ${plural(ops.length, "change")} — ${t.schema}.${t.name}`,
        isBusy: () => applying,
        build: (body) => {
          const table = el3("table", "review");
          for (const op of ops) {
            const tr = el3("tr", op.op === "delete" ? "del" : "");
            if (op.op === "delete") {
              const td = el3("td", "c", `delete row ${page.pk} = ${op.pkVal}`);
              td.colSpan = 3;
              tr.appendChild(td);
            } else {
              tr.appendChild(el3("td", "c", `${page.pk}=${op.pkVal} · ${op.col}`));
              tr.appendChild(el3("td", "o", op.old === null ? NULL_TEXT : esc(op.old)));
              tr.appendChild(el3("td", "n", op.valNull ? NULL_TEXT : esc(op.now)));
            }
            table.appendChild(tr);
          }
          body.appendChild(table);
          body.appendChild(el3("p", null, "All changes are applied in a single transaction: all or nothing."));
        },
        actions: [
          { label: "Discard all", kind: "danger", onClick: (done) => {
            clearPending();
            done(null);
            render();
          } },
          { label: "Close", value: null },
          {
            label: `Apply (${ops.length})`,
            kind: "primary",
            onClick: async (done) => {
              if (applying)
                return false;
              applying = true;
              const buttons = [...document.querySelectorAll(".overlay .acts button")];
              buttons.forEach((button2) => {
                button2.disabled = true;
              });
              try {
                const data = await svc("POST", "/batch", {
                  body: {
                    connection,
                    schema: t.schema,
                    table: t.name,
                    pk: page.pk,
                    ops
                  }
                });
                for (const [key, op] of entries) {
                  if (state.pending.get(key) === op)
                    state.pending.delete(key);
                }
                if (!state.pending.size && state.pendingFor === scope)
                  state.pendingFor = null;
                toast("success", `Applied. Rows affected: ${data.affected}`);
                done(true);
                if (state.connId === connection && state.table === t && state.mode === "data") {
                  await reloadTable(page.offset, undefined, { target: t, preservePending: true });
                } else if (state.connId === connection && state.openTables.includes(t)) {
                  t.page = null;
                }
              } catch (error) {
                applying = false;
                buttons.forEach((button2) => {
                  button2.disabled = false;
                });
                toast("error", error.message);
                return false;
              }
            }
          }
        ]
      });
      if (ok)
        render();
    } finally {
      state.batchBusy = false;
    }
  }
  async function leaveDataGuard() {
    if (!pendingCount())
      return true;
    const n = pendingCount();
    return confirmDialog(`You have ${n} pending ${plural(n, "change")}. Leave without applying?`, { yes: "Leave" });
  }
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
      present = null,
      rowIdentity = null,
      onOpenRow = null,
      inspectTitle = "Row inspector",
      deleteTitle = "Delete row"
    } = opts;
    const idx = indices ?? columns.map((_, i) => i);
    const wrap = el3("div", "gridwrap");
    const table = el3("table", `grid${sticky ? " stick" : ""}`);
    const colgroup = document.createElement("colgroup");
    idx.forEach((sourceIndex, i) => {
      const col = document.createElement("col");
      const w = widths?.[columns[i]];
      if (w)
        col.style.width = `${w}px`;
      colgroup.appendChild(col);
    });
    if (onDeleteRow || onInspect) {
      const col = document.createElement("col");
      col.style.width = "44px";
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);
    const headRow = el3("tr");
    columns.forEach((c, i) => {
      const th = el3("th");
      if (pk === c) {
        th.appendChild(el3("span", null, "PK "));
        th.title = `${c} — primary key`;
      }
      th.appendChild(document.createTextNode(c));
      const metaType = columnMeta?.find((m) => m.name === c)?.type;
      if (metaType) {
        th.appendChild(typeBadge(metaType));
        th.title = th.title ? `${th.title} (${metaType})` : `${c} — ${metaType}`;
      }
      if (order === c)
        th.appendChild(el3("span", "arr", desc ? "▼" : "▲"));
      if (onSort && (!sortColumns || sortColumns.includes(c)))
        th.addEventListener("click", (event) => {
          if (event.target.classList.contains("rs"))
            return;
          onSort(c);
        });
      if (onResize) {
        const rs = el3("span", "rs");
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
    if (onDeleteRow || onInspect)
      headRow.appendChild(el3("th"));
    table.appendChild(headRow);
    rows.forEach((row, rowIndex) => {
      const tr = el3("tr");
      const pkVal = rowIdentity ? rowIdentity(row, rowIndex) : pkIndex >= 0 ? row[pkIndex] : null;
      const isDel = marks?.deleted.has(String(pkVal));
      if (isDel)
        tr.classList.add("pending-del");
      if (onOpenRow) {
        tr.classList.add("openable");
        tr.addEventListener("dblclick", (event) => {
          if (!event.target.closest("button"))
            onOpenRow(row, rowIndex);
        });
      }
      columns.forEach((c, i) => {
        const sourceIndex = idx[i];
        const value = row[sourceIndex];
        const missing = present?.[rowIndex]?.[sourceIndex] === false;
        const td = el3("td", missing ? "missing" : value === null ? "null" : "");
        const meta = columnMeta?.find((m) => m.name === c);
        const tclass = typeClass(meta?.type);
        let display = missing ? "missing" : value === null ? NULL_TEXT : esc(value);
        if (tclass === "bool" && value !== null) {
          const truthy = value === "t" || value === "true" || value === "1";
          const pill = el3("span", `boolpill${truthy ? "" : " f"}`, truthy ? "✓ true" : "✗ false");
          td.appendChild(pill);
          td.classList.add("bool");
        } else if (tclass === "uuid" && value !== null) {
          td.textContent = uuidShort(display);
          td.classList.add("uuid");
          td.title = display;
        } else {
          td.textContent = display;
        }
        if (tclass === "num")
          td.classList.add("num");
        if (missing)
          td.title = "Missing field";
        else if (value !== null && !td.title)
          td.title = display;
        const markKey = `${pkVal}${SEP}${c}`;
        if (marks && pkVal !== null && (marks.cells.has(markKey) || marks.replaced.has(String(pkVal))))
          td.classList.add("pending");
        const canEdit = editable && pk && pkVal !== null && c !== pk && onEditCell && !isDel;
        if (onOpenRow) {
          td.title = "Double-click to open Key Editor";
        } else if (!missing && value !== null && prettyValue(value)) {
          td.classList.add("viewable");
          if (!td.classList.contains("uuid"))
            td.title = "Click to view value";
          td.addEventListener("click", () => valueViewDialog(c, meta?.type, value, { onEdit: canEdit ? () => onEditCell(row, c, rowIndex) : undefined }));
          if (canEdit)
            td.addEventListener("dblclick", () => onEditCell(row, c, rowIndex));
        } else if (canEdit) {
          td.classList.add("editable");
          td.addEventListener("dblclick", () => onEditCell(row, c, rowIndex));
        }
        tr.appendChild(td);
      });
      if ((onDeleteRow || onInspect) && pk) {
        const td = el3("td", "rowact");
        if (onInspect) {
          const inspect = el3("button", null, "⤢");
          inspect.classList.add("inspect");
          inspect.title = inspectTitle;
          inspect.addEventListener("click", () => onInspect(row, rowIndex));
          td.appendChild(inspect);
        }
        if (onDeleteRow) {
          const del = el3("button", null, "✕");
          del.title = deleteTitle;
          del.addEventListener("click", () => onDeleteRow(row, rowIndex));
          td.appendChild(del);
        }
        tr.appendChild(td);
      }
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    return wrap;
  }
  function renderTree() {
    treeEl.innerHTML = "";
    const search = el3("div", "search");
    const input = el3("input");
    input.type = "text";
    input.placeholder = "Search objects…";
    input.value = state.filter;
    input.addEventListener("input", () => {
      state.filter = input.value;
      renderTreeList();
    });
    search.appendChild(input);
    treeEl.appendChild(search);
    const list = el3("div", "scroll");
    treeEl.appendChild(list);
    treeEl._list = list;
    const info = el3("div");
    treeEl.insertBefore(info, list);
    treeEl._info = info;
    renderTreeList();
  }
  function renderSkeletons(container, n) {
    for (let i = 0;i < n; i++) {
      const sk = el3("div", "sk");
      sk.style.width = `${55 + i * 37 % 40}%`;
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
      list.appendChild(el3("div", "empty", "No connections. Add PostgreSQL, MongoDB, or Redis using the ⚙ button."));
      return;
    }
    if (conn) {
      const dbroot = el3("div", "dbroot");
      const icon2 = el3("span", "dbicon");
      icon2.appendChild(dbLogo());
      dbroot.append(icon2, el3("span", "online"), el3("span", "dbname", conn.database || conn.name));
      if (state.treeReady)
        dbroot.appendChild(el3("span", "dbcount", currentKind() === "mongodb" ? `${state.schemas.length} ${plural(state.schemas.length, "database")}` : currentKind() === "redis" ? "keys" : `${state.schemas.length} ${plural(state.schemas.length, "schema")}`));
      list.appendChild(dbroot);
    }
    if (!state.treeReady) {
      renderSkeletons(list, 7);
      return;
    }
    if (!state.schemas.length) {
      list.appendChild(el3("div", "empty", currentKind() === "mongodb" ? "No databases or collections available." : "No user objects in this database."));
      return;
    }
    let shownTables = 0;
    for (const schema of state.schemas) {
      const schemaMatches = schema.name.toLowerCase().includes(filter);
      const tables = schema.tables.filter((t) => !filter || schemaMatches || t.name.toLowerCase().includes(filter));
      if (!tables.length)
        continue;
      shownTables += tables.length;
      const open = !!filter || state.expanded.has(schema.name);
      const block = el3("div", "schema" + (open ? " open" : ""));
      const head = el3("div", "head");
      head.appendChild(el3("span", "chev", "▸"));
      head.appendChild(el3("span", "schemaicon", "▱"));
      head.appendChild(el3("span", null, schema.name));
      head.appendChild(el3("span", "count", `${tables.length}`));
      head.addEventListener("click", () => {
        if (state.expanded.has(schema.name))
          state.expanded.delete(schema.name);
        else
          state.expanded.add(schema.name);
        renderTreeList();
      });
      block.appendChild(head);
      if (open) {
        for (const t of tables) {
          const active2 = state.tab === "tree" && state.mode === "data" && state.table?.schema === schema.name && state.table?.name === t.name;
          const row = el3("div", `trow${active2 ? " on" : ""}`);
          row.appendChild(el3("span", "tableicon", t.kind === "view" || t.kind === "matview" ? "◫" : "▦"));
          row.appendChild(el3("span", "tname", t.name));
          const kindLabel = objectKindLabel(t.kind);
          if (kindLabel)
            row.appendChild(el3("span", "kind", kindLabel));
          const meta = el3("span", "tmeta");
          meta.textContent = t.approxRows !== null && t.approxRows >= 0 ? fmtCount(t.approxRows) : "";
          row.appendChild(meta);
          row.title = `${schema.name}.${t.name} — ${t.columns.length} ${plural(t.columns.length, "column")}${t.primaryKey ? `, PK: ${t.primaryKey}` : ", no PK"}`;
          row.addEventListener("click", () => openTable(schema.name, t.name));
          block.appendChild(row);
        }
      }
      list.appendChild(block);
    }
    if (!shownTables)
      list.appendChild(el3("div", "empty", "No matches found."));
  }
  var fmtCount = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
  var fmtInt = (n) => Number(n).toLocaleString("en-US");
  var plural = (n, singular, pluralForm) => n === 1 ? singular : pluralForm ?? `${singular}s`;
  var colsKey = () => `${state.connId}:${pendingKeyFor(state.table)}`;
  async function loadColsPrefs() {
    try {
      const stored = await host.storage.get("tablecols").catch(() => {
        return;
      });
      if (stored && typeof stored === "object")
        state.colsPrefs = stored;
    } catch {
      state.colsPrefs = {};
    }
  }
  function tablePrefs() {
    const key = colsKey();
    if (!state.colsPrefs[key])
      state.colsPrefs[key] = { hidden: [], widths: {} };
    return state.colsPrefs[key];
  }
  async function saveColsPrefs() {
    await host.storage.set("tablecols", state.colsPrefs).catch(() => {});
  }
  function visibleEntries(page) {
    const prefs = tablePrefs();
    const entries = [];
    page.columns.forEach((c, i) => {
      if (!prefs.hidden.includes(c))
        entries.push({ name: c, index: i, type: page.columnMeta.find((m) => m.name === c)?.type });
    });
    return entries;
  }
  var VIEW_MODES = [
    ["table", "Table"],
    ["json", "JSON"],
    ["text", "Text"]
  ];
  function seg(current, onPick) {
    const box = el3("div", "seg");
    for (const [value, label] of VIEW_MODES) {
      const b = el3("button", value === current ? "on" : "", label);
      b.addEventListener("click", () => onPick(value));
      box.appendChild(b);
    }
    return box;
  }
  function buildPager(page) {
    const pager = el3("div", "pager");
    const prev = el3("button", "iconbtn", "‹");
    const next = el3("button", "iconbtn", "›");
    const from = page.total === 0 ? 0 : page.offset + 1;
    const to = page.offset + page.rowCount;
    pager.append(prev, el3("span", null, `${fmtInt(from)}–${fmtInt(to)} / ${fmtInt(page.total)}`), next);
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
    if (!t)
      return renderWelcome();
    const connection = state.connId;
    const bar = el3("div", "databar");
    const page = t.page;
    const pgWritable = isPostgres() && !page?.readOnly && !t.loading;
    const mongoWritable = currentKind() === "mongodb" && !page?.readOnly && !t.loading && hasMongoSnapshots(page);
    const redisReady = currentKind() === "redis" && !!page && !t.loading;
    if (page) {
      const n = pendingCount();
      if (n) {
        const pend = el3("button", "iconbtn pend");
        const pendingUnit = currentKind() === "mongodb" ? "document" : "change";
        pend.append(el3("span", "dotp"), document.createTextNode(`${n} ${plural(n, pendingUnit)}`));
        pend.title = "Review pending changes";
        pend.addEventListener("click", () => applyPendingDialog());
        bar.appendChild(pend);
        const apply = el3("button", "btn warn", "Apply");
        apply.addEventListener("click", () => applyPendingDialog());
        bar.appendChild(apply);
      }
      if (pgWritable) {
        const insert = el3("button", "iconbtn", "＋ New row");
        if (page.pk)
          insert.addEventListener("click", () => insertDialog());
        else {
          insert.disabled = true;
          insert.title = "Only for tables with a primary key";
        }
        bar.appendChild(insert);
      } else if (mongoWritable) {
        const insert = el3("button", "iconbtn", "＋ New document");
        insert.addEventListener("click", () => mongoDocumentDialog({ table: t, connection, insert: true }));
        bar.appendChild(insert);
      } else if (redisReady) {
        const insert = el3("button", "iconbtn", "＋ New key");
        insert.addEventListener("click", () => redisPanel.openCreate({
          connection,
          onCreated: () => refreshRedisTable(t, connection)
        }));
        bar.appendChild(insert);
      }
      const filter = el3("button", `iconbtn${t.filter ? " active" : ""}`, "▽ Filter");
      filter.title = "Filter rows";
      filter.addEventListener("click", () => {
        if (!t.filter)
          t.filter = { col: page.filterColumns?.[0] ?? page.columns[0], op: currentKind() === "mongodb" && page.columns[0] === "_id" ? "eq" : "contains", val: "" };
        render();
        setTimeout(() => viewEl.querySelector(".fbar input")?.focus(), 0);
      });
      bar.appendChild(filter);
      const more = el3("button", "iconbtn", "⋮");
      more.title = "Columns, export, and copy";
      more.addEventListener("click", () => openDataMenu(more));
      bar.appendChild(more);
      bar.appendChild(el3("span", "spacer"));
      bar.appendChild(seg(state.viewMode, (v2) => {
        state.viewMode = v2;
        render();
      }));
    }
    const refresh = el3("button", "iconbtn", "⟳");
    refresh.title = "Refresh data";
    refresh.addEventListener("click", () => reloadTable());
    bar.appendChild(refresh);
    viewEl.appendChild(bar);
    if (page && t.filter)
      viewEl.appendChild(buildFilterBar(page, t.filter));
    if (!page) {
      const skel = el3("div");
      renderSkeletons(skel, 8);
      viewEl.appendChild(skel);
      return;
    }
    const marks = pendingMarks();
    const entries = visibleEntries(page);
    const mongoModel = currentKind() === "mongodb" && hasMongoSnapshots(page) ? mongoViewModel(page) : null;
    const viewPage = mongoModel ? { ...page, rows: mongoModel.rows } : page;
    if (state.viewMode === "json") {
      viewEl.appendChild(renderJsonView(viewPage, entries, marks, currentKind() === "mongodb" ? (row, rowIndex) => mongoRowIdentity(page, rowIndex) : null));
    } else if (state.viewMode === "text") {
      viewEl.appendChild(renderTextView(viewPage, entries));
    } else {
      viewEl.appendChild(buildGrid(entries.map((e) => e.name), viewPage.rows, {
        pk: page.pk,
        pkIndex: page.pk ? page.columns.indexOf(page.pk) : -1,
        editable: pgWritable || mongoWritable,
        columnMeta: page.columnMeta,
        indices: entries.map((e) => e.index),
        widths: tablePrefs().widths,
        marks,
        present: mongoModel?.present,
        rowIdentity: currentKind() === "mongodb" ? (row, rowIndex) => mongoRowIdentity(page, rowIndex) : null,
        sticky: !!page.pk,
        onEditCell: pgWritable ? (row, col) => {
          if (isCurrentTableContext(t, connection))
            editCellDialog(row, col);
        } : mongoWritable ? (row, col, rowIndex) => {
          if (isCurrentTableContext(t, connection))
            editMongoCellDialog(rowIndex, col);
        } : undefined,
        onDeleteRow: pgWritable ? (row) => {
          if (isCurrentTableContext(t, connection))
            deleteRowDialog(row);
        } : mongoWritable ? (row, rowIndex) => {
          if (isCurrentTableContext(t, connection))
            deleteMongoDocumentDialog(rowIndex);
        } : undefined,
        onInspect: currentKind() === "redis" ? (row) => {
          if (isCurrentTableContext(t, connection))
            openRedisEditorForRow(t, connection, row);
        } : (row, rowIndex) => openInspector(row, rowIndex),
        onOpenRow: currentKind() === "redis" ? (row) => {
          if (isCurrentTableContext(t, connection))
            openRedisEditorForRow(t, connection, row);
        } : null,
        inspectTitle: currentKind() === "redis" ? "Open Key Editor" : currentKind() === "mongodb" ? "Document inspector" : "Row inspector",
        deleteTitle: currentKind() === "mongodb" ? "Delete document" : "Delete row",
        onSort: (col) => reloadTable(0, col),
        sortColumns: page.sortColumns,
        onResize: async (col, width) => {
          tablePrefs().widths[col] = width;
          await saveColsPrefs();
        },
        order: page.order,
        desc: page.desc
      }));
    }
    const footer = el3("div", "datafoot");
    if (!page.pk)
      footer.appendChild(el3("span", "notice", "No PK — read-only"));
    else if (currentKind() === "redis")
      footer.appendChild(el3("span", null, "Double-click a key to open Key Editor"));
    else if (currentKind() === "mongodb" && !hasMongoSnapshots(page))
      footer.appendChild(el3("span", "notice", "Canonical document snapshots unavailable — read-only"));
    else if (page.readOnly)
      footer.appendChild(el3("span", "notice", `${DB_TYPES[currentKind()].label} · read-only`));
    else
      footer.appendChild(el3("span", null, `${t.schema}.${t.name}`));
    footer.appendChild(el3("span", "spacer"));
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
    if (!t || !meta)
      return renderWelcome();
    const info = el3("div", "structure-meta");
    info.appendChild(el3("span", "pill", meta.kind === "matview" ? "MATERIALIZED VIEW" : meta.kind.toUpperCase()));
    info.appendChild(el3("span", null, `${meta.columns.length} ${plural(meta.columns.length, "column")}`));
    info.appendChild(el3("span", null, meta.primaryKey ? `PK: ${meta.primaryKey}` : "No primary key"));
    if (meta.approxRows !== null && meta.approxRows >= 0)
      info.appendChild(el3("span", null, `≈ ${fmtCount(meta.approxRows)} ${plural(meta.approxRows, "row")}`));
    viewEl.appendChild(info);
    const wrap = el3("div", "gridwrap");
    const table = el3("table", "grid structure-grid");
    const head = el3("tr");
    for (const label of ["Column", "Type", "Nullable", "Key"])
      head.appendChild(el3("th", null, label));
    table.appendChild(head);
    for (const column of meta.columns) {
      const row = el3("tr");
      row.appendChild(el3("td", null, column.name));
      const type = el3("td");
      type.appendChild(typeBadge(column.type));
      type.appendChild(document.createTextNode(` ${column.type}`));
      row.appendChild(type);
      row.appendChild(el3("td", column.nullable ? "null" : "", column.nullable ? "YES" : "NO"));
      const key = el3("td");
      if (column.pk)
        key.appendChild(el3("span", "keypill", "PRIMARY KEY"));
      row.appendChild(key);
      table.appendChild(row);
    }
    wrap.appendChild(table);
    viewEl.appendChild(wrap);
    const footer = el3("div", "datafoot");
    footer.appendChild(el3("span", null, `${t.schema}.${t.name}`));
    footer.appendChild(el3("span", "spacer"));
    footer.appendChild(el3("span", null, currentKind() === "postgres" ? "pg_catalog metadata" : currentKind() === "mongodb" ? "Fields from the current document page" : "Redis metadata"));
    viewEl.appendChild(footer);
  }
  function renderWelcome() {
    viewEl.innerHTML = "";
    const welcome = el3("div", "welcome");
    const logo = el3("span", "welcome-logo");
    logo.appendChild(dbLogo());
    welcome.appendChild(logo);
    welcome.appendChild(el3("h2", null, state.conns.length ? "Select an object in Explorer" : "Add a connection"));
    welcome.appendChild(el3("p", null, state.conns.length ? isPostgres() ? "Open a table on the left or create an SQL console. The tree stays in place when you switch between objects." : currentKind() === "mongodb" ? "Select a collection to browse and edit documents. Double-click a field, or use the document inspector for Form and canonical JSON editing." : "Open keys on the left to browse Redis keys. Double-click a key to edit its value, entries, TTL, or lifecycle." : "Use a separate DSN for each PostgreSQL, MongoDB, or Redis connection."));
    const actions = el3("div", "welcome-actions");
    if (!state.conns.length || isPostgres()) {
      const primary2 = el3("button", "btn primary", state.conns.length ? "New SQL console" : "Add connection");
      primary2.addEventListener("click", () => state.conns.length ? openSqlConsole() : connectionsDialog());
      actions.appendChild(primary2);
    }
    welcome.appendChild(actions);
    viewEl.appendChild(welcome);
  }
  function buildFilterBar(page, filter) {
    const bar = el3("div", "fbar");
    bar.appendChild(el3("span", "lbl", "Filter"));
    const colSel = el3("select");
    for (const c of page.filterColumns ?? page.columns) {
      const o = el3("option", null, c);
      o.value = c;
      colSel.appendChild(o);
    }
    colSel.value = filter.col;
    const OPS = [
      ["eq", "= equal to"],
      ["neq", "≠ not equal to"],
      ["gt", "> greater than"],
      ["gte", "≥"],
      ["lt", "< less than"],
      ["lte", "≤"],
      ["contains", "contains"],
      ["starts", "starts with"],
      ["isnull", "IS NULL"],
      ["notnull", "NOT NULL"]
    ];
    const opSel = el3("select");
    for (const [v2, label] of OPS) {
      const o = el3("option", null, label);
      o.value = v2;
      opSel.appendChild(o);
    }
    opSel.value = filter.op;
    const valInput = el3("input");
    valInput.placeholder = "value";
    valInput.value = filter.val ?? "";
    const noValue = () => opSel.value === "isnull" || opSel.value === "notnull";
    valInput.style.display = noValue() ? "none" : "";
    opSel.addEventListener("change", () => {
      valInput.style.display = noValue() ? "none" : "";
    });
    const applyBtn = el3("button", "iconbtn", "Apply");
    applyBtn.addEventListener("click", async () => {
      const previous = state.table.filter;
      state.table.filter = { col: colSel.value, op: opSel.value, val: valInput.value };
      if (await reloadTable(0) === false)
        state.table.filter = previous;
    });
    const reset = el3("button", "iconbtn", "✕");
    reset.title = "Clear filter";
    reset.addEventListener("click", async () => {
      const previous = state.table.filter;
      state.table.filter = null;
      if (await reloadTable(0) === false)
        state.table.filter = previous;
    });
    bar.append(colSel, opSel, valInput, applyBtn, reset);
    return bar;
  }
  function openDataMenu(anchor) {
    const t = state.table;
    const page = t?.page;
    if (!page)
      return;
    const prefs = tablePrefs();
    openMenu(anchor, [
      { label: "Columns:", disabled: true },
      ...page.columns.map((c) => ({
        label: c,
        checkbox: !prefs.hidden.includes(c),
        onToggle: async (checked) => {
          const p = tablePrefs();
          p.hidden = checked ? p.hidden.filter((x) => x !== c) : [...p.hidden, c];
          if (!checked && p.hidden.length >= page.columns.length)
            p.hidden = p.hidden.filter((x) => x !== c);
          await saveColsPrefs();
          render();
        }
      })),
      "-",
      { label: "Reset column widths and visibility", onClick: async () => {
        delete state.colsPrefs[colsKey()];
        await saveColsPrefs();
        render();
      } },
      "-",
      { label: "Export CSV", onClick: () => exportTable("csv") },
      { label: "Export JSON", onClick: () => exportTable("json") },
      { label: "Export SQL (INSERT)", onClick: () => exportTable("sql"), disabled: !isPostgres() || !page.pk },
      "-",
      { label: "Copy page (TSV)", onClick: () => copyPage() }
    ]);
  }
  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime });
    const a = el3("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function exportTable(format) {
    const t = state.table;
    const page = t?.page;
    if (!t || !page)
      return;
    const entries = visibleEntries(page);
    const names = entries.map((e) => e.name);
    const rows = page.rows.map((r) => entries.map((e) => r[e.index]));
    const base = `${t.schema}.${t.name}`;
    if (format === "csv") {
      const q = (v2) => {
        const s = v2 === null ? "" : String(v2);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      download(`${base}.csv`, [names.map(q).join(","), ...rows.map((r) => r.map(q).join(","))].join(`
`), "text/csv");
    } else if (format === "json") {
      download(`${base}.json`, JSON.stringify(rows.map((r) => Object.fromEntries(names.map((n, i) => [n, r[i]]))), null, 2), "application/json");
    } else {
      const escSql = (v2) => v2 === null ? "NULL" : `'${String(v2).replace(/'/g, "''")}'`;
      download(`${base}.sql`, rows.map((r) => `insert into "${t.schema}"."${t.name}" (${names.map((n) => `"${n}"`).join(", ")}) values (${r.map(escSql).join(", ")});`).join(`
`), "application/sql");
    }
    toast("success", `Exported ${rows.length} ${plural(rows.length, "row")}.`);
  }
  async function copyPage() {
    const page = state.table?.page;
    if (!page)
      return;
    const entries = visibleEntries(page);
    const lines = [
      entries.map((e) => e.name).join("\t"),
      ...page.rows.map((r) => entries.map((e) => r[e.index] === null ? NULL_TEXT : esc(r[e.index])).join("\t"))
    ];
    await host.writeClipboard(lines.join(`
`)).catch(() => toast("error", "Failed to copy."));
    toast("success", `Copied ${page.rows.length} ${plural(page.rows.length, "row")}.`);
  }
  function renderJsonView(page, entries, marks, rowIdentity = null) {
    const wrap = el3("div", "jsonview");
    const pkIndex = page.pk ? page.columns.indexOf(page.pk) : -1;
    page.rows.slice(0, 200).forEach((row, rowIndex) => {
      const obj = Object.fromEntries(entries.map((e) => [e.name, row[e.index] === null ? null : row[e.index]]));
      const pretty = JSON.stringify(obj, null, 2);
      const block = el3("div", "jrow");
      const headText = pkIndex >= 0 ? `${page.pk} = ${esc(row[pkIndex])}` : "row";
      const identity = rowIdentity ? rowIdentity(row, rowIndex) : row[pkIndex];
      const head = el3("div", "jhead", headText + (marks?.deleted.has(String(identity)) ? "  ·  deleted" : ""));
      const body = el3("pre", "jbody");
      body.appendChild(renderJsonHighlighted(pretty));
      head.addEventListener("click", () => {
        body.style.display = body.style.display === "none" ? "" : "none";
      });
      block.append(head, body);
      wrap.appendChild(block);
    });
    if (page.rows.length > 200)
      wrap.appendChild(el3("div", "empty", `Showing 200 of ${fmtInt(page.rows.length)} ${plural(page.rows.length, "row")}.`));
    return wrap;
  }
  function renderTextView(page, entries) {
    const pre = el3("div", "textview");
    const lines = [entries.map((e) => e.name).join(" | ")];
    for (const row of page.rows) {
      lines.push(entries.map((e) => row[e.index] === null ? NULL_TEXT : esc(row[e.index])).join(" | "));
    }
    pre.textContent = lines.join(`
`);
    return pre;
  }
  function openInspector(row, rowIndex) {
    const t = state.table;
    const connection = state.connId;
    const page = t?.page;
    if (!t || !page)
      return;
    if (currentKind() === "mongodb")
      return openMongoInspector(row, rowIndex);
    const wrap = el3("div", "sheetwrap");
    const sheet = el3("div", "sheet");
    const header = el3("header");
    const pkIndex = page.pk ? page.columns.indexOf(page.pk) : -1;
    const title = pkIndex >= 0 ? `${t.schema}.${t.name} — ${page.pk} = ${esc(row[pkIndex])}` : `${t.schema}.${t.name} — row`;
    const rowDeleted = pkIndex >= 0 && pendingMarks().deleted.has(String(row[pkIndex]));
    header.appendChild(el3("h3", null, title));
    const closeBtn = el3("button", "iconbtn", "✕");
    closeBtn.addEventListener("click", close);
    header.appendChild(closeBtn);
    sheet.appendChild(header);
    const body = el3("div", "sbody");
    for (const meta of page.columnMeta) {
      const i = page.columns.indexOf(meta.name);
      const value = row[i];
      const block = el3("div", "srow");
      const sh = el3("div", "sh");
      sh.appendChild(typeBadge(meta.type));
      sh.appendChild(el3("span", null, `${meta.name} — ${meta.type}${meta.pk ? " · PK" : ""}`));
      if (meta.name === page.pk)
        sh.appendChild(el3("span", "pk", "PK"));
      block.appendChild(sh);
      const sv = el3("div", `sv${value === null ? " null" : ""}`);
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
                if (isCurrentTableContext(t, connection))
                  editCellDialog(row, meta.name);
              } : undefined
            });
          });
        }
      }
      block.appendChild(sv);
      body.appendChild(block);
    }
    sheet.appendChild(body);
    const footer = el3("footer");
    const copy = el3("button", "btn", "Copy row");
    copy.addEventListener("click", async () => {
      const text = JSON.stringify(Object.fromEntries(page.columnMeta.map((m) => [m.name, row[page.columns.indexOf(m.name)]])));
      await host.writeClipboard(text).catch(() => toast("error", "Failed to copy."));
      toast("success", "Row copied.");
    });
    footer.appendChild(copy);
    if (page.pk && isPostgres() && !page.readOnly) {
      const edit = el3("button", "btn", "Edit…");
      edit.disabled = rowDeleted;
      if (rowDeleted)
        edit.title = "This row is marked for deletion.";
      edit.addEventListener("click", () => {
        close();
        if (!rowDeleted && isCurrentTableContext(t, connection))
          pickColumnDialog(row);
      });
      footer.appendChild(edit);
      const del = el3("button", "btn danger", "Delete row");
      del.addEventListener("click", async () => {
        close();
        if (isCurrentTableContext(t, connection))
          await deleteRowDialog(row);
      });
      footer.appendChild(del);
    }
    sheet.appendChild(footer);
    wrap.appendChild(sheet);
    wrap.addEventListener("mousedown", (event) => {
      if (event.target === wrap)
        close();
    });
    const onKey = (event) => {
      if (document.querySelector(".overlay"))
        return;
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
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
    if (!t || !page)
      return;
    dialog({
      title: "Edit column",
      build: (body, done) => {
        for (const meta of page.columnMeta) {
          if (meta.name === page.pk)
            continue;
          const b = el3("button", "btn");
          b.style.alignSelf = "flex-start";
          b.appendChild(typeBadge(meta.type));
          b.appendChild(document.createTextNode(` ${meta.name} — ${meta.type}`));
          b.addEventListener("click", () => {
            done(null);
            if (isCurrentTableContext(t, connection))
              editCellDialog(row, meta.name);
          });
          body.appendChild(b);
        }
      },
      actions: [{ label: "Cancel", value: null }]
    });
  }
  var SQL_TEMPLATES = [
    ["SELECT *", "select * from  limit 100"],
    ["COUNT", "select count(*) from "],
    ["JOIN", `select *
from  a
join  b on b. = a.
limit 100`],
    ["UPDATE", `update  set  = '' where
-- caution: omitting WHERE affects all rows`],
    ["INSERT", "insert into  () values ()"]
  ];
  function renderSql() {
    viewEl.innerHTML = "";
    const box = el3("div", "sqlbox");
    box.style.position = "relative";
    const chips = el3("div", "chips");
    for (const [label, tpl] of SQL_TEMPLATES) {
      const b = el3("button", null, label);
      b.title = "Insert template";
      b.addEventListener("click", () => insertTemplate(tpl));
      chips.appendChild(b);
    }
    const editor = el3("div", "editor");
    const pre = el3("pre", "sql-hl");
    const textarea = document.createElement("textarea");
    textarea.placeholder = `SELECT * FROM … LIMIT 10;

SELECT/WITH/EXPLAIN are read-only.
Other statements require confirmation.`;
    textarea.value = state.sql;
    textarea.spellcheck = false;
    const sync = () => {
      pre.innerHTML = highlightSql(textarea.value) + `
`;
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
      if (handleAutocompleteKey(event, textarea))
        return;
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        runSql();
      }
    });
    textarea.addEventListener("blur", () => setTimeout(closeAutocomplete, 150));
    editor.append(pre, textarea);
    sync();
    const bar = el3("div", "databar");
    const run = el3("button", "btn primary", "Run");
    run.title = "Ctrl/⌘+Enter";
    run.addEventListener("click", () => runSql());
    run.disabled = state.sqlBusy;
    const explain = el3("button", "btn", "Explain");
    explain.title = "EXPLAIN ANALYZE for a SELECT query";
    explain.disabled = state.sqlBusy;
    explain.addEventListener("click", () => runExplain());
    bar.append(run, explain, el3("span", "sqlmeta", state.sqlBusy ? "Running…" : "Ctrl/⌘+Enter"));
    box.append(bar, chips, editor);
    const result = el3("div");
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
    if (!textarea)
      return;
    const pos = textarea.selectionStart ?? textarea.value.length;
    textarea.value = textarea.value.slice(0, pos) + tpl + textarea.value.slice(textarea.selectionEnd ?? pos);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = pos + tpl.indexOf(" ") + 1;
    state.sql = textarea.value;
    textarea.dispatchEvent(new Event("input"));
  }
  var acBox = null;
  var acItems = [];
  var acSel = 0;
  function completionCandidates() {
    const tables = [];
    const columns = new Set;
    for (const schema of state.schemas) {
      for (const t of schema.tables) {
        tables.push({ name: t.name, kind: "table" });
        for (const c of t.columns)
          columns.add(c.name);
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
    if (word.length < 2)
      return closeAutocomplete();
    const q = word.toLowerCase();
    const { tables, columns, keywords } = completionCandidates();
    acItems = [
      ...tables.filter((t) => t.name.toLowerCase().startsWith(q)).slice(0, 6),
      ...columns.filter((c) => c.toLowerCase().startsWith(q)).slice(0, 6).map((name) => ({ name, kind: "column" })),
      ...keywords.filter((k) => k.name.toLowerCase().startsWith(q)).slice(0, 4)
    ].slice(0, 12);
    if (!acItems.length)
      return closeAutocomplete();
    acSel = 0;
    paintAutocomplete(textarea);
  }
  function paintAutocomplete(textarea) {
    if (acBox)
      acBox.remove();
    acBox = el3("div", "ac");
    acItems.forEach((item, i) => {
      const row = el3("div", `aci${i === acSel ? " sel" : ""}`);
      row.appendChild(el3("span", null, item.name));
      row.appendChild(el3("span", "k", item.kind));
      row.addEventListener("mousedown", (event) => {
        event.preventDefault();
        acceptAutocomplete(textarea, i);
      });
      acBox.appendChild(row);
    });
    const box = viewEl.querySelector(".sqlbox");
    const editor = viewEl.querySelector(".editor");
    if (!box || !editor)
      return;
    acBox.style.left = "10px";
    acBox.style.right = "10px";
    acBox.style.top = `${editor.offsetTop + editor.offsetHeight + 2}px`;
    box.appendChild(acBox);
  }
  function acceptAutocomplete(textarea, i) {
    const item = acItems[i];
    if (!item)
      return;
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
    if (!acBox)
      return false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      acSel = Math.min(acSel + 1, acItems.length - 1);
      paintAutocomplete(textarea);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      acSel = Math.max(acSel - 1, 0);
      paintAutocomplete(textarea);
      return true;
    }
    if (event.key === "Tab" || event.key === "Enter") {
      event.preventDefault();
      acceptAutocomplete(textarea, acSel);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeAutocomplete();
      return true;
    }
    return false;
  }
  function closeAutocomplete(keep) {
    if (acBox && !keep)
      acBox.remove();
    if (!keep)
      acBox = null;
  }
  function renderSqlResult() {
    renderStatusBar();
    const result = viewEl._result;
    if (!result)
      return;
    result.innerHTML = "";
    const r = state.sqlResult;
    if (!r)
      return;
    const meta = el3("div", "sqlmeta");
    meta.style.padding = "4px 10px";
    meta.textContent = r.command === "SELECT" || r.rows.length ? `${fmtInt(r.rowCount)} ${plural(r.rowCount, "row")} · ${r.ms} ms` : `Done: ${r.command || "OK"} · ${fmtInt(r.rowCount)} ${plural(r.rowCount, "row")} affected · ${r.ms} ms`;
    result.appendChild(meta);
    const isPlan = r.columns.length === 1 && /QUERY PLAN/i.test(r.columns[0]);
    const holder = el3("div");
    holder.style.cssText = "flex:1; min-height:0; display:flex; flex-direction:column;";
    result.appendChild(holder);
    if (isPlan) {
      const pre = el3("div", "textview");
      pre.textContent = r.rows.map((row) => row[0]).join(`
`);
      holder.appendChild(pre);
      return;
    }
    if (!r.columns.length)
      return;
    const bar = el3("div", "databar");
    bar.style.padding = "2px 10px 4px";
    bar.appendChild(seg(state.sqlViewMode, (v2) => {
      state.sqlViewMode = v2;
      renderSqlResult();
    }));
    const copy = el3("button", "iconbtn", "Copy");
    copy.title = "Copy result to clipboard (TSV)";
    copy.addEventListener("click", async () => {
      const lines = [r.columns.join("\t"), ...r.rows.map((row) => row.map((v2) => v2 === null ? NULL_TEXT : esc(v2)).join("\t"))];
      await host.writeClipboard(lines.join(`
`)).catch(() => toast("error", "Failed to copy."));
      toast("success", "Result copied.");
    });
    const dl = el3("button", "iconbtn", "⤓ CSV");
    dl.addEventListener("click", () => {
      const q = (v2) => {
        const s = v2 === null ? "" : String(v2);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      download("result.csv", [r.columns.map(q).join(","), ...r.rows.map((row) => row.map(q).join(","))].join(`
`), "text/csv");
    });
    bar.append(el3("span", "spacer"), copy, dl);
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
    if (!box)
      return;
    box.querySelector(".hist")?.remove();
    const hist = el3("div", "hist");
    hist.appendChild(el3("div", "hhead", "History"));
    if (!state.history.length)
      hist.appendChild(el3("div", "hhead", "empty"));
    for (const h of state.history.slice(0, 15)) {
      const item = el3("div", "hitem");
      item.appendChild(el3("span", "k" + (h.kind === "query" ? " ro" : ""), h.kind === "query" ? "R" : "W"));
      item.appendChild(el3("span", "hsql", h.sql.replace(/\s+/g, " ")));
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
    if (state.tab === "sql")
      return renderSql();
    if (state.mode === "data" && state.table) {
      return state.tableView === "structure" ? renderStructure() : renderData();
    }
    return renderWelcome();
  }
  async function loadConnections() {
    const data = await svc("GET", "/connections");
    state.conns = data.connections ?? [];
    if (!state.conns.some((c) => c.id === state.connId))
      state.connId = state.conns[0]?.id ?? null;
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
    if (!id || id === state.connId)
      return;
    if (!await leaveDataGuard())
      return;
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
    if (!state.connId)
      return;
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
      if (state.connId !== connection)
        return;
      state.schemas = data.schemas ?? [];
      state.treeReady = true;
      if (!state.expanded.size) {
        const preferred = state.schemas.find((s) => s.name === "public") ?? state.schemas[0];
        if (preferred)
          state.expanded.add(preferred.name);
      }
    } catch (error) {
      if (state.connId === connection)
        state.treeReady = true;
      throw error;
    }
  }
  async function loadPgVersion() {
    if (!state.connId || state.pgVersion || !isPostgres())
      return;
    const connection = state.connId;
    try {
      const data = await svc("POST", "/query", { body: { connection, sql: "show server_version", limit: 1 } });
      if (state.connId !== connection)
        return;
      state.pgVersion = data.rows?.[0]?.[0] ?? null;
      renderStatusBar();
    } catch {}
  }
  async function loadHistory() {
    try {
      const data = await svc("GET", "/history");
      state.history = data.items ?? [];
      renderHistory();
    } catch {}
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
    if (!await leaveDataGuard())
      return;
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
    if (state.table !== next)
      return;
    if (!next.page)
      await reloadTable(0);
  }
  async function closeTableTab(table) {
    const index = state.openTables.indexOf(table);
    if (index < 0)
      return;
    const current = state.table === table;
    if (current && !await leaveDataGuard())
      return;
    if (current)
      clearPending();
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
    if (!t || !state.openTables.includes(t))
      return false;
    if (!preservePending && state.table === t && pendingCount()) {
      if (!await leaveDataGuard())
        return false;
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
      limit: "100"
    };
    if (order) {
      query.order = order;
      if (previous && previous.order === order)
        query.desc = previous.desc ? "0" : "1";
      else
        query.desc = "0";
    } else if (previous) {
      query.order = previous.order;
      query.desc = previous.desc ? "1" : "0";
    }
    if (t.filter) {
      query.filterCol = t.filter.col;
      query.filterOp = t.filter.op;
      if (t.filter.val !== undefined && t.filter.val !== "")
        query.filterVal = t.filter.val;
    }
    let failure = null;
    t.loading = true;
    if (state.table === t && state.mode === "data")
      render();
    try {
      const page = await svc("GET", "/table", { query });
      if (t.requestId !== requestId || state.connId !== connection || !state.openTables.includes(t))
        return true;
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
      if (t.requestId !== requestId || state.connId !== connection || !state.openTables.includes(t))
        return true;
      t.loading = false;
      failure = error.message;
    }
    if (state.table === t && state.mode === "data") {
      render();
      if (failure)
        showBanner(failure);
    }
    return true;
  }
  async function runSql() {
    const sql = state.sql.trim();
    if (!sql || state.sqlBusy)
      return;
    const connection = state.connId;
    const table = state.table;
    const runId = ++state.sqlRunId;
    const readOnly = /^(select|with|explain|table|show|values)\b/i.test(sql);
    state.sqlBusy = true;
    if (viewEl._run)
      viewEl._run.disabled = true;
    if (viewEl._explain)
      viewEl._explain.disabled = true;
    try {
      if (!readOnly) {
        const ok = await confirmDialog(`Run this change?

${sql.slice(0, 200)}${sql.length > 200 ? "…" : ""}`);
        if (!ok || runId !== state.sqlRunId || connection !== state.connId)
          return;
      }
      const result = readOnly ? await svc("POST", "/query", { body: { connection, sql, limit: 200 } }) : await svc("POST", "/execute", { body: { connection, sql } });
      if (runId !== state.sqlRunId || connection !== state.connId)
        return;
      state.sqlResult = result;
      renderSqlResult();
      loadHistory();
      if (!readOnly && table && state.table === table && state.mode === "data") {
        await reloadTable(table.page?.offset ?? 0);
      }
    } catch (error) {
      if (runId !== state.sqlRunId || connection !== state.connId)
        return;
      state.sqlResult = null;
      showBanner(error.message);
      toast("error", error.message);
    } finally {
      if (runId === state.sqlRunId) {
        state.sqlBusy = false;
        if (viewEl._run)
          viewEl._run.disabled = false;
        if (viewEl._explain)
          viewEl._explain.disabled = false;
      }
    }
  }
  async function runExplain() {
    const sql = state.sql.trim().replace(/;+\s*$/, "");
    if (!sql || state.sqlBusy)
      return;
    if (!/^(select|with)\b/i.test(sql)) {
      toast("info", "Explain is available for SELECT queries.");
      return;
    }
    const connection = state.connId;
    const runId = ++state.sqlRunId;
    state.sqlBusy = true;
    if (viewEl._run)
      viewEl._run.disabled = true;
    if (viewEl._explain)
      viewEl._explain.disabled = true;
    try {
      const result = await svc("POST", "/query", {
        body: { connection, sql: `explain analyze ${sql}`, limit: 200 }
      });
      if (runId !== state.sqlRunId || connection !== state.connId)
        return;
      state.sqlResult = result;
      renderSqlResult();
    } catch (error) {
      if (runId !== state.sqlRunId || connection !== state.connId)
        return;
      state.sqlResult = null;
      showBanner(error.message);
      toast("error", error.message);
    } finally {
      if (runId === state.sqlRunId) {
        state.sqlBusy = false;
        if (viewEl._run)
          viewEl._run.disabled = false;
        if (viewEl._explain)
          viewEl._explain.disabled = false;
      }
    }
  }
  function localDateValue(date = new Date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  function localTimeValue(date = new Date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }
  function localOffsetValue() {
    const minutes = -new Date().getTimezoneOffset();
    const sign = minutes < 0 ? "-" : "+";
    const abs = Math.abs(minutes);
    return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  }
  function normalizeOffset(value) {
    if (!value || value === "Z")
      return "+00:00";
    const match = String(value).match(/^([+-])(\d{2}):?(\d{2})?$/);
    if (!match)
      return null;
    const hours = Number(match[2]);
    const minutes = Number(match[3] || 0);
    if (hours > 15 || minutes > 59)
      return null;
    return `${match[1]}${match[2]}:${match[3] || "00"}`;
  }
  function createPostgresValueEditor(column, value, { insert = false } = {}) {
    const type = String(column?.type || "text").toLowerCase();
    const kind = type === "uuid" ? "uuid" : type === "date" ? "date" : type.startsWith("timestamp") ? type.includes("with time zone") ? "timestamptz" : "timestamp" : type.startsWith("time") ? type.includes("with time zone") ? "timetz" : "time" : "text";
    const nullable = column?.nullable !== false;
    const generated = !!column?.generated;
    const databaseGenerated = generated || insert && column?.identity === "ALWAYS";
    const hasDefault = column?.defaultValue != null || !!column?.identity || generated;
    let mode = insert && hasDefault ? "default" : !insert && value === null ? "null" : "value";
    if (mode === "null" && !nullable)
      mode = "value";
    if (databaseGenerated)
      mode = "default";
    let busy = false;
    let draft = value === null || value === undefined ? "" : String(value);
    const root2 = el3("div", `typed-field${kind === "text" && (draft.length > 70 || draft.includes(`
`) || /json|text|xml|bytea|\[\]/.test(type)) ? " wide" : ""}`);
    const head = el3("div", "typed-field-head");
    head.appendChild(el3("span", "typed-field-name", column.name));
    head.appendChild(el3("span", "typed-field-type", column.type || "text"));
    if (!nullable)
      head.appendChild(el3("span", "typed-constraint", "NOT NULL"));
    if (column.pk)
      head.appendChild(el3("span", "typed-constraint", "PRIMARY KEY"));
    root2.appendChild(head);
    const modes = el3("div", "typed-modes");
    const modeButtons = new Map;
    const addMode = (id, label) => {
      const button2 = el3("button", mode === id ? "on" : "", label);
      button2.type = "button";
      button2.addEventListener("click", () => setMode(id));
      modeButtons.set(id, button2);
      modes.appendChild(button2);
    };
    if (!databaseGenerated)
      addMode("value", "Value");
    if (nullable && !databaseGenerated)
      addMode("null", "NULL");
    if (insert && hasDefault)
      addMode("default", "Default");
    root2.appendChild(modes);
    const row = el3("div", "typed-input-row");
    const longText = kind === "text" && (draft.length > 70 || draft.includes(`
`) || /json|text|xml|bytea|\[\]/.test(type));
    const input = longText ? el3("textarea") : el3("input");
    if (!longText)
      input.type = kind === "date" || kind === "time" || kind === "timetz" ? kind === "date" ? "date" : "time" : kind === "timestamp" || kind === "timestamptz" ? "datetime-local" : "text";
    if (["time", "timetz", "timestamp", "timestamptz"].includes(kind))
      input.step = "0.000001";
    input.setAttribute("aria-label", `${column.name} value`);
    if (kind === "uuid") {
      input.placeholder = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
      input.spellcheck = false;
    }
    let offsetInput = null;
    if (kind === "timestamptz") {
      const match = draft.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)(Z|[+-]\d{2}(?::?\d{2})?)?$/);
      input.value = match ? `${match[1]}T${match[2]}` : draft.replace(" ", "T");
      offsetInput = el3("input");
      offsetInput.type = "text";
      offsetInput.className = "tz-offset";
      offsetInput.style.cssText = "flex:0 0 76px;width:76px;text-align:center";
      offsetInput.title = "Explicit UTC offset";
      offsetInput.setAttribute("aria-label", "UTC offset");
      offsetInput.value = normalizeOffset(match?.[3]) || localOffsetValue();
    } else if (kind === "timestamp") {
      const match = draft.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)/);
      input.value = match ? `${match[1]}T${match[2]}` : draft.replace(" ", "T");
    } else if (kind === "timetz") {
      const match = draft.match(/^(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)(Z|[+-]\d{2}(?::?\d{2})?)?$/);
      input.value = match?.[1] || draft;
      offsetInput = el3("input");
      offsetInput.type = "text";
      offsetInput.style.cssText = "flex:0 0 76px;width:76px;text-align:center";
      offsetInput.title = "Explicit UTC offset";
      offsetInput.setAttribute("aria-label", "UTC offset");
      offsetInput.value = normalizeOffset(match?.[2]) || localOffsetValue();
    } else {
      input.value = draft;
    }
    row.appendChild(input);
    if (offsetInput)
      row.appendChild(offsetInput);
    root2.appendChild(row);
    const tools = el3("div", "typed-tools");
    const toolButtons = [];
    const addTool = (label, onClick) => {
      const button2 = el3("button", "iconbtn", label);
      button2.type = "button";
      button2.addEventListener("click", onClick);
      toolButtons.push(button2);
      tools.appendChild(button2);
      return button2;
    };
    if (kind === "uuid") {
      addTool("Generate UUID", () => {
        if (mode !== "value" || busy)
          return;
        input.value = crypto.randomUUID();
        input.dispatchEvent(new Event("input"));
      });
      addTool("Copy", async () => {
        if (!input.value)
          return;
        await host.writeClipboard(input.value).catch(() => toast("error", "Failed to copy."));
        toast("success", "UUID copied.");
      });
    } else if (kind === "date") {
      addTool("Today", () => {
        input.value = localDateValue();
        input.dispatchEvent(new Event("input"));
      });
    } else if (["time", "timetz", "timestamp", "timestamptz"].includes(kind)) {
      addTool("Now", () => {
        const now = new Date;
        const date = localDateValue(now);
        const time = localTimeValue(now);
        input.value = kind === "time" || kind === "timetz" ? time : `${date}T${time}`;
        if (offsetInput)
          offsetInput.value = localOffsetValue();
        input.dispatchEvent(new Event("input"));
      });
    }
    if (tools.childElementCount)
      root2.appendChild(tools);
    const preview = el3("div", "typed-preview");
    const error = el3("div", "typed-error");
    error.setAttribute("role", "alert");
    root2.append(preview, error);
    if (insert && hasDefault) {
      const detail = databaseGenerated ? "Generated by PostgreSQL; this column is omitted from INSERT." : `Database default: ${column.defaultValue || `${column.identity} identity`}`;
      root2.appendChild(el3("div", "typed-note", detail));
    } else if (kind === "timestamptz" || kind === "timetz") {
      root2.appendChild(el3("div", "typed-note", "The entered clock time and explicit offset are sent without timezone conversion."));
    } else if (kind === "timestamp") {
      root2.appendChild(el3("div", "typed-note", "Timestamp without time zone is sent exactly as entered."));
    }
    const storedValue = () => {
      if (kind === "timestamptz")
        return `${input.value.replace("T", " ")}${normalizeOffset(offsetInput.value) || offsetInput.value}`;
      if (kind === "timetz")
        return `${input.value}${normalizeOffset(offsetInput.value) || offsetInput.value}`;
      if (kind === "timestamp")
        return input.value.replace("T", " ");
      return input.value;
    };
    const update = () => {
      if (mode === "value")
        draft = input.value;
      preview.innerHTML = "";
      const label = mode === "null" ? "NULL" : mode === "default" ? "DEFAULT" : storedValue() || "(empty string)";
      preview.append(document.createTextNode(mode === "value" ? "Stored value: " : insert ? "Insert mode: " : "Edit mode: "), el3("strong", null, label));
      error.textContent = "";
      for (const button2 of toolButtons)
        button2.disabled = busy || mode !== "value";
    };
    function setMode(next, restoreDraft = true) {
      if (busy || !modeButtons.has(next))
        return;
      if (mode === "value" && next !== "value")
        draft = input.value;
      mode = next;
      if (mode === "value" && restoreDraft)
        input.value = draft;
      for (const [id, button2] of modeButtons)
        button2.classList.toggle("on", id === mode);
      const disabled = busy || mode !== "value";
      input.disabled = disabled;
      if (offsetInput)
        offsetInput.disabled = disabled;
      update();
    }
    input.addEventListener("input", update);
    offsetInput?.addEventListener("input", update);
    setMode(mode, false);
    return {
      root: root2,
      focus: () => {
        if (mode === "value")
          setTimeout(() => input.focus(), 30);
      },
      setBusy(value2) {
        busy = value2;
        for (const button2 of modeButtons.values())
          button2.disabled = busy;
        input.disabled = busy || mode !== "value";
        if (offsetInput)
          offsetInput.disabled = busy || mode !== "value";
        update();
      },
      read: () => ({ mode, value: mode === "value" ? storedValue() : null }),
      validate() {
        let message = "";
        if (mode === "null" && !nullable)
          message = `${column.name} is NOT NULL.`;
        else if (mode === "value" && kind !== "text" && !input.value.trim())
          message = `Enter ${kind === "uuid" ? "a UUID" : `a ${column.type}`} or choose ${insert && hasDefault ? "Default" : nullable ? "NULL" : "another value"}.`;
        else if (mode === "value" && kind === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.value.trim()))
          message = "Enter a valid UUID or generate one.";
        else if (mode === "value" && offsetInput && !normalizeOffset(offsetInput.value))
          message = "Use an explicit UTC offset from -15:00 to +15:00, for example +03:00.";
        error.textContent = message;
        if (message)
          input.focus();
        return !message;
      }
    };
  }
  function editCellDialog(row, col) {
    const t = state.table;
    const connection = state.connId;
    const page = t?.page;
    if (!t || !page)
      return;
    const colIndex = page.columns.indexOf(col);
    const current = row[colIndex];
    const meta = page.columnMeta.find((c) => c.name === col) || { name: col, type: "text", nullable: true };
    if (meta.generated || meta.identity === "ALWAYS") {
      toast("info", `${col} is generated by PostgreSQL and cannot be edited directly.`);
      return;
    }
    const pkIndex = page.columns.indexOf(page.pk);
    const pkVal = row[pkIndex];
    const editor = createPostgresValueEditor(meta, current);
    dialog({
      title: `Edit ${t.schema}.${t.name}.${col}`,
      className: "typed-dialog",
      build: (body) => {
        body.appendChild(editor.root);
        body.appendChild(el3("div", "typed-note", "The change is staged locally. Review it with Apply before anything is written to PostgreSQL. ⌘/Ctrl+Enter stages the change."));
        editor.focus();
      },
      actions: [
        { label: "Cancel", value: null },
        {
          label: "Stage change",
          kind: "primary",
          shortcut: true,
          onClick: (done) => {
            if (!isCurrentTableContext(t, connection)) {
              done(null);
              return;
            }
            if (!editor.validate())
              return false;
            const next = editor.read();
            const newValue = next.mode === "null" ? null : next.value;
            if (next.mode === "null" && current === null || next.mode !== "null" && newValue === esc(current)) {
              done(null);
              return;
            }
            if (!stageEdit(pkVal, col, current === null ? null : esc(current), newValue, next.mode === "null")) {
              done(null);
              toast("info", "This row is marked for deletion. The change was not staged.");
              return;
            }
            toast("info", `Change staged. Pending changes: ${pendingCount()}. Click “Apply”.`);
            done(true);
            render();
          }
        }
      ]
    });
  }
  function insertDialog() {
    const t = state.table;
    const page = t.page;
    const connection = state.connId;
    let formBody;
    let inserting = false;
    const editors = [];
    dialog({
      title: `New row: ${t.schema}.${t.name}`,
      className: "typed-dialog",
      isBusy: () => inserting,
      build: (body) => {
        formBody = body;
        const grid = el3("div", "typed-form-grid");
        for (const column of page.columnMeta) {
          const editor = createPostgresValueEditor(column, "", { insert: true });
          editors.push({ column, editor });
          grid.appendChild(editor.root);
        }
        body.appendChild(grid);
        body.appendChild(el3("div", "typed-note", "Value, NULL and Default are explicit. Default omits the column from INSERT; an empty Value remains an empty string. ⌘/Ctrl+Enter inserts the row."));
      },
      actions: [
        { label: "Cancel", value: null },
        {
          label: "Insert",
          kind: "primary",
          shortcut: true,
          onClick: async (done) => {
            if (inserting || !isCurrentTableContext(t, connection))
              return false;
            for (const { editor } of editors)
              if (!editor.validate())
                return false;
            const values = {};
            for (const { column, editor } of editors) {
              const next = editor.read();
              if (next.mode !== "default")
                values[column.name] = next.mode === "null" ? null : next.value;
            }
            inserting = true;
            const buttons = [...formBody.parentElement.querySelectorAll(".acts button")];
            buttons.forEach((button2) => {
              button2.disabled = true;
            });
            editors.forEach(({ editor }) => editor.setBusy(true));
            try {
              const data = await svc("POST", "/row", {
                body: { connection, schema: t.schema, table: t.name, values }
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
              buttons.forEach((button2) => {
                button2.disabled = false;
              });
              editors.forEach(({ editor }) => editor.setBusy(false));
              toast("error", error.message);
              return false;
            }
          }
        }
      ]
    });
  }
  async function deleteRowDialog(row) {
    const t = state.table;
    const connection = state.connId;
    const page = t?.page;
    if (!t || !page)
      return;
    const pkIndex = page.columns.indexOf(page.pk);
    const pkVal = esc(row[pkIndex]);
    const already = [...state.pending.values()].some((v2) => v2.op === "delete" && v2.pkVal === pkVal);
    const ok = await confirmDialog(already ? `Undo deletion of row ${page.pk} = ${pkVal}?` : `Delete row ${page.pk} = ${pkVal} from ${t.schema}.${t.name}?

The deletion will be staged and applied when you click “Apply”.`, { yes: already ? "Undo deletion" : "Delete" });
    if (!ok || !isCurrentTableContext(t, connection))
      return;
    if (already) {
      state.pending.delete(`${SEP}del${SEP}${pkVal}`);
    } else {
      stageDelete(pkVal);
      toast("info", `Deletion staged. Pending changes: ${pendingCount()}.`);
    }
    render();
  }
  var MONGO_FORBIDDEN_FIELDS = new Set(["__proto__", "prototype", "constructor"]);
  var hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  function hasMongoSnapshots(page) {
    return !!page && Array.isArray(page.rows) && Array.isArray(page.columns) && Array.isArray(page.documents) && Array.isArray(page.present) && page.documents.length === page.rows.length && page.present.length === page.rows.length && page.rows.every((row, index) => Array.isArray(row) && row.length === page.columns.length && typeof page.documents[index] === "string" && Array.isArray(page.present[index]) && page.present[index].length === page.columns.length);
  }
  function decimalNumberParts(source) {
    const match = String(source).match(/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
    if (!match)
      return null;
    let digits = `${match[2]}${match[3] ?? ""}`.replace(/^0+/, "");
    let exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
    if (!Number.isSafeInteger(exponent))
      return null;
    while (digits.endsWith("0")) {
      digits = digits.slice(0, -1);
      exponent += 1;
    }
    return { negative: match[1] === "-" && digits.length > 0, digits: digits || "0", exponent };
  }
  function sameDecimalNumber(left, right) {
    const a = decimalNumberParts(left);
    const b = decimalNumberParts(right);
    return !!a && !!b && a.negative === b.negative && a.digits === b.digits && a.exponent === b.exponent;
  }
  function assertMongoNumberPrecision(source) {
    const tokens = /("(?:\\.|[^"\\])*")|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    let match;
    while ((match = tokens.exec(source)) !== null) {
      if (!match[2])
        continue;
      const numeric = Number(match[2]);
      if (!Number.isFinite(numeric))
        throw new Error(`Number ${match[2]} is outside the finite double range. Use an explicit canonical BSON number wrapper.`);
      const significand = match[2].split(/[eE]/)[0];
      if (numeric === 0 && match[2].startsWith("-") && !/[1-9]/.test(significand))
        throw new Error("Use a canonical $numberDouble wrapper to preserve negative zero explicitly.");
      if (numeric === 0 && /[1-9]/.test(significand))
        throw new Error(`Number ${match[2]} underflows to zero. Use a canonical $numberDecimal wrapper to preserve it.`);
      if (Number.isInteger(numeric) && !Number.isSafeInteger(numeric)) {
        const wrapper = /[.eE]/.test(match[2]) ? "$numberDouble or $numberDecimal" : "$numberLong";
        throw new Error(`Integer ${match[2]} is outside the safe JavaScript range. Use a canonical ${wrapper} wrapper to preserve it explicitly.`);
      }
      if (numeric === 0)
        continue;
      if (!sameDecimalNumber(match[2], JSON.stringify(numeric))) {
        throw new Error(`Number ${match[2]} loses precision in a JavaScript round trip. Use canonical $numberDecimal for an exact decimal or $numberDouble for an explicit double.`);
      }
    }
  }
  function parseMongoJson(text, label = "MongoDB Extended JSON") {
    if (typeof text !== "string" || !text.trim())
      throw new Error(`${label} is required.`);
    let value;
    try {
      value = JSON.parse(text);
    } catch (error) {
      throw new Error(`${label} is not valid JSON: ${error.message}`);
    }
    assertMongoNumberPrecision(text);
    return value;
  }
  function parseMongoDocument(text, label = "MongoDB document") {
    const value = parseMongoJson(text, label);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`${label} must be a JSON object.`);
    return value;
  }
  function validateMongoFieldName(name) {
    if (typeof name !== "string" || !name || name.startsWith("$") || name.includes(".") || name.includes("\x00") || MONGO_FORBIDDEN_FIELDS.has(name)) {
      throw new Error("Field names must be nonempty and cannot start with $, contain dots or NUL, or use __proto__, prototype, or constructor.");
    }
    return name;
  }
  function validateMongoDocument(document2) {
    for (const name of Object.keys(document2))
      validateMongoFieldName(name);
    return document2;
  }
  function mongoDocumentAt(page, rowIndex) {
    if (!hasMongoSnapshots(page) || !page.rows[rowIndex])
      throw new Error("The canonical MongoDB document snapshot is unavailable. Reload the collection.");
    return parseMongoDocument(page.documents[rowIndex], "The original MongoDB document");
  }
  function mongoRowIdentity(page, rowIndex) {
    try {
      const document2 = mongoDocumentAt(page, rowIndex);
      return hasOwn(document2, "_id") ? JSON.stringify(document2._id) : null;
    } catch {
      return null;
    }
  }
  function requireMongoIdentity(page, rowIndex) {
    const document2 = mongoDocumentAt(page, rowIndex);
    if (!hasOwn(document2, "_id"))
      throw new Error("The original MongoDB document has no _id and cannot be edited safely.");
    return JSON.stringify(document2._id);
  }
  var mongoPendingKey = (id) => `${SEP}mongo${SEP}${id}`;
  function mongoPendingOperation(t, id) {
    if (!t || state.pendingFor !== pendingKeyFor(t))
      return null;
    return state.pending.get(mongoPendingKey(id)) ?? null;
  }
  function mongoDisplayValue(value) {
    if (value === null)
      return null;
    if (typeof value === "string")
      return value;
    if (typeof value === "object")
      return JSON.stringify(value);
    return String(value);
  }
  function mongoDocumentWithPending(page, rowIndex, operation) {
    const original = mongoDocumentAt(page, rowIndex);
    if (!operation)
      return original;
    if (operation.op === "mongo-replace")
      return parseMongoDocument(operation.document, "The pending MongoDB document");
    if (operation.op !== "mongo-update")
      return original;
    const pairs = Object.entries(original).filter(([name]) => !operation.changes.has(name) || operation.changes.get(name).mode !== "missing");
    for (const [name, change] of operation.changes) {
      if (change.mode === "missing")
        continue;
      const value = change.mode === "null" ? null : parseMongoJson(change.value, `Pending field ${name}`);
      const index = pairs.findIndex(([field3]) => field3 === name);
      if (index >= 0)
        pairs[index] = [name, value];
      else
        pairs.push([name, value]);
    }
    return Object.fromEntries(pairs);
  }
  function mongoCurrentDocument(page, rowIndex) {
    const id = requireMongoIdentity(page, rowIndex);
    return mongoDocumentWithPending(page, rowIndex, mongoPendingOperation(state.table, id));
  }
  function mongoFieldSnapshot(page, rowIndex, name) {
    const columnIndex = page.columns.indexOf(name);
    const id = requireMongoIdentity(page, rowIndex);
    const operation = mongoPendingOperation(state.table, id);
    const document2 = mongoDocumentWithPending(page, rowIndex, operation);
    let present;
    if (operation?.op === "mongo-replace")
      present = hasOwn(document2, name);
    else if (operation?.op === "mongo-update" && operation.changes.has(name))
      present = operation.changes.get(name).mode !== "missing";
    else
      present = columnIndex >= 0 && page.present[rowIndex]?.[columnIndex] === true;
    return { present, value: present ? document2[name] : undefined };
  }
  function mongoViewModel(page) {
    const rows = page.rows.map((row) => [...row]);
    const present = page.present.map((row) => [...row]);
    if (state.pendingFor !== pendingKeyFor(state.table))
      return { rows, present };
    page.rows.forEach((row, rowIndex) => {
      const id = mongoRowIdentity(page, rowIndex);
      if (!id)
        return;
      const operation = mongoPendingOperation(state.table, id);
      if (!operation || operation.op === "mongo-delete")
        return;
      const document2 = mongoDocumentWithPending(page, rowIndex, operation);
      page.columns.forEach((name, columnIndex) => {
        present[rowIndex][columnIndex] = hasOwn(document2, name);
        rows[rowIndex][columnIndex] = present[rowIndex][columnIndex] ? mongoDisplayValue(document2[name]) : null;
      });
    });
    return { rows, present };
  }
  function mongoTypeOf(value) {
    if (value === null)
      return "null";
    if (Array.isArray(value))
      return "array";
    if (typeof value === "object") {
      if (hasOwn(value, "$oid"))
        return "objectid";
      if (hasOwn(value, "$date"))
        return "date";
      if (hasOwn(value, "$numberDecimal"))
        return "decimal128";
      if (hasOwn(value, "$numberLong"))
        return "long";
      return "json";
    }
    return typeof value;
  }
  function mongoExample(type, name) {
    if (name === "_id")
      return `{"$oid":"64b64c2f0e6a4b8f9c0d1e2f"}`;
    if (type === "objectid")
      return `{"$oid":"64b64c2f0e6a4b8f9c0d1e2f"}`;
    if (type === "date")
      return `{"$date":"2026-01-01T00:00:00.000Z"}`;
    if (type === "decimal128")
      return `{"$numberDecimal":"12500.50"}`;
    if (type === "double" || type === "number")
      return `42.5 or {"$numberDouble":"42.5"}`;
    if (/^(int|long|int32|int64)/.test(type))
      return `42 or {"$numberLong":"9007199254740993"}`;
    if (type === "boolean")
      return "true";
    if (type === "array")
      return `[1,"two",true]`;
    if (type === "json")
      return `{"key":"value"}`;
    return `"text"`;
  }
  function createMongoValueEditor({ name, type, value, present = true, immutable = false, allowObjectId = false }) {
    let mode = immutable || present && value !== null ? "value" : present ? "null" : "missing";
    let draft = present ? JSON.stringify(value) : '""';
    let busy = false;
    const root2 = el3("div", "typed-field wide");
    const head = el3("div", "typed-field-head");
    head.appendChild(el3("span", "typed-field-name", name));
    head.appendChild(el3("span", "typed-field-type", type || mongoTypeOf(value)));
    if (name === "_id")
      head.appendChild(el3("span", "typed-constraint", immutable ? "IMMUTABLE" : "OPTIONAL"));
    root2.appendChild(head);
    const modes = el3("div", "typed-modes");
    const modeButtons = new Map;
    const addMode = (id, label) => {
      const button2 = el3("button", mode === id ? "on" : "", label);
      button2.type = "button";
      button2.addEventListener("click", () => setMode(id));
      modeButtons.set(id, button2);
      modes.appendChild(button2);
    };
    if (!immutable) {
      addMode("value", "Value");
      addMode("null", "NULL");
      addMode("missing", "Missing");
      root2.appendChild(modes);
    }
    const row = el3("div", "typed-input-row");
    const input = el3("textarea");
    input.value = draft;
    input.placeholder = mongoExample(type, name);
    input.spellcheck = false;
    input.setAttribute("aria-label", `${name} canonical Extended JSON value`);
    row.appendChild(input);
    root2.appendChild(row);
    const tools = el3("div", "typed-tools");
    if (allowObjectId) {
      const generate = el3("button", "iconbtn", "Generate ObjectId");
      generate.type = "button";
      generate.addEventListener("click", () => {
        if (busy || immutable)
          return;
        const bytes = new Uint8Array(12);
        crypto.getRandomValues(bytes);
        const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
        setMode("value");
        input.value = JSON.stringify({ $oid: hex });
        draft = input.value;
        update();
      });
      tools.appendChild(generate);
      root2.appendChild(tools);
    }
    const preview = el3("div", "typed-preview");
    const error = el3("div", "typed-error");
    error.setAttribute("role", "alert");
    root2.append(preview, error);
    root2.appendChild(el3("div", "typed-note", immutable ? "The original canonical _id is preserved and cannot be changed." : "Value accepts canonical Extended JSON, including quoted strings. NULL stores null; Missing removes/omits this top-level field."));
    const update = () => {
      if (mode === "value" && !input.disabled)
        draft = input.value;
      preview.innerHTML = "";
      const valueLabel = mode === "null" ? "explicit null" : mode === "missing" ? "missing / unset" : draft || "(empty input is invalid)";
      preview.append(document.createTextNode("Field state: "), el3("strong", null, valueLabel));
      error.textContent = "";
    };
    function setMode(next) {
      if (busy || immutable || !modeButtons.has(next))
        return;
      if (mode === "value")
        draft = input.value;
      mode = next;
      if (mode === "value")
        input.value = draft;
      for (const [id, button2] of modeButtons)
        button2.classList.toggle("on", id === mode);
      input.disabled = mode !== "value";
      update();
    }
    input.addEventListener("input", update);
    setMode(mode);
    if (immutable)
      input.disabled = true;
    update();
    return {
      root: root2,
      focus: () => {
        if (mode === "value")
          setTimeout(() => input.focus(), 30);
      },
      setBusy(value2) {
        busy = value2;
        for (const button2 of modeButtons.values())
          button2.disabled = busy;
        for (const button2 of tools.children)
          button2.disabled = busy;
        input.disabled = busy || immutable || mode !== "value";
      },
      read: () => ({
        mode,
        value: mode === "value" ? JSON.stringify(parseMongoJson(input.value, `${name} value`)) : null
      }),
      validate() {
        error.textContent = "";
        if (mode !== "value")
          return true;
        try {
          parseMongoJson(input.value, `${name} value`);
          return true;
        } catch (validationError) {
          error.textContent = validationError.message;
          input.focus();
          return false;
        }
      }
    };
  }
  function stageMongoCell(page, rowIndex, name, next) {
    if (!ensurePendingScope())
      return false;
    const id = requireMongoIdentity(page, rowIndex);
    validateMongoFieldName(name);
    if (name === "_id")
      throw new Error("MongoDB _id is immutable.");
    const key = mongoPendingKey(id);
    const originalText = page.documents[rowIndex];
    const originalDocument = parseMongoDocument(originalText);
    let operation = state.pending.get(key);
    if (operation?.op === "mongo-delete")
      return false;
    if (operation?.op === "mongo-replace") {
      const replacement = parseMongoDocument(operation.document);
      const pairs = Object.entries(replacement).filter(([field3]) => field3 !== name);
      if (next.mode !== "missing")
        pairs.push([name, next.mode === "null" ? null : parseMongoJson(next.value)]);
      const canonical = JSON.stringify(Object.fromEntries(pairs));
      if (canonical === JSON.stringify(originalDocument))
        state.pending.delete(key);
      else
        operation.document = canonical;
      return true;
    }
    if (!operation) {
      operation = {
        op: "mongo-update",
        pkVal: id,
        original: originalText,
        present: [...page.present[rowIndex]],
        changes: new Map
      };
      state.pending.set(key, operation);
    }
    const columnIndex = page.columns.indexOf(name);
    const oldPresent = columnIndex >= 0 && operation.present[columnIndex] === true;
    const oldValue = oldPresent ? JSON.stringify(originalDocument[name]) : null;
    const unchanged = next.mode === "missing" ? !oldPresent : next.mode === "null" ? oldPresent && oldValue === "null" : oldPresent && next.value === oldValue;
    if (unchanged)
      operation.changes.delete(name);
    else
      operation.changes.set(name, { mode: next.mode, value: next.value, oldPresent, oldValue });
    if (!operation.changes.size)
      state.pending.delete(key);
    if (!state.pending.size)
      state.pendingFor = null;
    return true;
  }
  function editMongoCellDialog(rowIndex, col) {
    const t = state.table;
    const connection = state.connId;
    const page = t?.page;
    if (!t || !page || currentKind() !== "mongodb")
      return;
    let current;
    let id;
    try {
      current = mongoFieldSnapshot(page, rowIndex, col);
      id = requireMongoIdentity(page, rowIndex);
    } catch (error) {
      toast("error", error.message);
      return;
    }
    if (mongoPendingOperation(t, id)?.op === "mongo-delete") {
      toast("info", "This document is marked for deletion. Undo the deletion before editing it.");
      return;
    }
    const meta = page.columnMeta.find((item) => item.name === col) || { name: col, type: mongoTypeOf(current.value) };
    const editor = createMongoValueEditor({ name: col, type: meta.type, ...current });
    let dialogError;
    dialog({
      title: `Edit ${t.schema}.${t.name}.${col}`,
      className: "typed-dialog",
      build: (body) => {
        body.appendChild(editor.root);
        body.appendChild(el3("div", "typed-note", "The canonical field change is staged locally. Apply writes this document with its original snapshot; other documents are not part of a transaction. ⌘/Ctrl+Enter stages the change."));
        dialogError = el3("div", "typed-error");
        dialogError.setAttribute("role", "alert");
        body.appendChild(dialogError);
        editor.focus();
      },
      actions: [
        { label: "Cancel", value: null },
        {
          label: "Stage change",
          kind: "primary",
          shortcut: true,
          onClick: (done) => {
            if (!isCurrentTableContext(t, connection) || t.page !== page) {
              dialogError.textContent = "The collection snapshot changed. Close this editor and reload before editing.";
              return false;
            }
            if (!editor.validate())
              return false;
            try {
              const next = editor.read();
              const unchanged = next.mode === "missing" ? !current.present : next.mode === "null" ? current.present && current.value === null : current.present && next.value === JSON.stringify(current.value);
              if (unchanged) {
                done(null);
                return;
              }
              if (!stageMongoCell(page, rowIndex, col, next)) {
                dialogError.textContent = "This document is marked for deletion. The change was not staged.";
                return false;
              }
              toast("info", `Document change staged. Pending documents: ${pendingCount()}. Click “Apply”.`);
              done(true);
              render();
            } catch (error) {
              dialogError.textContent = error.message;
              return false;
            }
          }
        }
      ]
    });
  }
  function stageMongoReplacement(page, rowIndex, document2) {
    if (!ensurePendingScope())
      return false;
    const id = requireMongoIdentity(page, rowIndex);
    const original = page.documents[rowIndex];
    const key = mongoPendingKey(id);
    if (state.pending.get(key)?.op === "mongo-delete")
      return false;
    const canonical = JSON.stringify(document2);
    if (canonical === JSON.stringify(parseMongoDocument(original))) {
      state.pending.delete(key);
      if (!state.pending.size)
        state.pendingFor = null;
    } else {
      state.pending.set(key, { op: "mongo-replace", pkVal: id, original, document: canonical });
    }
    return true;
  }
  function mongoDocumentDialog({ table: t, connection, rowIndex = null, insert = false }) {
    const page = t?.page;
    if (!t || !page || !insert && rowIndex === null)
      return;
    let originalId = null;
    let initial;
    try {
      if (insert)
        initial = {};
      else {
        originalId = requireMongoIdentity(page, rowIndex);
        if (mongoPendingOperation(t, originalId)?.op === "mongo-delete") {
          toast("info", "This document is marked for deletion. Undo the deletion before editing it.");
          return;
        }
        initial = mongoCurrentDocument(page, rowIndex);
      }
    } catch (error) {
      toast("error", error.message);
      return;
    }
    let activeTab = "form";
    let busy = false;
    let bodyRef;
    let errorRef;
    let content;
    let editors = [];
    let jsonInput;
    let jsonText = JSON.stringify(initial, null, 2);
    const tabButtons = new Map;
    const readForm = () => {
      const pairs = [];
      for (const { name, editor } of editors) {
        if (!editor.validate())
          throw new Error(`Correct ${name} before continuing.`);
        const next = editor.read();
        if (next.mode === "missing")
          continue;
        pairs.push([name, next.mode === "null" ? null : parseMongoJson(next.value, `${name} value`)]);
      }
      return validateMongoDocument(Object.fromEntries(pairs));
    };
    const readJson = () => validateMongoDocument(parseMongoDocument(jsonInput.value, "The MongoDB document"));
    function buildForm(document2) {
      content.innerHTML = "";
      editors = [];
      const fields = el3("div", "document-fields");
      const entries = Object.entries(document2);
      entries.sort(([left], [right]) => left === "_id" ? -1 : right === "_id" ? 1 : 0);
      if (insert && !entries.some(([name2]) => name2 === "_id"))
        entries.unshift(["_id", undefined]);
      for (const [name2, value] of entries) {
        const present = value !== undefined || hasOwn(document2, name2);
        const metaType = page.columnMeta.find((item) => item.name === name2)?.type;
        const editor = createMongoValueEditor({
          name: name2,
          type: metaType || mongoTypeOf(value),
          value,
          present,
          immutable: !insert && name2 === "_id",
          allowObjectId: insert && name2 === "_id"
        });
        editors.push({ name: name2, editor });
        fields.appendChild(editor.root);
      }
      content.appendChild(fields);
      const addRow = el3("div", "document-new-field");
      const name = el3("input");
      name.type = "text";
      name.placeholder = "newTopLevelField";
      const label = el3("label", "fld", "Add top-level field");
      label.appendChild(name);
      const add = el3("button", "btn", "Add field");
      add.addEventListener("click", () => {
        try {
          const fieldName = validateMongoFieldName(name.value);
          if (editors.some((editor) => editor.name === fieldName))
            throw new Error(`${fieldName} is already listed. Choose Value in its existing row.`);
          const next = readForm();
          next[fieldName] = "";
          buildForm(next);
        } catch (error) {
          errorRef.textContent = error.message;
        }
      });
      addRow.append(label, add);
      content.appendChild(addRow);
      content.appendChild(el3("div", "typed-note", insert ? "Form mode edits top-level fields only; nested values remain canonical Extended JSON. _id is optional. MongoDB generates it unless you explicitly enter one or choose Generate ObjectId." : "Form mode edits top-level fields with Value, NULL and Missing. Use JSON for nested restructuring or field renaming. Saving stages a full-document replacement."));
    }
    function paintTabs() {
      for (const [name, button2] of tabButtons) {
        button2.classList.toggle("on", name === activeTab);
        button2.setAttribute("aria-selected", name === activeTab ? "true" : "false");
      }
    }
    function showTab(next) {
      if (busy || next === activeTab)
        return;
      try {
        if (activeTab === "form") {
          const document2 = readForm();
          jsonText = JSON.stringify(document2, null, 2);
        } else {
          initial = readJson();
        }
        activeTab = next;
        errorRef.textContent = "";
        if (activeTab === "json") {
          content.innerHTML = "";
          jsonInput = el3("textarea", "document-json");
          jsonInput.value = jsonText;
          jsonInput.spellcheck = false;
          jsonInput.setAttribute("aria-label", "Complete canonical Extended JSON document");
          jsonInput.addEventListener("input", () => {
            jsonText = jsonInput.value;
          });
          content.appendChild(jsonInput);
          content.appendChild(el3("div", "typed-note", 'Complete canonical Extended JSON document. Examples: {"$oid":"…"}, {"$date":"2026-01-01T00:00:00.000Z"}, {"$numberLong":"9007199254740993"}.'));
        } else {
          buildForm(initial);
        }
        paintTabs();
      } catch (error) {
        errorRef.textContent = error.message;
      }
    }
    dialog({
      title: `${insert ? "New document" : "Edit document"}: ${t.schema}.${t.name}`,
      className: "typed-dialog document-dialog",
      isBusy: () => busy,
      build: (body) => {
        bodyRef = body;
        const tabs = el3("div", "document-tabs");
        tabs.setAttribute("role", "tablist");
        for (const [id, label] of [["form", "Form"], ["json", "JSON"]]) {
          const button2 = el3("button", id === activeTab ? "on" : "", label);
          button2.type = "button";
          button2.setAttribute("role", "tab");
          button2.addEventListener("click", () => showTab(id));
          tabButtons.set(id, button2);
          tabs.appendChild(button2);
        }
        body.appendChild(tabs);
        content = el3("div");
        body.appendChild(content);
        errorRef = el3("div", "typed-error");
        errorRef.setAttribute("role", "alert");
        body.appendChild(errorRef);
        body.appendChild(el3("div", "typed-note", `${insert ? "Insert writes only this document." : "Review and Apply writes this replacement with an exact-original conflict check."} ⌘/Ctrl+Enter ${insert ? "inserts" : "stages"} the document.`));
        buildForm(initial);
      },
      actions: [
        { label: "Cancel", value: null },
        {
          label: insert ? "Insert document" : "Stage replacement",
          kind: "primary",
          shortcut: true,
          onClick: async (done) => {
            if (busy)
              return false;
            if (!isCurrentTableContext(t, connection) || t.page !== page) {
              errorRef.textContent = "The collection context or snapshot changed. Close this editor and reload before continuing.";
              return false;
            }
            let document2;
            try {
              document2 = activeTab === "form" ? readForm() : readJson();
              if (!insert) {
                if (!hasOwn(document2, "_id") || JSON.stringify(document2._id) !== originalId)
                  throw new Error("The replacement must preserve the original canonical _id.");
                if (!stageMongoReplacement(page, rowIndex, document2))
                  throw new Error("This document is marked for deletion. Undo the deletion first.");
              }
            } catch (error) {
              errorRef.textContent = error.message;
              return false;
            }
            if (!insert) {
              toast("info", `Document replacement staged. Pending documents: ${pendingCount()}. Click “Apply”.`);
              done(true);
              render();
              return;
            }
            busy = true;
            errorRef.textContent = "";
            editors.forEach(({ editor }) => editor.setBusy(true));
            const controls = [...bodyRef.parentElement.querySelectorAll("button, input, textarea, select")];
            const disabled = controls.map((control) => control.disabled);
            controls.forEach((control) => {
              control.disabled = true;
            });
            try {
              const result = await svc("POST", "/mongo/document", {
                body: { connection, schema: t.schema, table: t.name, document: JSON.stringify(document2) }
              });
              toast("success", `Inserted ${result.count ?? 1} document${result.insertedId ? ` with _id ${result.insertedId}` : ""}.`);
              done(true);
              if (state.connId === connection && state.table === t && state.mode === "data") {
                await reloadTable(page.offset, undefined, { target: t, preservePending: true });
              } else if (state.connId === connection && state.openTables.includes(t)) {
                t.page = null;
              }
            } catch (error) {
              busy = false;
              controls.forEach((control, index) => {
                control.disabled = disabled[index];
              });
              editors.forEach(({ editor }) => editor.setBusy(false));
              errorRef.textContent = error.message;
              toast("error", error.message);
              return false;
            }
          }
        }
      ]
    });
  }
  async function deleteMongoDocumentDialog(rowIndex) {
    const t = state.table;
    const connection = state.connId;
    const page = t?.page;
    if (!t || !page || currentKind() !== "mongodb")
      return;
    let id;
    let original;
    try {
      id = requireMongoIdentity(page, rowIndex);
      original = page.documents[rowIndex];
    } catch (error) {
      toast("error", error.message);
      return;
    }
    const key = mongoPendingKey(id);
    const already = state.pending.get(key)?.op === "mongo-delete";
    const ok = await confirmDialog(already ? `Undo deletion of MongoDB document _id = ${id}?` : `Delete MongoDB document _id = ${id} from ${t.schema}.${t.name}?

The deletion is staged. Apply uses the exact original document and reports conflicts without overwriting them.`, { yes: already ? "Undo deletion" : "Delete document" });
    if (!ok || !isCurrentTableContext(t, connection) || t.page !== page)
      return;
    if (!ensurePendingScope())
      return;
    if (already)
      state.pending.delete(key);
    else {
      state.pending.delete(key);
      state.pending.set(key, { op: "mongo-delete", pkVal: id, original });
    }
    if (!state.pending.size)
      state.pendingFor = null;
    render();
  }
  function openMongoInspector(row, rowIndex) {
    const t = state.table;
    const connection = state.connId;
    const page = t?.page;
    if (!t || !page || rowIndex === undefined)
      return;
    let id;
    try {
      id = requireMongoIdentity(page, rowIndex);
    } catch (error) {
      toast("error", error.message);
      return;
    }
    const pending = mongoPendingOperation(t, id);
    const rowDeleted = pending?.op === "mongo-delete";
    const writable = !page.readOnly && !t.loading && hasMongoSnapshots(page);
    const wrap = el3("div", "sheetwrap");
    const sheet = el3("div", "sheet");
    const header = el3("header");
    header.appendChild(el3("h3", null, `${t.schema}.${t.name} — _id = ${id}`));
    const closeButton = el3("button", "iconbtn", "✕");
    closeButton.addEventListener("click", close);
    header.appendChild(closeButton);
    sheet.appendChild(header);
    const body = el3("div", "sbody");
    for (const meta of page.columnMeta) {
      const current = mongoFieldSnapshot(page, rowIndex, meta.name);
      const block = el3("div", "srow");
      const head = el3("div", "sh");
      head.appendChild(typeBadge(meta.type));
      head.appendChild(el3("span", null, `${meta.name} — ${meta.type}${meta.name === "_id" ? " · immutable" : ""}`));
      if (writable && meta.name !== "_id" && !rowDeleted) {
        const edit = el3("button", "iconbtn", "Edit");
        edit.addEventListener("click", () => {
          close();
          if (isCurrentTableContext(t, connection) && t.page === page)
            editMongoCellDialog(rowIndex, meta.name);
        });
        head.appendChild(edit);
      }
      block.appendChild(head);
      const sv = el3("div", `sv${!current.present || current.value === null ? " null" : ""}`);
      const canonical = current.present ? JSON.stringify(current.value) : "Missing field";
      sv.textContent = current.present && current.value === null ? "NULL (explicit null)" : canonical;
      if (current.present && current.value !== null && prettyValue(canonical)) {
        sv.classList.add("clickable");
        sv.addEventListener("click", () => valueViewDialog(meta.name, `canonical ${meta.type}`, canonical, {
          onEdit: writable && meta.name !== "_id" && !rowDeleted ? () => {
            close();
            if (isCurrentTableContext(t, connection) && t.page === page)
              editMongoCellDialog(rowIndex, meta.name);
          } : undefined
        }));
      }
      block.appendChild(sv);
      body.appendChild(block);
    }
    sheet.appendChild(body);
    const footer = el3("footer");
    const copy = el3("button", "btn", "Copy document");
    copy.addEventListener("click", async () => {
      try {
        const document2 = mongoCurrentDocument(page, rowIndex);
        await host.writeClipboard(JSON.stringify(document2, null, 2));
        toast("success", "Canonical document copied.");
      } catch (error) {
        toast("error", error.message);
      }
    });
    footer.appendChild(copy);
    if (writable) {
      const edit = el3("button", "btn primary", "Edit document");
      edit.disabled = rowDeleted;
      edit.addEventListener("click", () => {
        close();
        if (!rowDeleted && isCurrentTableContext(t, connection) && t.page === page)
          mongoDocumentDialog({ table: t, connection, rowIndex });
      });
      footer.appendChild(edit);
      const del = el3("button", "btn danger", rowDeleted ? "Undo deletion" : "Delete document");
      del.addEventListener("click", async () => {
        close();
        if (isCurrentTableContext(t, connection) && t.page === page)
          await deleteMongoDocumentDialog(rowIndex);
      });
      footer.appendChild(del);
    }
    sheet.appendChild(footer);
    wrap.appendChild(sheet);
    wrap.addEventListener("mousedown", (event) => {
      if (event.target === wrap)
        close();
    });
    const onKey = (event) => {
      if (document.querySelector(".overlay"))
        return;
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    function close() {
      wrap.remove();
      document.removeEventListener("keydown", onKey, true);
    }
    document.addEventListener("keydown", onKey, true);
    root.appendChild(wrap);
  }
  function mongoReviewValue(present, canonical) {
    if (!present)
      return "Missing";
    if (canonical === "null")
      return "NULL";
    return canonical;
  }
  async function applyMongoPendingDialog() {
    const t = state.table;
    const page = t?.page;
    if (!t || !page || state.batchBusy || currentKind() !== "mongodb")
      return;
    const connection = state.connId;
    const scope = pendingKeyFor(t);
    const initialEntries = [...state.pending.entries()];
    if (!initialEntries.length)
      return;
    let applying = false;
    let reviewBody;
    let errorBox;
    let applyButton;
    const currentEntries = () => state.pendingFor === scope ? [...state.pending.entries()] : [];
    const paintReview = (entries) => {
      reviewBody.innerHTML = "";
      const table = el3("table", "review");
      for (const [, operation] of entries) {
        if (operation.op === "mongo-delete") {
          const tr = el3("tr", "del");
          const td = el3("td", "c", `delete document _id = ${operation.pkVal}`);
          td.colSpan = 3;
          tr.appendChild(td);
          table.appendChild(tr);
        } else if (operation.op === "mongo-replace") {
          const tr = el3("tr");
          tr.appendChild(el3("td", "c", `replace document _id = ${operation.pkVal}`));
          tr.appendChild(el3("td", "o", "exact original"));
          tr.appendChild(el3("td", "n", "full replacement"));
          table.appendChild(tr);
          const detailRow = el3("tr");
          const td = el3("td");
          td.colSpan = 3;
          const details = el3("details");
          details.appendChild(el3("summary", null, "Review original and canonical replacement"));
          details.appendChild(el3("div", "typed-note", "Original"));
          const originalPre = el3("pre");
          originalPre.textContent = JSON.stringify(parseMongoDocument(operation.original), null, 2);
          details.appendChild(originalPre);
          details.appendChild(el3("div", "typed-note", "Replacement"));
          const replacementPre = el3("pre");
          replacementPre.textContent = JSON.stringify(parseMongoDocument(operation.document), null, 2);
          details.appendChild(replacementPre);
          td.appendChild(details);
          detailRow.appendChild(td);
          table.appendChild(detailRow);
        } else {
          for (const [name, change] of operation.changes) {
            const tr = el3("tr");
            tr.appendChild(el3("td", "c", `_id=${operation.pkVal} · ${name}`));
            tr.appendChild(el3("td", "o", mongoReviewValue(change.oldPresent, change.oldValue)));
            tr.appendChild(el3("td", "n", mongoReviewValue(change.mode !== "missing", change.mode === "null" ? "null" : change.value)));
            table.appendChild(tr);
          }
        }
      }
      reviewBody.appendChild(table);
      if (!entries.length)
        reviewBody.appendChild(el3("p", null, "No pending MongoDB documents remain."));
    };
    state.batchBusy = true;
    try {
      const ok = await dialog({
        title: `Apply ${initialEntries.length} MongoDB ${plural(initialEntries.length, "document")} — ${t.schema}.${t.name}`,
        className: "typed-dialog document-dialog",
        isBusy: () => applying,
        build: (body) => {
          reviewBody = el3("div", "document-review");
          body.appendChild(reviewBody);
          paintReview(initialEntries);
          body.appendChild(el3("p", null, "Documents are applied sequentially, one operation per document. There is no cross-document transaction. Successful documents are removed from pending even if a later document conflicts or fails."));
          errorBox = el3("div", "typed-error");
          errorBox.setAttribute("role", "alert");
          body.appendChild(errorBox);
        },
        actions: [
          { label: "Discard all", kind: "danger", onClick: (done) => {
            if (!applying) {
              clearPending();
              done(null);
              render();
            }
          } },
          { label: "Close", value: null },
          {
            label: `Apply (${initialEntries.length})`,
            kind: "primary",
            shortcut: true,
            onClick: async (done) => {
              if (applying)
                return false;
              if (!isCurrentTableContext(t, connection)) {
                errorBox.textContent = "The collection context changed. Close this review before applying.";
                return false;
              }
              const entries = currentEntries();
              if (!entries.length) {
                done(true);
                return;
              }
              applying = true;
              errorBox.textContent = "";
              const buttons = [...reviewBody.parentElement.parentElement.querySelectorAll(".acts button")];
              applyButton = buttons[buttons.length - 1];
              buttons.forEach((button2) => {
                button2.disabled = true;
              });
              const failures = [];
              let succeeded = 0;
              for (const [key, operation] of entries) {
                if (state.pending.get(key) !== operation)
                  continue;
                const body = { connection, schema: t.schema, table: t.name };
                try {
                  if (operation.op === "mongo-update") {
                    const setEntries = [];
                    const unset = [];
                    for (const [name, change] of operation.changes) {
                      if (change.mode === "missing")
                        unset.push(name);
                      else
                        setEntries.push([name, change.mode === "null" ? "null" : change.value]);
                    }
                    const set = Object.fromEntries(setEntries);
                    await svc("PATCH", "/mongo/document", { body: { ...body, id: operation.pkVal, original: operation.original, set, unset } });
                  } else if (operation.op === "mongo-replace") {
                    await svc("PUT", "/mongo/document", { body: { ...body, original: operation.original, document: operation.document } });
                  } else if (operation.op === "mongo-delete") {
                    await svc("DELETE", "/mongo/document", { body: { ...body, id: operation.pkVal, original: operation.original } });
                  }
                  if (state.pending.get(key) === operation)
                    state.pending.delete(key);
                  succeeded += 1;
                } catch (error) {
                  failures.push(`_id ${operation.pkVal}: ${error.message}`);
                }
              }
              if (!state.pending.size && state.pendingFor === scope)
                state.pendingFor = null;
              const remaining = currentEntries();
              paintReview(remaining);
              if (succeeded) {
                toast(failures.length ? "info" : "success", failures.length ? `Applied ${succeeded} ${plural(succeeded, "document")}; ${failures.length} failed and remain pending.` : `Applied ${succeeded} MongoDB ${plural(succeeded, "document")}.`);
                if (state.connId === connection && state.table === t && state.mode === "data") {
                  await reloadTable(page.offset, undefined, { target: t, preservePending: true });
                } else if (state.connId === connection && state.openTables.includes(t)) {
                  t.page = null;
                }
              }
              if (!remaining.length) {
                done(true);
                render();
                return;
              }
              applying = false;
              buttons.forEach((button2) => {
                button2.disabled = false;
              });
              applyButton.textContent = `Retry remaining (${remaining.length})`;
              errorBox.textContent = `${failures.length ? failures.join(`
`) : "Some documents were not applied."}

Successful documents were removed. The entries above remain pending; no conflict was overwritten. Reload after closing if you need a fresh original.`;
              toast("error", errorBox.textContent);
              return false;
            }
          }
        ]
      });
      if (ok)
        render();
    } finally {
      state.batchBusy = false;
    }
  }
  function openRedisEditorForRow(t, connection, row) {
    const page = t?.page;
    if (!page || currentKind() !== "redis")
      return;
    const keyIndex = page.columns.indexOf("key");
    const typeIndex = page.columns.indexOf("type");
    const key = row[keyIndex];
    const type = row[typeIndex];
    if (!key || !type)
      return toast("error", "The Redis key or type is unavailable. Reload the key list.");
    redisPanel.openKey({
      connection,
      key: String(key),
      type: String(type),
      onListRefresh: () => refreshRedisTable(t, connection)
    });
  }
  async function refreshRedisTable(t, connection) {
    if (state.connId !== connection || !state.openTables.includes(t))
      return;
    if (state.table === t && state.mode === "data") {
      await reloadTable(t.page?.offset ?? 0, undefined, { target: t, preservePending: true });
    } else {
      t.page = null;
    }
  }
  async function deleteConnection(id) {
    const connection = state.conns.find((item) => item.id === id);
    if (!connection)
      return;
    const ok = await confirmDialog(`Delete connection “${connection.name}”?`, { yes: "Delete" });
    if (!ok)
      return;
    const wasCurrent = state.connId === id;
    if (wasCurrent && !await leaveDataGuard())
      return;
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
        const layout = el3("div", "connection-create");
        const tabs = el3("div", "dbtype-tabs");
        tabs.setAttribute("role", "tablist");
        const form = el3("div", "connection-form");
        layout.append(tabs, form);
        body.appendChild(layout);
        let selectedKind = DB_TYPES[currentKind()] ? currentKind() : "postgres";
        const heading = el3("div", "form-title");
        const note = el3("p", "form-note", "The connection will be tested before saving.");
        const nameLabel = el3("label", "fld", "Name");
        const nameInput = el3("input");
        nameInput.type = "text";
        nameInput.placeholder = "my-db";
        nameLabel.appendChild(nameInput);
        const dsnLabel = el3("label", "fld", "DSN");
        const dsnInput = el3("input");
        dsnInput.type = "text";
        dsnInput.spellcheck = false;
        dsnLabel.appendChild(dsnInput);
        const add = el3("button", "btn primary", "Test and add");
        add.style.alignSelf = "flex-start";
        form.append(heading, note, nameLabel, dsnLabel, add);
        const paint = () => {
          const type = DB_TYPES[selectedKind];
          heading.textContent = type.label;
          dsnInput.placeholder = type.placeholder;
          for (const button2 of tabs.children) {
            const active2 = button2.dataset.kind === selectedKind;
            button2.classList.toggle("on", active2);
            button2.setAttribute("aria-selected", active2 ? "true" : "false");
          }
        };
        for (const [kind, type] of Object.entries(DB_TYPES)) {
          const button2 = el3("button", "dbtype");
          button2.dataset.kind = kind;
          button2.setAttribute("role", "tab");
          button2.append(el3("span", "dbmonogram", type.short), el3("span", null, type.label));
          button2.addEventListener("click", () => {
            if (selectedKind === kind)
              return;
            selectedKind = kind;
            dsnInput.value = "";
            paint();
            dsnInput.focus();
          });
          tabs.appendChild(button2);
        }
        paint();
        add.addEventListener("click", async () => {
          let data;
          try {
            add.disabled = true;
            add.textContent = "Testing…";
            data = await svc("POST", "/connections", {
              body: { name: nameInput.value.trim(), dsn: dsnInput.value.trim(), kind: selectedKind }
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
          if (!await leaveDataGuard()) {
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
      actions: [{ label: "Done", kind: "primary" }]
    });
  }
  var booted = false;
  host.onReady(async (ctx) => {
    applyHostReady(ctx, document.documentElement);
    if (booted)
      return;
    booted = true;
    buildChrome();
    render();
    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (document.querySelector(".overlay, .sheetwrap"))
          return;
        event.preventDefault();
        openPalette();
        return;
      }
    });
    try {
      await loadColsPrefs();
      const prefs = await host.storage.get("prefs").catch(() => {
        return;
      });
      if (prefs && typeof prefs === "object" && prefs.connection)
        state.connId = prefs.connection;
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
})();
