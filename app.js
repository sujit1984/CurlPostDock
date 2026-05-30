"use strict";

const CPD_FORMAT = "curlpostdock.cpd";
const CPD_VERSION = "0.1.0";
const STORAGE_KEY = "curlpostdock.workspace.v1";
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"];
const PROTOCOLS = ["REST", "GraphQL", "gRPC", "WebSocket", "SSE", "Socket.IO", "MQTT"];
const BODY_TYPES = ["none", "json", "xml", "text", "graphql", "protobuf", "form", "multipart", "binary"];
const AUTH_TYPES = [
  "none",
  "inherit",
  "basic",
  "bearer",
  "apiKey",
  "oauth2",
  "oidc",
  "jwt",
  "digest",
  "awsSigV4",
  "mTLS",
  "ntlm",
  "kerberos",
  "custom"
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const ui = {
  selectedRequestId: null,
  leftTab: "collections",
  requestTab: "params",
  responseTab: "pretty",
  moduleTab: "runner",
  lastResponse: null,
  lastRun: [],
  binaryFile: null
};

let workspace = loadWorkspace();

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultPolicy() {
  return {
    cloudSync: "disabled",
    allowNetworkImport: false,
    requireEncryptedSecretExport: true,
    blockSecretPlaintextWarning: true,
    approvedVaultSchemes: ["vault://", "aws-secrets://", "hashicorp://", "azure-keyvault://"],
    allowedHosts: [],
    deniedHosts: [],
    forbiddenHeaders: ["x-cpd-cloud-sync"]
  };
}

function makeVariable(key = "", value = "", enabled = true, secret = false) {
  return { key, value, enabled, secret };
}

function makeRequest(name = "Untitled request", method = "GET", url = "https://example.com/api/status") {
  return {
    id: uid("req"),
    name,
    protocol: "REST",
    method,
    url,
    folderPath: [],
    tags: [],
    favorite: false,
    auth: {
      type: "none",
      placement: "header",
      username: "",
      token: "",
      tokenUrl: "",
      scope: "",
      script: ""
    },
    params: [],
    pathParams: [],
    headers: [makeVariable("Accept", "application/json")],
    cookies: [],
    variables: [],
    bodyType: "none",
    body: "",
    scripts: {
      preRequest: "",
      postResponse: [
        "cpd.test('status is successful', () => {",
        "  cpd.expect(response.status).to.be.below(400);",
        "});"
      ].join("\n")
    },
    examples: [],
    mocks: [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

function createDefaultWorkspace() {
  const collectionId = uid("col");
  const request = makeRequest("Health check", "GET", "https://example.com/api/status");
  request.params = [makeVariable("verbose", "true", false)];
  return {
    format: CPD_FORMAT,
    version: CPD_VERSION,
    app: "CurlPostDock",
    name: "CurlPostDock Local Workspace",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    sync: {
      mode: "offline",
      encryptedSyncEnabled: false,
      cloudSyncAllowed: false
    },
    security: {
      offlineMode: true,
      zeroTrust: true,
      vaultUri: "",
      policy: defaultPolicy()
    },
    globals: [makeVariable("baseUrl", "https://example.com", true, false)],
    variables: [],
    environments: [
      {
        id: uid("env"),
        name: "local",
        values: [
          makeVariable("host", "localhost:8080"),
          makeVariable("timestamp", "{{$timestamp}}", true, false)
        ]
      },
      { id: uid("env"), name: "dev", values: [] },
      { id: uid("env"), name: "test", values: [] },
      { id: uid("env"), name: "staging", values: [] },
      { id: uid("env"), name: "prod", values: [] }
    ],
    activeEnvironmentId: null,
    collections: [
      {
        id: collectionId,
        name: "Sample Collection",
        variables: [makeVariable("collectionToken", "", false, true)],
        scripts: { preRequest: "", postResponse: "" },
        requests: [request]
      }
    ],
    sharedScriptLibraries: [
      {
        id: uid("lib"),
        name: "default assertions",
        source: "cpd.test('response exists', () => cpd.expect(response).to.exist());"
      }
    ],
    history: [],
    mocks: [],
    reports: []
  };
}

function loadWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const loaded = JSON.parse(raw);
      normalizeWorkspace(loaded);
      return loaded;
    }
  } catch (error) {
    console.warn("Could not load workspace", error);
  }
  const initial = createDefaultWorkspace();
  initial.activeEnvironmentId = initial.environments[0].id;
  return initial;
}

function normalizeWorkspace(doc) {
  doc.format ||= CPD_FORMAT;
  doc.version ||= CPD_VERSION;
  doc.app ||= "CurlPostDock";
  doc.sync ||= { mode: "offline", encryptedSyncEnabled: false, cloudSyncAllowed: false };
  doc.security ||= { offlineMode: true, zeroTrust: true, vaultUri: "", policy: defaultPolicy() };
  doc.security.policy ||= defaultPolicy();
  doc.globals ||= [];
  doc.variables ||= [];
  doc.environments ||= [];
  doc.collections ||= [];
  doc.history ||= [];
  doc.mocks ||= [];
  doc.reports ||= [];
  doc.sharedScriptLibraries ||= [];
  if (!doc.activeEnvironmentId && doc.environments[0]) doc.activeEnvironmentId = doc.environments[0].id;
  doc.collections.forEach((collection) => {
    collection.variables ||= [];
    collection.scripts ||= { preRequest: "", postResponse: "" };
    collection.requests ||= [];
    collection.requests.forEach(normalizeRequest);
  });
}

function normalizeRequest(request) {
  request.id ||= uid("req");
  request.name ||= "Untitled request";
  request.protocol ||= "REST";
  request.method ||= "GET";
  request.url ||= "";
  request.folderPath ||= [];
  request.tags ||= [];
  request.auth ||= {};
  request.auth.type ||= "none";
  request.auth.placement ||= "header";
  request.auth.username ||= "";
  request.auth.token ||= "";
  request.auth.tokenUrl ||= "";
  request.auth.scope ||= "";
  request.auth.script ||= "";
  request.params ||= [];
  request.pathParams ||= [];
  request.headers ||= [];
  request.cookies ||= [];
  request.variables ||= [];
  request.bodyType ||= "none";
  request.body ||= "";
  request.scripts ||= { preRequest: "", postResponse: "" };
  request.scripts.preRequest ||= "";
  request.scripts.postResponse ||= "";
  request.examples ||= [];
  request.mocks ||= [];
  request.createdAt ||= nowIso();
  request.updatedAt ||= nowIso();
}

function saveWorkspaceLocal() {
  workspace.updatedAt = nowIso();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

function currentCollection() {
  const found = workspace.collections.find((collection) =>
    collection.requests.some((request) => request.id === ui.selectedRequestId)
  );
  return found || workspace.collections[0] || null;
}

function currentRequest() {
  for (const collection of workspace.collections) {
    const request = collection.requests.find((item) => item.id === ui.selectedRequestId);
    if (request) return request;
  }
  return workspace.collections[0]?.requests[0] || null;
}

function currentEnvironment() {
  return workspace.environments.find((env) => env.id === workspace.activeEnvironmentId) || workspace.environments[0] || null;
}

function ensureSelection() {
  const selected = currentRequest();
  if (selected) {
    ui.selectedRequestId = selected.id;
    return;
  }
  if (!workspace.collections.length) {
    workspace.collections.push({ id: uid("col"), name: "New Collection", variables: [], scripts: {}, requests: [] });
  }
  const request = makeRequest();
  workspace.collections[0].requests.push(request);
  ui.selectedRequestId = request.id;
}

function render() {
  ensureSelection();
  renderWorkspaceChrome();
  renderTree();
  renderEditor();
  renderResponse();
  renderSnippets();
  renderSecurity();
}

function renderWorkspaceChrome() {
  $("#workspaceName").value = workspace.name || "CurlPostDock Workspace";
  const requests = workspace.collections.flatMap((collection) => collection.requests);
  const secrets = [
    ...workspace.globals,
    ...workspace.variables,
    ...workspace.environments.flatMap((env) => env.values || []),
    ...workspace.collections.flatMap((collection) => [
      ...(collection.variables || []),
      ...collection.requests.flatMap((request) => request.variables || [])
    ])
  ].filter((item) => item.secret).length;
  $("#workspaceStats").textContent = `${workspace.collections.length} collections, ${requests.length} requests, ${secrets} secrets`;
  const envSelect = $("#environmentSelect");
  envSelect.innerHTML = workspace.environments
    .map((env) => `<option value="${escapeHtml(env.id)}">${escapeHtml(env.name)}</option>`)
    .join("");
  envSelect.value = workspace.activeEnvironmentId || "";
}

function renderTree() {
  const tree = $("#collectionTree");
  const query = ($("#searchInput").value || "").toLowerCase();
  const requests = workspace.collections.flatMap((collection) => collection.requests.map((request) => ({ collection, request })));
  if (ui.leftTab === "history") {
    tree.innerHTML = workspace.history.slice(0, 60).map((entry) => renderHistoryEntry(entry)).join("") || emptyTree("No history yet");
    bindTreeClicks();
    return;
  }
  if (ui.leftTab === "favorites") {
    const favorites = requests.filter(({ request }) => request.favorite);
    tree.innerHTML = favorites.map(({ collection, request }) => renderRequestTreeItem(collection, request)).join("") || emptyTree("No favorites yet");
    bindTreeClicks();
    return;
  }

  const html = workspace.collections.map((collection) => {
    const filtered = collection.requests.filter((request) => requestMatches(request, query));
    if (query && !filtered.length && !collection.name.toLowerCase().includes(query)) return "";
    const folderTree = buildFolderTree(filtered);
    return [
      `<div class="tree-collection" data-collection-id="${escapeHtml(collection.id)}">${escapeHtml(collection.name)}</div>`,
      renderFolderTree(collection, folderTree)
    ].join("");
  }).join("");
  tree.innerHTML = html || emptyTree("No matching requests");
  bindTreeClicks();
}

function requestMatches(request, query) {
  if (!query) return true;
  const haystack = [
    request.name,
    request.method,
    request.protocol,
    request.url,
    ...(request.tags || []),
    ...(request.folderPath || [])
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function buildFolderTree(requests) {
  const root = { folders: new Map(), requests: [] };
  for (const request of requests) {
    let node = root;
    for (const part of request.folderPath || []) {
      if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), requests: [] });
      node = node.folders.get(part);
    }
    node.requests.push(request);
  }
  return root;
}

function renderFolderTree(collection, node, depth = 0, path = []) {
  const folders = Array.from(node.folders.entries()).sort(([a], [b]) => a.localeCompare(b));
  const folderHtml = folders.map(([name, child]) => {
    const nextPath = [...path, name];
    return [
      `<div class="tree-folder" style="margin-left:${depth * 10}px">/${escapeHtml(name)}</div>`,
      renderFolderTree(collection, child, depth + 1, nextPath)
    ].join("");
  }).join("");
  const requestHtml = node.requests
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .map((request) => renderRequestTreeItem(collection, request, depth))
    .join("");
  return folderHtml + requestHtml;
}

function renderRequestTreeItem(collection, request, depth = 0) {
  const active = request.id === ui.selectedRequestId ? " active" : "";
  const tags = request.tags?.length ? ` tags: ${request.tags.join(", ")}` : "";
  return [
    `<div class="tree-item${active}" data-request-id="${escapeHtml(request.id)}" style="margin-left:${12 + depth * 10}px">`,
    `<div><span class="method">${escapeHtml(request.method || request.protocol)}</span>${escapeHtml(request.name)}</div>`,
    `<small>${escapeHtml(collection.name)}${escapeHtml(tags)} ${escapeHtml(request.url || "")}</small>`,
    `</div>`
  ].join("");
}

function renderHistoryEntry(entry) {
  return [
    `<div class="tree-item" data-history-id="${escapeHtml(entry.id)}">`,
    `<div><span class="method">${escapeHtml(entry.method)}</span>${escapeHtml(entry.name)}</div>`,
    `<small>${escapeHtml(entry.status || "ERR")} ${escapeHtml(entry.url || "")}</small>`,
    `</div>`
  ].join("");
}

function emptyTree(text) {
  return `<div class="tree-item"><small>${escapeHtml(text)}</small></div>`;
}

function bindTreeClicks() {
  $$(".tree-item[data-request-id]").forEach((item) => {
    item.addEventListener("click", () => {
      ui.selectedRequestId = item.dataset.requestId;
      render();
    });
  });
  $$(".tree-item[data-history-id]").forEach((item) => {
    item.addEventListener("click", () => {
      const entry = workspace.history.find((history) => history.id === item.dataset.historyId);
      if (!entry) return;
      ui.lastResponse = entry.response;
      ui.responseTab = "pretty";
      renderResponse();
    });
  });
}

function renderEditor() {
  const request = currentRequest();
  if (!request) return;
  $("#requestName").value = request.name;
  $("#favoriteBtn").textContent = request.favorite ? "Starred" : "Star";
  renderOptions($("#protocolSelect"), PROTOCOLS, request.protocol);
  renderOptions($("#methodSelect"), HTTP_METHODS, request.method);
  $("#methodSelect").disabled = request.protocol !== "REST" && request.protocol !== "GraphQL";
  $("#urlInput").value = request.url || "";
  $("#requestStatusText").textContent = `${request.protocol} request saved locally`;

  renderOptions($("#authType"), AUTH_TYPES, request.auth.type || "none");
  $("#authPlacement").value = request.auth.placement || "header";
  $("#authUser").value = request.auth.username || "";
  $("#authToken").value = request.auth.token || "";
  $("#authTokenUrl").value = request.auth.tokenUrl || "";
  $("#authScope").value = request.auth.scope || "";
  $("#authScript").value = request.auth.script || "";

  renderOptions($("#bodyType"), BODY_TYPES, request.bodyType || "none");
  $("#bodyEditor").value = request.body || "";
  $("#preScript").value = request.scripts.preRequest || "";
  $("#testScript").value = request.scripts.postResponse || "";

  renderKvTable("paramsTable", request.params, "params");
  renderKvTable("pathParamsTable", request.pathParams, "pathParams");
  renderKvTable("headersTable", request.headers, "headers");
  renderKvTable("cookiesTable", request.cookies, "cookies");
  renderKvTable("requestVariablesTable", request.variables, "requestVariables");
  const env = currentEnvironment();
  renderKvTable("environmentVariablesTable", env?.values || [], "environmentVariables");

  $$("#tabPanels [data-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === ui.requestTab));
  $$(".tabs [data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === ui.requestTab));
}

function renderOptions(select, values, selected) {
  select.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  select.value = selected;
}

function renderKvTable(id, items, kind) {
  const container = $(`#${id}`);
  const isVariable = kind.includes("Variables");
  container.innerHTML = (items || []).map((item, index) => {
    const checked = item.enabled !== false ? "checked" : "";
    const secretSelect = isVariable
      ? `<select data-kv-secret="${index}"><option value="plain">plain</option><option value="secret"${item.secret ? " selected" : ""}>secret</option></select>`
      : `<input data-kv-note="${index}" placeholder="description" value="${escapeHtml(item.description || "")}">`;
    return [
      `<div class="kv-row${isVariable ? " variable" : ""}">`,
      `<input type="checkbox" data-kv-enabled="${index}" ${checked} title="Enabled">`,
      `<input data-kv-key="${index}" placeholder="key" value="${escapeHtml(item.key || "")}">`,
      `<input data-kv-value="${index}" placeholder="value" value="${escapeHtml(item.value || "")}" ${item.secret ? 'type="password"' : ""}>`,
      secretSelect,
      `<button data-kv-delete="${index}" title="Delete">X</button>`,
      `</div>`
    ].join("");
  }).join("") || `<div class="tree-item"><small>No rows yet</small></div>`;

  container.querySelectorAll("[data-kv-enabled]").forEach((input) => {
    input.addEventListener("change", () => {
      items[Number(input.dataset.kvEnabled)].enabled = input.checked;
      touchRequest(kind);
    });
  });
  container.querySelectorAll("[data-kv-key]").forEach((input) => {
    input.addEventListener("input", () => {
      items[Number(input.dataset.kvKey)].key = input.value;
      touchRequest(kind, false);
    });
  });
  container.querySelectorAll("[data-kv-value]").forEach((input) => {
    input.addEventListener("input", () => {
      items[Number(input.dataset.kvValue)].value = input.value;
      touchRequest(kind, false);
    });
  });
  container.querySelectorAll("[data-kv-note]").forEach((input) => {
    input.addEventListener("input", () => {
      items[Number(input.dataset.kvNote)].description = input.value;
      touchRequest(kind, false);
    });
  });
  container.querySelectorAll("[data-kv-secret]").forEach((select) => {
    select.addEventListener("change", () => {
      items[Number(select.dataset.kvSecret)].secret = select.value === "secret";
      touchRequest(kind);
      renderEditor();
    });
  });
  container.querySelectorAll("[data-kv-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      items.splice(Number(button.dataset.kvDelete), 1);
      touchRequest(kind);
      renderEditor();
    });
  });
}

function touchRequest(kind = "", rerenderTree = true) {
  if (kind !== "environmentVariables") {
    const request = currentRequest();
    if (request) request.updatedAt = nowIso();
  }
  saveWorkspaceLocal();
  if (rerenderTree) renderTree();
  renderSnippets();
}

function renderResponse() {
  const response = ui.lastResponse;
  const summary = $("#responseSummary");
  const viewer = $("#responseViewer");
  $$(".tabs [data-response-tab]").forEach((button) => button.classList.toggle("active", button.dataset.responseTab === ui.responseTab));
  if (!response) {
    summary.textContent = "No response yet";
    viewer.textContent = "Send a request or run a collection to inspect the response.";
    return;
  }
  const className = response.ok ? "ok" : response.status ? "warn" : "bad";
  summary.innerHTML = [
    `<strong class="${className}">${escapeHtml(response.status || "ERROR")}</strong>`,
    escapeHtml(response.statusText || response.error || ""),
    `${Math.round(response.timings?.total || 0)} ms`,
    `${formatBytes(response.size || 0)}`
  ].join(" ");
  if (ui.responseTab === "pretty") viewer.textContent = prettyBody(response);
  if (ui.responseTab === "raw") viewer.textContent = response.bodyText || "";
  if (ui.responseTab === "headers") viewer.textContent = formatPairs(response.headers || []);
  if (ui.responseTab === "cookies") viewer.textContent = extractCookies(response.headers || []).join("\n") || "No response cookies exposed by the runtime.";
  if (ui.responseTab === "timings") viewer.textContent = JSON.stringify(response.timings || {}, null, 2);
  if (ui.responseTab === "binary") viewer.textContent = response.binaryPreview || "No binary preview available.";
}

function renderSnippets() {
  const request = currentRequest();
  if (!request) return;
  const language = $("#snippetLanguage")?.value || "curl";
  const prepared = prepareRequest(request, { runScripts: false, dataVars: {} });
  $("#snippetViewer").textContent = generateSnippet(language, prepared.request);
}

function renderSecurity() {
  $("#offlineMode").checked = workspace.security.offlineMode !== false;
  $("#encryptedSync").checked = workspace.sync.encryptedSyncEnabled === true;
  $("#zeroTrust").checked = workspace.security.zeroTrust !== false;
  $("#vaultUri").value = workspace.security.vaultUri || "";
  $("#policyEditor").value = JSON.stringify(workspace.security.policy || defaultPolicy(), null, 2);
}

function bindEvents() {
  $("#workspaceName").addEventListener("input", (event) => {
    workspace.name = event.target.value;
    saveWorkspaceLocal();
    renderWorkspaceChrome();
  });
  $("#environmentSelect").addEventListener("change", (event) => {
    workspace.activeEnvironmentId = event.target.value;
    saveWorkspaceLocal();
    renderEditor();
  });
  $("#searchInput").addEventListener("input", renderTree);
  $$(".segmented [data-left-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.leftTab = button.dataset.leftTab;
      $$(".segmented [data-left-tab]").forEach((item) => item.classList.toggle("active", item === button));
      renderTree();
    });
  });
  $$(".tabs [data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.requestTab = button.dataset.tab;
      renderEditor();
    });
  });
  $$(".tabs [data-response-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.responseTab = button.dataset.responseTab;
      renderResponse();
    });
  });
  $$(".segmented [data-module]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.moduleTab = button.dataset.module;
      $$(".segmented [data-module]").forEach((item) => item.classList.toggle("active", item === button));
      $$("[data-module-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.modulePanel === ui.moduleTab));
      if (ui.moduleTab === "snippets") renderSnippets();
      if (ui.moduleTab === "security") renderSecurity();
    });
  });

  $("#newCollectionBtn").addEventListener("click", addCollection);
  $("#newRequestBtn").addEventListener("click", addRequest);
  $("#duplicateBtn").addEventListener("click", duplicateRequest);
  $("#deleteBtn").addEventListener("click", deleteRequest);
  $("#favoriteBtn").addEventListener("click", toggleFavorite);
  $("#saveWorkspaceBtn").addEventListener("click", () => downloadWorkspace(false));
  $("#saveEncryptedBtn").addEventListener("click", () => downloadWorkspace(true));
  $("#downloadRequestBtn").addEventListener("click", downloadCurrentRequest);

  $("#requestName").addEventListener("input", (event) => updateRequest({ name: event.target.value }));
  $("#protocolSelect").addEventListener("change", (event) => {
    const protocol = event.target.value;
    const updates = { protocol };
    if (protocol === "GraphQL") updates.bodyType = "graphql";
    updateRequest(updates);
    renderEditor();
  });
  $("#methodSelect").addEventListener("change", (event) => updateRequest({ method: event.target.value }));
  $("#urlInput").addEventListener("input", (event) => updateRequest({ url: event.target.value }));
  $("#bodyType").addEventListener("change", (event) => updateRequest({ bodyType: event.target.value }));
  $("#bodyEditor").addEventListener("input", (event) => updateRequest({ body: event.target.value }));
  $("#preScript").addEventListener("input", (event) => updateRequest({ scripts: { ...currentRequest().scripts, preRequest: event.target.value } }));
  $("#testScript").addEventListener("input", (event) => updateRequest({ scripts: { ...currentRequest().scripts, postResponse: event.target.value } }));
  $("#binaryInput").addEventListener("change", (event) => {
    ui.binaryFile = event.target.files?.[0] || null;
    if (ui.binaryFile) updateRequest({ bodyType: "binary" });
    renderEditor();
  });
  $("#formatBodyBtn").addEventListener("click", prettyPrintBody);

  ["authType", "authPlacement", "authUser", "authToken", "authTokenUrl", "authScope", "authScript"].forEach((id) => {
    $(`#${id}`).addEventListener("input", updateAuthFromInputs);
    $(`#${id}`).addEventListener("change", updateAuthFromInputs);
  });

  $$("[data-add-row]").forEach((button) => {
    button.addEventListener("click", () => addKvRow(button.dataset.addRow));
  });

  $("#sendBtn").addEventListener("click", () => sendCurrentRequest());
  $("#runCollectionBtn").addEventListener("click", () => runScope("collection"));
  $("#runScopeBtn").addEventListener("click", () => runScope($("#runnerScope").value));
  $("#exportReportBtn").addEventListener("click", exportReportMenu);
  $("#importCurlBtn").addEventListener("click", importCurlDialog);
  $("#copyCurlBtn").addEventListener("click", copyCurl);
  $("#copySnippetBtn").addEventListener("click", copySnippet);
  $("#snippetLanguage").addEventListener("change", renderSnippets);
  $("#importFileInput").addEventListener("change", (event) => importFiles(event.target.files));
  $("#importBrunoInput").addEventListener("change", (event) => importBrunoZip(event.target.files?.[0]));
  $("#generateTestsBtn").addEventListener("click", generateOfflineTests);
  $("#generateMockBtn").addEventListener("click", generateMockRules);
  $("#validatePolicyBtn").addEventListener("click", validatePolicy);

  ["offlineMode", "encryptedSync", "zeroTrust", "vaultUri", "policyEditor"].forEach((id) => {
    $(`#${id}`).addEventListener("input", updateSecurityFromInputs);
    $(`#${id}`).addEventListener("change", updateSecurityFromInputs);
  });

  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      sendCurrentRequest();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      downloadWorkspace(false);
    }
  });
}

function updateRequest(updates) {
  const request = currentRequest();
  Object.assign(request, updates, { updatedAt: nowIso() });
  saveWorkspaceLocal();
  renderTree();
  renderSnippets();
}

function updateAuthFromInputs() {
  const request = currentRequest();
  request.auth = {
    type: $("#authType").value,
    placement: $("#authPlacement").value,
    username: $("#authUser").value,
    token: $("#authToken").value,
    tokenUrl: $("#authTokenUrl").value,
    scope: $("#authScope").value,
    script: $("#authScript").value
  };
  updateRequest({ auth: request.auth });
}

function updateSecurityFromInputs() {
  workspace.security.offlineMode = $("#offlineMode").checked;
  workspace.sync.encryptedSyncEnabled = $("#encryptedSync").checked;
  workspace.security.zeroTrust = $("#zeroTrust").checked;
  workspace.security.vaultUri = $("#vaultUri").value;
  try {
    workspace.security.policy = JSON.parse($("#policyEditor").value || "{}");
  } catch {
    // Validation button reports syntax problems without blocking typing.
  }
  workspace.sync.cloudSyncAllowed = false;
  saveWorkspaceLocal();
}

function addCollection() {
  const collection = { id: uid("col"), name: "New Collection", variables: [], scripts: {}, requests: [makeRequest()] };
  workspace.collections.push(collection);
  ui.selectedRequestId = collection.requests[0].id;
  saveWorkspaceLocal();
  render();
}

function addRequest() {
  const collection = currentCollection() || workspace.collections[0];
  const request = makeRequest();
  collection.requests.push(request);
  ui.selectedRequestId = request.id;
  saveWorkspaceLocal();
  render();
}

function duplicateRequest() {
  const collection = currentCollection();
  const request = currentRequest();
  if (!collection || !request) return;
  const copy = clone(request);
  copy.id = uid("req");
  copy.name = `${request.name} copy`;
  copy.createdAt = nowIso();
  copy.updatedAt = nowIso();
  collection.requests.push(copy);
  ui.selectedRequestId = copy.id;
  saveWorkspaceLocal();
  render();
}

function deleteRequest() {
  const collection = currentCollection();
  const request = currentRequest();
  if (!collection || !request) return;
  if (!confirm(`Delete "${request.name}"?`)) return;
  collection.requests = collection.requests.filter((item) => item.id !== request.id);
  ui.selectedRequestId = collection.requests[0]?.id || workspace.collections.flatMap((col) => col.requests)[0]?.id || null;
  saveWorkspaceLocal();
  render();
}

function toggleFavorite() {
  const request = currentRequest();
  request.favorite = !request.favorite;
  updateRequest({ favorite: request.favorite });
  renderEditor();
}

function addKvRow(kind) {
  if (kind === "environmentVariables") {
    const env = currentEnvironment();
    if (!env) return;
    env.values.push(makeVariable("", ""));
    touchRequest(kind);
    renderEditor();
    return;
  }
  const request = currentRequest();
  const target = {
    params: request.params,
    pathParams: request.pathParams,
    headers: request.headers,
    cookies: request.cookies,
    requestVariables: request.variables
  }[kind];
  target.push(makeVariable("", ""));
  touchRequest(kind);
  renderEditor();
}

function prettyPrintBody() {
  const request = currentRequest();
  if (request.bodyType === "json" || request.bodyType === "graphql") {
    try {
      request.body = JSON.stringify(JSON.parse(request.body), null, 2);
    } catch (error) {
      $("#requestStatusText").textContent = `JSON format error: ${error.message}`;
      return;
    }
  }
  if (request.bodyType === "xml") {
    request.body = formatXml(request.body);
  }
  updateRequest({ body: request.body });
  renderEditor();
}

function prepareRequest(sourceRequest, options = {}) {
  const request = clone(sourceRequest);
  const collection = workspace.collections.find((item) => item.requests.some((req) => req.id === sourceRequest.id));
  const dataVars = options.dataVars || {};
  const scopes = buildVariableScopes(request, collection, dataVars);
  request.url = resolveTemplate(request.url || "", scopes);
  request.params = request.params.map((item) => ({ ...item, key: resolveTemplate(item.key || "", scopes), value: resolveTemplate(item.value || "", scopes) }));
  request.pathParams = request.pathParams.map((item) => ({ ...item, key: resolveTemplate(item.key || "", scopes), value: resolveTemplate(item.value || "", scopes) }));
  request.headers = request.headers.map((item) => ({ ...item, key: resolveTemplate(item.key || "", scopes), value: resolveTemplate(item.value || "", scopes) }));
  request.cookies = request.cookies.map((item) => ({ ...item, key: resolveTemplate(item.key || "", scopes), value: resolveTemplate(item.value || "", scopes) }));
  request.body = resolveTemplate(request.body || "", scopes);
  request.url = applyPathParams(request.url, request.pathParams);
  applyAuth(request, scopes);
  request.url = appendQueryParams(request.url, request.params);
  if (options.runScripts !== false) {
    const context = makeScriptContext(request, null, scopes);
    runScript(request.scripts.preRequest || "", context, "pre-request");
    if (request.auth?.type === "custom" && request.auth.script) runScript(request.auth.script, context, "custom-auth");
  }
  return { request, scopes };
}

function buildVariableScopes(request, collection, dataVars = {}) {
  const env = currentEnvironment();
  return {
    global: kvToObject(workspace.globals),
    workspace: kvToObject(workspace.variables),
    environment: kvToObject(env?.values || []),
    collection: kvToObject(collection?.variables || []),
    folder: {},
    request: kvToObject(request.variables || []),
    data: dataVars
  };
}

function kvToObject(items) {
  return (items || []).filter((item) => item.enabled !== false && item.key).reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});
}

function resolveTemplate(value, scopes) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, token) => {
    const key = token.trim();
    if (key.startsWith("$")) return dynamicVariable(key);
    for (const scopeName of ["data", "request", "folder", "collection", "environment", "workspace", "global"]) {
      if (Object.prototype.hasOwnProperty.call(scopes[scopeName] || {}, key)) {
        return resolveTemplate(String(scopes[scopeName][key]), scopes);
      }
    }
    return `{{${key}}}`;
  });
}

function dynamicVariable(token) {
  if (token === "$timestamp") return String(Date.now());
  if (token === "$isoTimestamp") return nowIso();
  if (token === "$uuid") return crypto.randomUUID ? crypto.randomUUID() : uid("uuid");
  if (token === "$randomInt") return String(Math.floor(Math.random() * 1000000));
  if (token === "$randomEmail") return `user${Math.floor(Math.random() * 100000)}@example.test`;
  return `{{${token}}}`;
}

function applyPathParams(url, params) {
  let next = url;
  for (const param of params || []) {
    if (param.enabled === false || !param.key) continue;
    next = next.replaceAll(`:${param.key}`, encodeURIComponent(param.value || ""));
    next = next.replaceAll(`{${param.key}}`, encodeURIComponent(param.value || ""));
  }
  return next;
}

function appendQueryParams(url, params) {
  const enabled = (params || []).filter((param) => param.enabled !== false && param.key);
  if (!enabled.length) return url;
  try {
    const parsed = new URL(url);
    enabled.forEach((param) => parsed.searchParams.set(param.key, param.value || ""));
    return parsed.toString();
  } catch {
    const query = enabled.map((param) => `${encodeURIComponent(param.key)}=${encodeURIComponent(param.value || "")}`).join("&");
    return url.includes("?") ? `${url}&${query}` : `${url}?${query}`;
  }
}

function applyAuth(request, scopes) {
  request.headers ||= [];
  request.params ||= [];
  const auth = request.auth || { type: "none" };
  const token = resolveTemplate(auth.token || "", scopes);
  const username = resolveTemplate(auth.username || "", scopes);
  if (auth.type === "basic") {
    setHeader(request, "Authorization", `Basic ${btoa(`${username}:${token}`)}`);
  }
  if (auth.type === "bearer" || auth.type === "jwt") {
    setHeader(request, "Authorization", `Bearer ${token}`);
  }
  if (auth.type === "apiKey") {
    if (auth.placement === "query") request.params.push(makeVariable(username || "api_key", token));
    else setHeader(request, username || "X-API-Key", token);
  }
  if (["oauth2", "oidc", "digest", "awsSigV4", "mTLS", "ntlm", "kerberos"].includes(auth.type)) {
    request.authRuntimeNote = `${auth.type} is configured in .cpd and requires token material or the local agent for full enterprise negotiation.`;
  }
}

function setHeader(request, key, value) {
  const existing = request.headers.find((item) => item.key.toLowerCase() === key.toLowerCase());
  if (existing) existing.value = value;
  else request.headers.push(makeVariable(key, value));
}

async function sendCurrentRequest(dataVars = {}) {
  const source = currentRequest();
  const result = await executeRequest(source, dataVars);
  ui.lastResponse = result.response;
  addHistory(source, result);
  renderResponse();
  renderTree();
  return result;
}

async function executeRequest(sourceRequest, dataVars = {}) {
  const started = performance.now();
  let prepared;
  try {
    prepared = prepareRequest(sourceRequest, { runScripts: true, dataVars });
  } catch (error) {
    return failedExecution(sourceRequest, error, started);
  }
  const request = prepared.request;
  if (!["REST", "GraphQL"].includes(request.protocol)) {
    return executeRealtimeProtocol(sourceRequest, request, started, prepared.scopes);
  }
  const headers = headersObject(request.headers);
  let body;
  if (!["GET", "HEAD"].includes(request.method) && request.bodyType !== "none") {
    if (request.bodyType === "binary" && ui.binaryFile) body = ui.binaryFile;
    else body = request.body || "";
    if (request.bodyType === "json" && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    if (request.bodyType === "graphql" && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    if (request.bodyType === "xml" && !headers["Content-Type"]) headers["Content-Type"] = "application/xml";
    if (request.bodyType === "protobuf" && !headers["Content-Type"]) headers["Content-Type"] = "application/x-protobuf";
  }
  try {
    const fetchOptions = {
      method: request.protocol === "GraphQL" ? "POST" : request.method,
      headers,
      body,
      redirect: "follow"
    };
    const response = await fetch(request.url, fetchOptions);
    const arrayBuffer = await response.arrayBuffer();
    const bodyText = decodeBody(arrayBuffer, response.headers.get("content-type") || "");
    const responseModel = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      redirected: response.redirected,
      headers: Array.from(response.headers.entries()).map(([key, value]) => ({ key, value })),
      bodyText,
      size: arrayBuffer.byteLength,
      timings: { startedAt: new Date(Date.now() - (performance.now() - started)).toISOString(), total: performance.now() - started },
      binaryPreview: makeBinaryPreview(arrayBuffer),
      tests: []
    };
    const testContext = makeScriptContext(request, responseModel, prepared.scopes);
    runScript(sourceRequest.scripts.postResponse || "", testContext, "post-response");
    responseModel.tests = testContext.tests;
    updateVariablesFromContext(testContext);
    saveWorkspaceLocal();
    return { request, response: responseModel, passed: responseModel.tests.every((test) => test.pass !== false), error: null };
  } catch (error) {
    return failedExecution(sourceRequest, error, started, request);
  }
}

function failedExecution(sourceRequest, error, started, preparedRequest = null) {
  const response = {
    ok: false,
    status: 0,
    statusText: "Execution failed",
    error: error.message,
    headers: [],
    bodyText: [
      error.message,
      "",
      "Browser execution is subject to CORS, certificate, client-certificate, cookie, NTLM/Kerberos, and private-network restrictions.",
      "Use the CurlPostDock CLI/agent for CI runs, local mocks, and enterprise network execution."
    ].join("\n"),
    size: 0,
    timings: { total: performance.now() - started },
    tests: [{ name: "request executed", pass: false, message: error.message }]
  };
  return { request: preparedRequest || sourceRequest, response, passed: false, error };
}

function executeRealtimeProtocol(sourceRequest, request, started, scopes) {
  if (request.protocol === "WebSocket") {
    return new Promise((resolve) => {
      const messages = [];
      let socket;
      const timeout = setTimeout(() => {
        socket?.close();
        resolve(protocolResponse(sourceRequest, request, started, `Connected. Messages:\n${messages.join("\n") || "(none before timeout)"}`, true, scopes));
      }, 3000);
      try {
        socket = new WebSocket(request.url);
        socket.onopen = () => {
          if (request.body) socket.send(request.body);
        };
        socket.onmessage = (event) => messages.push(String(event.data));
        socket.onerror = () => {
          clearTimeout(timeout);
          resolve(protocolResponse(sourceRequest, request, started, "WebSocket error. Check URL, certificates, or network policy.", false, scopes));
        };
        socket.onclose = () => {
          clearTimeout(timeout);
          resolve(protocolResponse(sourceRequest, request, started, `Closed. Messages:\n${messages.join("\n")}`, true, scopes));
        };
      } catch (error) {
        clearTimeout(timeout);
        resolve(protocolResponse(sourceRequest, request, started, error.message, false, scopes));
      }
    });
  }
  if (request.protocol === "SSE") {
    return new Promise((resolve) => {
      const messages = [];
      let source;
      const timeout = setTimeout(() => {
        source?.close();
        resolve(protocolResponse(sourceRequest, request, started, `SSE events:\n${messages.join("\n") || "(none before timeout)"}`, true, scopes));
      }, 3000);
      try {
        source = new EventSource(request.url);
        source.onmessage = (event) => messages.push(event.data);
        source.onerror = () => {
          source.close();
          clearTimeout(timeout);
          resolve(protocolResponse(sourceRequest, request, started, messages.join("\n") || "SSE connection closed or blocked.", messages.length > 0, scopes));
        };
      } catch (error) {
        clearTimeout(timeout);
        resolve(protocolResponse(sourceRequest, request, started, error.message, false, scopes));
      }
    });
  }
  const bridgeNote = `${request.protocol} request saved in .cpd. Full execution needs the CurlPostDock desktop/agent bridge because browsers do not expose native ${request.protocol} transport, enterprise certificates, or raw sockets.`;
  return Promise.resolve(protocolResponse(sourceRequest, request, started, bridgeNote, false, scopes));
}

function protocolResponse(sourceRequest, request, started, bodyText, ok, scopes) {
  const response = {
    ok,
    status: ok ? 101 : 501,
    statusText: ok ? request.protocol : "Bridge required",
    headers: [],
    bodyText,
    size: bodyText.length,
    timings: { total: performance.now() - started },
    tests: []
  };
  const context = makeScriptContext(request, response, scopes);
  runScript(sourceRequest.scripts.postResponse || "", context, "post-response");
  response.tests = context.tests;
  return { request, response, passed: ok && response.tests.every((test) => test.pass !== false), error: ok ? null : new Error(bodyText) };
}

function headersObject(items) {
  const headers = {};
  for (const item of items || []) {
    if (item.enabled === false || !item.key) continue;
    if (item.key.toLowerCase() === "cookie") continue;
    headers[item.key] = item.value || "";
  }
  return headers;
}

function makeScriptContext(request, response, scopes) {
  const logs = [];
  const tests = [];
  const vars = clone(scopes);
  const cpd = {
    request,
    response,
    vars,
    logs,
    tests,
    uuid: () => dynamicVariable("$uuid"),
    timestamp: () => Date.now(),
    randomInt: (max = 1000000) => Math.floor(Math.random() * max),
    setEnv: (key, value) => {
      const env = currentEnvironment();
      if (!env) return;
      upsertKv(env.values, key, value);
    },
    setGlobal: (key, value) => upsertKv(workspace.globals, key, value),
    setRequestVar: (key, value) => upsertKv(currentRequest().variables, key, value),
    test: (name, fn) => {
      try {
        fn();
        tests.push({ name, pass: true });
      } catch (error) {
        tests.push({ name, pass: false, message: error.message });
      }
    },
    expect: makeExpectation,
    hmacPlaceholder: (value) => `local-signature-placeholder:${btoa(String(value)).slice(0, 24)}`
  };
  const pm = {
    test: cpd.test,
    expect: cpd.expect,
    environment: {
      get: (key) => vars.environment[key],
      set: cpd.setEnv
    },
    globals: {
      get: (key) => vars.global[key],
      set: cpd.setGlobal
    },
    variables: {
      get: (key) => vars.request[key] ?? vars.collection[key] ?? vars.environment[key] ?? vars.global[key],
      set: cpd.setRequestVar
    },
    request,
    response: {
      code: response?.status,
      status: response?.statusText,
      headers: response?.headers || [],
      text: () => response?.bodyText || "",
      json: () => JSON.parse(response?.bodyText || "{}")
    }
  };
  return { cpd, pm, request, response, vars, logs, tests };
}

function runScript(code, context, label) {
  if (!code?.trim()) return;
  const localConsole = {
    log: (...args) => context.logs.push(args.map(String).join(" ")),
    warn: (...args) => context.logs.push(`WARN ${args.map(String).join(" ")}`),
    error: (...args) => context.logs.push(`ERROR ${args.map(String).join(" ")}`)
  };
  try {
    const fn = new Function("cpd", "pm", "request", "response", "vars", "console", code);
    fn(context.cpd, context.pm, context.request, context.response, context.vars, localConsole);
  } catch (error) {
    context.tests.push({ name: `${label} script`, pass: false, message: error.message });
  }
}

function makeExpectation(actual) {
  const api = {
    to: {
      equal: (expected) => {
        if (actual !== expected) throw new Error(`Expected ${actual} to equal ${expected}`);
      },
      include: (expected) => {
        if (!String(actual).includes(expected)) throw new Error(`Expected ${actual} to include ${expected}`);
      },
      be: {
        below: (expected) => {
          if (!(actual < expected)) throw new Error(`Expected ${actual} below ${expected}`);
        },
        above: (expected) => {
          if (!(actual > expected)) throw new Error(`Expected ${actual} above ${expected}`);
        },
        oneOf: (values) => {
          if (!values.includes(actual)) throw new Error(`Expected ${actual} in ${values.join(", ")}`);
        }
      },
      have: {
        property: (key) => {
          if (!actual || !Object.prototype.hasOwnProperty.call(actual, key)) throw new Error(`Expected property ${key}`);
        }
      },
      exist: () => {
        if (actual === null || actual === undefined) throw new Error("Expected value to exist");
      }
    }
  };
  api.to.be.lessThan = api.to.be.below;
  return api;
}

function updateVariablesFromContext(context) {
  if (!context) return;
  saveWorkspaceLocal();
}

function upsertKv(items, key, value) {
  const existing = items.find((item) => item.key === key);
  if (existing) existing.value = String(value);
  else items.push(makeVariable(key, String(value)));
}

function addHistory(sourceRequest, result) {
  workspace.history.unshift({
    id: uid("hist"),
    requestId: sourceRequest.id,
    name: sourceRequest.name,
    method: sourceRequest.method,
    protocol: sourceRequest.protocol,
    url: result.request.url,
    status: result.response.status,
    at: nowIso(),
    response: result.response
  });
  workspace.history = workspace.history.slice(0, 100);
  saveWorkspaceLocal();
}

async function runScope(scope) {
  const requests = getRequestsForScope(scope);
  const dataRows = parseRunnerData();
  const runItems = [];
  for (const request of requests) {
    if (dataRows.length) dataRows.forEach((data) => runItems.push({ request, data }));
    else runItems.push({ request, data: {} });
  }
  const parallel = $("#parallelRun").checked;
  const retry = $("#retryFailed").checked;
  const stopOnFailure = $("#stopOnFailure").checked;
  ui.lastRun = [];
  renderRunnerResults();
  if (parallel) {
    ui.lastRun = await Promise.all(runItems.map((item) => executeWithRetry(item.request, item.data, retry)));
  } else {
    for (const item of runItems) {
      const result = await executeWithRetry(item.request, item.data, retry);
      ui.lastRun.push(result);
      renderRunnerResults();
      if (stopOnFailure && !result.passed) break;
    }
  }
  workspace.reports.unshift({ id: uid("report"), at: nowIso(), results: ui.lastRun.map(summarizeRunResult) });
  workspace.reports = workspace.reports.slice(0, 20);
  ui.lastResponse = ui.lastRun.at(-1)?.response || ui.lastResponse;
  saveWorkspaceLocal();
  renderRunnerResults();
  renderResponse();
}

async function executeWithRetry(request, data, retry) {
  let result = await executeRequest(request, data);
  if (retry && !result.passed) {
    result = await executeRequest(request, data);
    result.retried = true;
  }
  return result;
}

function getRequestsForScope(scope) {
  if (scope === "request") return [currentRequest()].filter(Boolean);
  if (scope === "collection") return currentCollection()?.requests || [];
  return workspace.collections.flatMap((collection) => collection.requests);
}

function parseRunnerData() {
  const raw = $("#runnerData").value.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    $("#runnerResults").innerHTML = `<div class="result-row fail">Data JSON error: ${escapeHtml(error.message)}</div>`;
    return [];
  }
}

function renderRunnerResults() {
  const root = $("#runnerResults");
  if (!ui.lastRun.length) {
    root.innerHTML = `<div class="result-row">No run results yet</div>`;
    return;
  }
  root.innerHTML = ui.lastRun.map((result) => {
    const tests = result.response.tests || [];
    const failed = tests.filter((test) => test.pass === false);
    return [
      `<div class="result-row ${result.passed ? "pass" : "fail"}">`,
      `<strong>${escapeHtml(result.request.name)} ${result.response.status}</strong>`,
      `<span>${Math.round(result.response.timings?.total || 0)} ms ${result.retried ? "retried" : ""}</span>`,
      `<small>${failed.length ? failed.map((test) => `${test.name}: ${test.message}`).join("; ") : `${tests.length} tests passed`}</small>`,
      `</div>`
    ].join("");
  }).join("");
}

function summarizeRunResult(result) {
  return {
    name: result.request.name,
    method: result.request.method,
    url: result.request.url,
    status: result.response.status,
    passed: result.passed,
    durationMs: Math.round(result.response.timings?.total || 0),
    tests: result.response.tests || []
  };
}

async function exportReportMenu() {
  if (!ui.lastRun.length) await runScope($("#runnerScope").value);
  const format = prompt("Report format: json, junit, html, sarif", "json");
  if (!format) return;
  const normalized = format.toLowerCase();
  const report = buildReport(normalized, ui.lastRun);
  downloadText(`curlpostdock-report.${report.extension}`, report.content, report.mime);
}

function buildReport(format, results) {
  const summary = results.map(summarizeRunResult);
  if (format === "junit" || format === "xml") {
    const tests = summary.flatMap((result) => result.tests.length ? result.tests.map((test) => ({ result, test })) : [{ result, test: { name: "request executed", pass: result.passed } }]);
    const failures = tests.filter(({ test }) => test.pass === false).length;
    const body = tests.map(({ result, test }) => {
      const failure = test.pass === false ? `<failure message="${escapeAttr(test.message || "failed")}"></failure>` : "";
      return `<testcase classname="${escapeAttr(result.name)}" name="${escapeAttr(test.name)}" time="${result.durationMs / 1000}">${failure}</testcase>`;
    }).join("");
    return { extension: "xml", mime: "application/xml", content: `<?xml version="1.0" encoding="UTF-8"?><testsuite tests="${tests.length}" failures="${failures}">${body}</testsuite>` };
  }
  if (format === "html") {
    const rows = summary.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.status}</td><td>${item.passed ? "PASS" : "FAIL"}</td><td>${item.durationMs}</td></tr>`).join("");
    return { extension: "html", mime: "text/html", content: `<!doctype html><title>CurlPostDock Report</title><table><thead><tr><th>Name</th><th>Status</th><th>Result</th><th>ms</th></tr></thead><tbody>${rows}</tbody></table>` };
  }
  if (format === "sarif") {
    const sarif = {
      version: "2.1.0",
      runs: [{
        tool: { driver: { name: "CurlPostDock", informationUri: "local://curlpostdock" } },
        results: summary.filter((item) => !item.passed).map((item) => ({
          ruleId: "api-test-failed",
          level: "error",
          message: { text: `${item.name} failed with status ${item.status}` }
        }))
      }]
    };
    return { extension: "sarif", mime: "application/sarif+json", content: JSON.stringify(sarif, null, 2) };
  }
  return { extension: "json", mime: "application/json", content: JSON.stringify({ app: "CurlPostDock", generatedAt: nowIso(), summary }, null, 2) };
}

function buildPortableWorkspace() {
  const doc = clone(workspace);
  doc.format = CPD_FORMAT;
  doc.version = CPD_VERSION;
  doc.app = "CurlPostDock";
  doc.sync.cloudSyncAllowed = false;
  doc.updatedAt = nowIso();
  return doc;
}

async function downloadWorkspace(encrypted) {
  const doc = buildPortableWorkspace();
  if (!encrypted) {
    downloadText(`${safeFileName(doc.name)}.cpd`, JSON.stringify(doc, null, 2), "application/json");
    return;
  }
  const passphrase = await promptText("Encryption passphrase", "");
  if (!passphrase) return;
  try {
    const encryptedDoc = await encryptJson(doc, passphrase);
    downloadText(`${safeFileName(doc.name)}.encrypted.cpd`, JSON.stringify(encryptedDoc, null, 2), "application/json");
  } catch (error) {
    alert(`Encrypted export failed: ${error.message}`);
  }
}

function downloadCurrentRequest() {
  const collection = currentCollection();
  const request = currentRequest();
  const doc = {
    format: `${CPD_FORMAT}.request`,
    version: CPD_VERSION,
    exportedAt: nowIso(),
    collection: collection?.name,
    request
  };
  downloadText(`${safeFileName(request.name)}.cpd`, JSON.stringify(doc, null, 2), "application/json");
}

async function importFiles(fileList) {
  const files = Array.from(fileList || []);
  for (const file of files) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      await importBrunoZip(file);
      continue;
    }
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".bru")) {
      importBruText(text, file.name);
      continue;
    }
    await importStructuredText(text, file.name);
  }
  saveWorkspaceLocal();
  render();
}

async function importStructuredText(text, name) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const curl = parseCurl(text);
    if (curl) {
      importParsedRequest(curl, name);
      return;
    }
    throw new Error(`Unsupported file: ${name}`);
  }
  if (parsed.format === "cpd.encrypted") {
    const passphrase = await promptText("Decrypt .cpd passphrase", "");
    if (!passphrase) return;
    parsed = await decryptJson(parsed, passphrase);
  }
  if (parsed.format === CPD_FORMAT) {
    normalizeWorkspace(parsed);
    workspace = parsed;
    saveWorkspaceLocal();
    return;
  }
  if (parsed.format === `${CPD_FORMAT}.request`) {
    importParsedRequest(parsed.request, parsed.request?.name || name);
    return;
  }
  if (parsed.info?.schema?.includes("postman")) return importPostmanCollection(parsed);
  if (parsed._postman_variable_scope === "environment") return importPostmanEnvironment(parsed);
  if (parsed.openapi || parsed.swagger) return importOpenApi(parsed);
  if (parsed.log?.entries) return importHar(parsed);
  if (Array.isArray(parsed.resources)) return importInsomnia(parsed);
  throw new Error(`Unknown JSON import type: ${name}`);
}

function importParsedRequest(request, name) {
  normalizeRequest(request);
  request.id = uid("req");
  request.name ||= name.replace(/\.[^.]+$/, "");
  const collection = currentCollection() || workspace.collections[0];
  collection.requests.push(request);
  ui.selectedRequestId = request.id;
}

function importPostmanEnvironment(env) {
  workspace.environments.push({
    id: uid("env"),
    name: env.name || "Postman Environment",
    values: (env.values || []).map((item) => makeVariable(item.key, item.value, item.enabled !== false, item.type === "secret"))
  });
  workspace.activeEnvironmentId = workspace.environments.at(-1).id;
}

function importPostmanCollection(doc) {
  const collection = { id: uid("col"), name: doc.info?.name || "Postman Import", variables: [], scripts: {}, requests: [] };
  const walk = (items, folderPath = []) => {
    for (const item of items || []) {
      if (item.item) {
        walk(item.item, [...folderPath, item.name || "folder"]);
        continue;
      }
      const req = item.request || {};
      const url = typeof req.url === "string" ? req.url : req.url?.raw || "";
      const request = makeRequest(item.name || req.name || "Postman request", req.method || "GET", url);
      request.folderPath = folderPath;
      request.headers = (req.header || []).map((header) => makeVariable(header.key, header.value, !header.disabled));
      request.bodyType = req.body?.mode === "raw" ? inferBodyType(req.body?.raw || "") : (req.body?.mode || "none");
      request.body = req.body?.raw || "";
      request.auth.type = mapPostmanAuth(req.auth?.type);
      collection.requests.push(request);
    }
  };
  walk(doc.item || []);
  workspace.collections.push(collection);
  ui.selectedRequestId = collection.requests[0]?.id || ui.selectedRequestId;
}

function importOpenApi(doc) {
  const collection = { id: uid("col"), name: doc.info?.title || "OpenAPI Import", variables: [], scripts: {}, requests: [] };
  const baseUrl = doc.servers?.[0]?.url || (doc.host ? `${doc.schemes?.[0] || "https"}://${doc.host}${doc.basePath || ""}` : "");
  for (const [path, operations] of Object.entries(doc.paths || {})) {
    for (const [method, operation] of Object.entries(operations)) {
      if (!HTTP_METHODS.includes(method.toUpperCase())) continue;
      const request = makeRequest(operation.operationId || operation.summary || `${method.toUpperCase()} ${path}`, method.toUpperCase(), `${baseUrl}${path}`);
      request.folderPath = (operation.tags || ["OpenAPI"]).slice(0, 3);
      request.params = (operation.parameters || []).filter((param) => param.in === "query").map((param) => makeVariable(param.name, param.example || ""));
      request.pathParams = (operation.parameters || []).filter((param) => param.in === "path").map((param) => makeVariable(param.name, param.example || ""));
      request.bodyType = operation.requestBody ? "json" : "none";
      request.scripts.postResponse = generateTestsFromOpenApiOperation(operation);
      collection.requests.push(request);
    }
  }
  workspace.collections.push(collection);
  ui.selectedRequestId = collection.requests[0]?.id || ui.selectedRequestId;
}

function importHar(doc) {
  const collection = { id: uid("col"), name: "HAR Import", variables: [], scripts: {}, requests: [] };
  for (const entry of doc.log.entries || []) {
    const har = entry.request;
    const request = makeRequest(`${har.method} ${new URL(har.url).pathname}`, har.method, har.url);
    request.headers = (har.headers || []).map((header) => makeVariable(header.name, header.value));
    request.params = (har.queryString || []).map((param) => makeVariable(param.name, param.value));
    request.body = har.postData?.text || "";
    request.bodyType = inferBodyType(request.body);
    collection.requests.push(request);
  }
  workspace.collections.push(collection);
  ui.selectedRequestId = collection.requests[0]?.id || ui.selectedRequestId;
}

function importInsomnia(doc) {
  const collection = { id: uid("col"), name: "Insomnia Import", variables: [], scripts: {}, requests: [] };
  const folders = new Map(doc.resources.filter((item) => item._type === "request_group").map((item) => [item._id, item.name]));
  for (const item of doc.resources.filter((entry) => entry._type === "request")) {
    const request = makeRequest(item.name, item.method || "GET", item.url || "");
    request.folderPath = item.parentId && folders.has(item.parentId) ? [folders.get(item.parentId)] : [];
    request.headers = (item.headers || []).map((header) => makeVariable(header.name, header.value, !header.disabled));
    request.body = item.body?.text || "";
    request.bodyType = inferBodyType(request.body);
    collection.requests.push(request);
  }
  workspace.collections.push(collection);
  ui.selectedRequestId = collection.requests[0]?.id || ui.selectedRequestId;
}

async function importBrunoZip(file) {
  if (!file) return;
  try {
    const entries = await readZipEntries(file);
    const imported = importBrunoEntries(entries);
    $("#requestStatusText").textContent = `Imported ${imported.requests} Bruno requests from ${file.name}`;
    saveWorkspaceLocal();
    render();
  } catch (error) {
    alert(`Bruno import failed: ${error.message}`);
  }
}

function importBrunoEntries(entries) {
  const bruEntries = entries.filter((entry) => entry.name.endsWith(".bru") && !entry.name.includes("__MACOSX/"));
  const envEntries = entries.filter((entry) => entry.name.endsWith(".postman_environment.json") && !entry.name.includes("__MACOSX/"));
  const byCollection = new Map();
  for (const entry of bruEntries) {
    const parts = entry.name.split("/").filter(Boolean);
    if (parts.at(-1) === "collection.bru") continue;
    const collectionName = parts.length > 2 ? parts[1] : "Bruno Import";
    if (!byCollection.has(collectionName)) {
      byCollection.set(collectionName, { id: uid("col"), name: collectionName, variables: [], scripts: {}, requests: [] });
    }
    const request = parseBru(entry.text, parts.at(-1).replace(/\.bru$/, ""));
    request.folderPath = parts.slice(2, -1);
    byCollection.get(collectionName).requests.push(request);
  }
  for (const envEntry of envEntries) {
    try {
      importPostmanEnvironment(JSON.parse(envEntry.text));
    } catch (error) {
      console.warn("Skipped environment", envEntry.name, error);
    }
  }
  const collections = Array.from(byCollection.values()).filter((collection) => collection.requests.length);
  workspace.collections.push(...collections);
  if (collections[0]?.requests[0]) ui.selectedRequestId = collections[0].requests[0].id;
  return { collections: collections.length, requests: collections.reduce((sum, collection) => sum + collection.requests.length, 0) };
}

function importBruText(text, name) {
  const request = parseBru(text, name.replace(/\.bru$/, ""));
  const collection = currentCollection() || workspace.collections[0];
  collection.requests.push(request);
  ui.selectedRequestId = request.id;
}

function parseBru(text, fallbackName) {
  const blocks = collectBruBlocks(text);
  const meta = parsePairs(blocks.find((block) => block.name === "meta")?.content || "");
  const methodBlock = blocks.find((block) => HTTP_METHODS.includes(block.name.toUpperCase()));
  const methodFields = parsePairs(methodBlock?.content || "");
  const request = makeRequest(meta.name || fallbackName || "Bruno request", methodBlock?.name.toUpperCase() || "GET", methodFields.url || "");
  request.protocol = meta.type === "graphql" ? "GraphQL" : "REST";
  request.bodyType = methodFields.body && methodFields.body !== "none" ? methodFields.body : "none";
  request.auth.type = mapBrunoAuth(methodFields.auth || "none");
  request.params = parsePairsAsKv(blocks.find((block) => block.name === "params:query")?.content || "");
  request.headers = parsePairsAsKv(blocks.find((block) => block.name === "headers")?.content || "");
  request.cookies = parsePairsAsKv(blocks.find((block) => block.name === "cookies")?.content || "");
  const bodyBlock = blocks.find((block) => block.name.startsWith("body:"));
  if (bodyBlock) {
    request.bodyType = bodyBlock.name.split(":")[1] || request.bodyType;
    request.body = bodyBlock.content.trim();
  }
  return request;
}

function collectBruBlocks(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^\s*([A-Za-z0-9_:-]+)\s*\{\s*$/);
    if (!match) continue;
    const name = match[1];
    const content = [];
    let depth = 1;
    for (i += 1; i < lines.length; i += 1) {
      const line = lines[i];
      depth += countBracesOutsideStrings(line);
      if (depth <= 0) break;
      content.push(line);
    }
    blocks.push({ name, content: content.join("\n") });
  }
  return blocks;
}

function countBracesOutsideStrings(line) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (const char of line) {
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') inString = !inString;
    if (!inString && char === "{") depth += 1;
    if (!inString && char === "}") depth -= 1;
  }
  return depth;
}

function parsePairs(content) {
  const obj = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf(":");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    obj[key] = value;
  }
  return obj;
}

function parsePairsAsKv(content) {
  return Object.entries(parsePairs(content)).map(([key, value]) => makeVariable(key, value));
}

async function readZipEntries(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  let eocd = -1;
  for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 66000); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd === -1) throw new Error("Could not find zip central directory");
  const count = view.getUint16(eocd + 10, true);
  let centralOffset = view.getUint32(eocd + 16, true);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) throw new Error("Invalid zip central header");
    const compression = view.getUint16(centralOffset + 10, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const fileNameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const nameBytes = new Uint8Array(buffer, centralOffset + 46, fileNameLength);
    const name = decoder.decode(nameBytes);
    centralOffset += 46 + fileNameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`Invalid local header for ${name}`);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    let data;
    if (compression === 0) {
      data = compressed;
    } else if (compression === 8) {
      if (!("DecompressionStream" in window)) throw new Error("This browser cannot decompress zip entries");
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      data = await new Response(stream).arrayBuffer();
    } else {
      throw new Error(`Unsupported zip compression ${compression} in ${name}`);
    }
    entries.push({ name, text: decoder.decode(data) });
  }
  return entries;
}

function parseCurl(input) {
  const tokens = shellTokens(input.trim());
  if (!tokens.length || tokens[0] !== "curl") return null;
  const request = makeRequest("Imported cURL", "GET", "");
  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "-X" || token === "--request") {
      request.method = (tokens[++i] || "GET").toUpperCase();
    } else if (token === "-H" || token === "--header") {
      const [key, value] = splitHeader(tokens[++i] || "");
      if (key) request.headers.push(makeVariable(key, value));
    } else if (["-d", "--data", "--data-raw", "--data-binary", "--data-urlencode"].includes(token)) {
      request.body = tokens[++i] || "";
      request.bodyType = inferBodyType(request.body);
      if (request.method === "GET") request.method = "POST";
    } else if (token === "-u" || token === "--user") {
      const [username, password] = (tokens[++i] || "").split(":");
      request.auth = { ...request.auth, type: "basic", username, token: password || "" };
    } else if (!token.startsWith("-")) {
      request.url = token;
    }
  }
  return request.url ? request : null;
}

function shellTokens(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escape = false;
  for (const char of command) {
    if (escape) {
      current += char;
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

function splitHeader(header) {
  const index = header.indexOf(":");
  if (index === -1) return [header.trim(), ""];
  return [header.slice(0, index).trim(), header.slice(index + 1).trim()];
}

async function importCurlDialog() {
  const input = await promptText("Paste cURL command", "curl -X GET https://example.com");
  if (!input) return;
  const request = parseCurl(input);
  if (!request) {
    alert("Could not parse cURL command");
    return;
  }
  const current = currentRequest();
  Object.assign(current, request, { id: current.id, name: current.name || request.name, updatedAt: nowIso() });
  saveWorkspaceLocal();
  render();
}

function generateCurl(request) {
  const parts = ["curl"];
  parts.push("-X", shellQuote(request.protocol === "GraphQL" ? "POST" : request.method || "GET"));
  parts.push(shellQuote(request.url || ""));
  for (const header of request.headers || []) {
    if (header.enabled === false || !header.key) continue;
    parts.push("-H", shellQuote(`${header.key}: ${header.value || ""}`));
  }
  if (!["GET", "HEAD"].includes(request.method) && request.bodyType !== "none" && request.body) {
    parts.push("--data-raw", shellQuote(request.body));
  }
  return parts.join(" ");
}

function generateSnippet(language, request) {
  const curl = generateCurl(request);
  const headers = headersObject(request.headers);
  const body = request.body && !["GET", "HEAD"].includes(request.method) ? request.body : null;
  if (language === "curl") return curl;
  if (language === "javascript") {
    return [
      `const response = await fetch(${JSON.stringify(request.url)}, {`,
      `  method: ${JSON.stringify(request.protocol === "GraphQL" ? "POST" : request.method)},`,
      `  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, "\n  ")},`,
      body ? `  body: ${JSON.stringify(body)}` : "",
      `});`,
      `console.log(await response.text());`
    ].filter(Boolean).join("\n");
  }
  if (language === "node") {
    return [
      `const response = await fetch(${JSON.stringify(request.url)}, {`,
      `  method: ${JSON.stringify(request.protocol === "GraphQL" ? "POST" : request.method)},`,
      `  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, "\n  ")},`,
      body ? `  body: ${JSON.stringify(body)}` : "",
      `});`,
      `console.log(response.status, await response.text());`
    ].filter(Boolean).join("\n");
  }
  if (language === "python") {
    return [
      "import requests",
      `response = requests.request(${JSON.stringify(request.method)}, ${JSON.stringify(request.url)},`,
      `    headers=${JSON.stringify(headers, null, 4)},`,
      body ? `    data=${JSON.stringify(body)})` : "    data=None)",
      "print(response.status_code)",
      "print(response.text)"
    ].join("\n");
  }
  if (language === "java") {
    const headerLines = Object.entries(headers).map(([key, value]) => `    .header(${JSON.stringify(key)}, ${JSON.stringify(value)})`).join("\n");
    return [
      "HttpClient client = HttpClient.newHttpClient();",
      "HttpRequest request = HttpRequest.newBuilder()",
      `    .uri(URI.create(${JSON.stringify(request.url)}))`,
      headerLines,
      body ? `    .method(${JSON.stringify(request.method)}, HttpRequest.BodyPublishers.ofString(${JSON.stringify(body)}))` : `    .method(${JSON.stringify(request.method)}, HttpRequest.BodyPublishers.noBody())`,
      "    .build();",
      "HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());",
      "System.out.println(response.statusCode());",
      "System.out.println(response.body());"
    ].filter(Boolean).join("\n");
  }
  if (language === "go") {
    const headerLines = Object.entries(headers).map(([key, value]) => `req.Header.Set(${JSON.stringify(key)}, ${JSON.stringify(value)})`).join("\n");
    return [
      "client := &http.Client{}",
      body ? `body := strings.NewReader(${JSON.stringify(body)})` : "body := http.NoBody",
      `req, _ := http.NewRequest(${JSON.stringify(request.method)}, ${JSON.stringify(request.url)}, body)`,
      headerLines,
      "resp, err := client.Do(req)",
      "if err != nil { panic(err) }",
      "defer resp.Body.Close()"
    ].filter(Boolean).join("\n");
  }
  return curl;
}

async function copyCurl() {
  const prepared = prepareRequest(currentRequest(), { runScripts: false });
  await navigator.clipboard.writeText(generateCurl(prepared.request));
  $("#requestStatusText").textContent = "cURL copied";
}

async function copySnippet() {
  await navigator.clipboard.writeText($("#snippetViewer").textContent);
}

function generateOfflineTests() {
  const type = $("#aiSourceType").value;
  const source = $("#aiSource").value.trim();
  let generated = "";
  if (type === "openapi") {
    try {
      const doc = JSON.parse(source);
      generated = Object.entries(doc.paths || {}).flatMap(([path, ops]) =>
        Object.entries(ops).filter(([method]) => HTTP_METHODS.includes(method.toUpperCase())).map(([method, operation]) =>
          `// ${method.toUpperCase()} ${path}\n${generateTestsFromOpenApiOperation(operation)}`
        )
      ).join("\n\n");
    } catch (error) {
      generated = `Could not parse OpenAPI JSON: ${error.message}`;
    }
  } else {
    generated = heuristicTestsFromText(source, type);
  }
  $("#aiOutput").textContent = generated || "No tests generated.";
  const request = currentRequest();
  if (generated && !generated.startsWith("Could not")) {
    request.scripts.postResponse = generated;
    updateRequest({ scripts: request.scripts });
    renderEditor();
  }
}

function generateTestsFromOpenApiOperation(operation = {}) {
  const successCode = Object.keys(operation.responses || {}).find((code) => /^2\d\d$/.test(code)) || "200";
  const tests = [
    `cpd.test('status is ${successCode}', () => {`,
    `  cpd.expect(response.status).to.equal(${Number(successCode)});`,
    `});`
  ];
  if (operation.responses?.[successCode]?.content?.["application/json"]) {
    tests.push(
      "",
      "cpd.test('response is valid JSON', () => {",
      "  JSON.parse(response.bodyText);",
      "});"
    );
  }
  return tests.join("\n");
}

function heuristicTestsFromText(source, type) {
  const expectedStatus = source.match(/\b([245]\d\d)\b/)?.[1] || (type === "failure" ? "500" : "200");
  const keywords = Array.from(new Set((source.match(/\b(error|timeout|token|schema|latency|null|missing|duplicate|unauthorized)\b/gi) || []).map((item) => item.toLowerCase())));
  const tests = [
    `cpd.test('status matches ${type} expectation', () => {`,
    `  cpd.expect(response.status).to.equal(${Number(expectedStatus)});`,
    `});`
  ];
  if (keywords.includes("schema") || keywords.includes("missing") || keywords.includes("null")) {
    tests.push("", "cpd.test('body has no unresolved null placeholders', () => {", "  cpd.expect(response.bodyText.includes('{{')).to.equal(false);", "});");
  }
  if (keywords.includes("latency") || keywords.includes("timeout")) {
    tests.push("", "cpd.test('response completes within 2000 ms', () => {", "  cpd.expect(response.timings.total).to.be.below(2000);", "});");
  }
  if (keywords.includes("token") || keywords.includes("unauthorized")) {
    tests.push("", "cpd.test('auth error is explicit', () => {", "  cpd.expect([200, 201, 204, 401, 403]).to.include(response.status);", "});");
  }
  return tests.join("\n");
}

function generateMockRules() {
  const collection = currentCollection();
  if (!collection) return;
  const rules = collection.requests.map((request) => {
    let path = "/";
    try {
      path = new URL(resolveTemplate(request.url, buildVariableScopes(request, collection))).pathname;
    } catch {
      path = request.url || "/";
    }
    return {
      id: uid("mock"),
      name: request.name,
      method: request.method,
      path,
      status: request.method === "POST" ? 201 : 200,
      latencyMs: $("#mockLatency").checked ? 250 : 0,
      errorRate: $("#mockErrors").checked ? 0.1 : 0,
      rateLimitPerMinute: $("#mockRateLimit").checked ? 60 : null,
      stateful: $("#mockStateful").checked,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mock: true, name: request.name, generatedAt: nowIso() }, null, 2)
    };
  });
  workspace.mocks = rules;
  saveWorkspaceLocal();
  $("#mockOutput").textContent = [
    JSON.stringify(rules, null, 2),
    "",
    "Run locally:",
    "node cli/cpd-agent.mjs mock <workspace.cpd> --port 8787"
  ].join("\n");
}

function validatePolicy() {
  try {
    const policy = JSON.parse($("#policyEditor").value || "{}");
    const issues = [];
    if (policy.cloudSync !== "disabled") issues.push("cloudSync must remain disabled unless encrypted sync is explicitly approved.");
    if (!Array.isArray(policy.forbiddenHeaders)) issues.push("forbiddenHeaders should be an array.");
    if (!workspace.security.vaultUri && workspace.environments.some((env) => env.values?.some((item) => item.secret))) {
      issues.push("Secret variables exist without a bring-your-own-vault URI.");
    }
    $("#policyResult").textContent = issues.length ? issues.map((issue) => `- ${issue}`).join("\n") : "Policy valid for offline zero-trust workspace.";
  } catch (error) {
    $("#policyResult").textContent = `Policy JSON error: ${error.message}`;
  }
}

function inferBodyType(body) {
  const value = (body || "").trim();
  if (!value) return "none";
  if (value.startsWith("{") || value.startsWith("[")) return "json";
  if (value.startsWith("<")) return "xml";
  if (value.includes("query ") || value.includes("mutation ")) return "graphql";
  return "text";
}

function mapPostmanAuth(type) {
  return {
    apikey: "apiKey",
    bearer: "bearer",
    basic: "basic",
    oauth2: "oauth2",
    digest: "digest",
    awsv4: "awsSigV4",
    ntlm: "ntlm"
  }[type] || type || "none";
}

function mapBrunoAuth(type) {
  return { bearer: "bearer", basic: "basic", awsv4: "awsSigV4" }[type] || type || "none";
}

function decodeBody(buffer, contentType) {
  if (/application\/octet-stream|image\/|audio\/|video\//i.test(contentType)) {
    return `[${buffer.byteLength} bytes binary content]`;
  }
  return new TextDecoder().decode(buffer);
}

function prettyBody(response) {
  const body = response.bodyText || "";
  const contentType = response.headers?.find((header) => header.key.toLowerCase() === "content-type")?.value || "";
  if (contentType.includes("json") || body.trim().startsWith("{") || body.trim().startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  if (contentType.includes("xml") || body.trim().startsWith("<")) return formatXml(body);
  return body;
}

function formatXml(xml) {
  return (xml || "")
    .replace(/>\s*</g, ">\n<")
    .split("\n")
    .reduce((lines, line) => {
      const trimmed = line.trim();
      let indent = lines.indent || 0;
      if (/^<\//.test(trimmed)) indent = Math.max(indent - 1, 0);
      lines.push(`${"  ".repeat(indent)}${trimmed}`);
      if (/^<[^!?/][^>]*[^/]?>$/.test(trimmed)) indent += 1;
      lines.indent = indent;
      return lines;
    }, [])
    .join("\n");
}

function formatPairs(pairs) {
  return (pairs || []).map((item) => `${item.key}: ${item.value}`).join("\n") || "No headers exposed.";
}

function extractCookies(headers) {
  return headers.filter((header) => header.key.toLowerCase() === "set-cookie").map((header) => header.value);
}

function makeBinaryPreview(buffer) {
  const bytes = Array.from(new Uint8Array(buffer.slice(0, 64)));
  if (!bytes.length) return "";
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

async function encryptJson(doc, passphrase) {
  if (!crypto.subtle) throw new Error("WebCrypto is not available in this browser context");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(doc));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    format: "cpd.encrypted",
    version: CPD_VERSION,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: 250000,
    salt: base64(salt),
    iv: base64(iv),
    data: base64(new Uint8Array(cipher))
  };
}

async function decryptJson(doc, passphrase) {
  if (!crypto.subtle) throw new Error("WebCrypto is not available in this browser context");
  const salt = fromBase64(doc.salt);
  const iv = fromBase64(doc.iv);
  const key = await deriveKey(passphrase, salt);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, fromBase64(doc.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

async function deriveKey(passphrase, salt) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function base64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function downloadText(fileName, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(value) {
  return String(value || "curlpostdock").replace(/[^a-z0-9_.-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function promptText(title, initialValue) {
  const dialog = $("#promptDialog");
  $("#promptTitle").textContent = title;
  $("#promptText").value = initialValue || "";
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      resolve(dialog.returnValue === "cancel" ? "" : $("#promptText").value);
    }, { once: true });
  });
}

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

bindEvents();
render();
