#!/usr/bin/env node
"use strict";

import { createDecipheriv, pbkdf2Sync, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { performance } from "node:perf_hooks";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"];

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

if (!command || args.help) {
  usage();
  process.exit(command ? 0 : 1);
}

if (command === "run") {
  await runCommand(args);
} else if (command === "mock") {
  await mockCommand(args);
} else if (command === "inspect") {
  await inspectCommand(args);
} else {
  usage();
  process.exit(1);
}

async function runCommand(options) {
  const file = options._[1];
  if (!file) throw new Error("Missing .cpd workspace path");
  const workspace = await loadWorkspace(file, options.passphrase);
  const envName = options.env || workspace.environments?.[0]?.name;
  const requests = getRequests(workspace, options.scope || "all", options.collection, options.request);
  const dataRows = options.data ? JSON.parse(await readFile(options.data, "utf8")) : [{}];
  const rows = Array.isArray(dataRows) ? dataRows : [dataRows];
  const runItems = requests.flatMap((request) => rows.map((data) => ({ request, data })));
  const results = [];

  if (options.parallel) {
    results.push(...await Promise.all(runItems.map((item) => executeWithRetry(workspace, item.request, envName, item.data, Boolean(options.retry)))));
  } else {
    for (const item of runItems) {
      const result = await executeWithRetry(workspace, item.request, envName, item.data, Boolean(options.retry));
      results.push(result);
      logResult(result);
      if (options.stopOnFailure && !result.passed) break;
    }
  }

  const summary = results.map(summarizeResult);
  if (options.report) await writeFile(options.report, JSON.stringify({ app: "CurlPostDock", generatedAt: new Date().toISOString(), summary }, null, 2));
  if (options.junit) await writeFile(options.junit, junit(summary));
  if (options.html) await writeFile(options.html, html(summary));
  if (options.sarif) await writeFile(options.sarif, JSON.stringify(sarif(summary), null, 2));

  const failed = summary.filter((item) => !item.passed).length;
  console.log(`CurlPostDock run complete: ${summary.length - failed}/${summary.length} passed`);
  process.exit(failed ? 1 : 0);
}

async function mockCommand(options) {
  const file = options._[1];
  if (!file) throw new Error("Missing .cpd workspace path");
  const workspace = await loadWorkspace(file, options.passphrase);
  const port = Number(options.port || 8787);
  const rules = buildMockRules(workspace);
  const hits = new Map();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const rule = rules.find((item) => item.method === req.method && pathMatches(item.path, url.pathname));
    if (!rule) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "No CurlPostDock mock rule matched", method: req.method, path: url.pathname }));
      return;
    }
    const count = (hits.get(rule.id) || 0) + 1;
    hits.set(rule.id, count);
    if (rule.rateLimitPerMinute && count > rule.rateLimitPerMinute) {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Rate limit simulated by CurlPostDock mock" }));
      return;
    }
    if (rule.latencyMs) await sleep(Number(rule.latencyMs));
    if (rule.errorRate && Math.random() < Number(rule.errorRate)) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Simulated upstream failure" }));
      return;
    }
    const headers = rule.headers || { "content-type": "application/json" };
    res.writeHead(Number(rule.status || 200), headers);
    res.end(renderMockBody(rule, { count, method: req.method, path: url.pathname }));
  });
  server.on("error", (error) => {
    console.error(`CurlPostDock mock server failed: ${error.message}`);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`CurlPostDock mock server listening on http://localhost:${port}`);
    console.log(`Loaded ${rules.length} rules from ${basename(file)}`);
  });
}

async function inspectCommand(options) {
  const file = options._[1];
  if (!file) throw new Error("Missing .cpd workspace path");
  const workspace = await loadWorkspace(file, options.passphrase);
  const requests = workspace.collections?.flatMap((collection) => collection.requests || []) || [];
  const secrets = [
    ...(workspace.globals || []),
    ...(workspace.variables || []),
    ...(workspace.environments || []).flatMap((env) => env.values || []),
    ...(workspace.collections || []).flatMap((collection) => [
      ...(collection.variables || []),
      ...(collection.requests || []).flatMap((request) => request.variables || [])
    ])
  ].filter((item) => item.secret).length;
  console.log(JSON.stringify({
    name: workspace.name,
    collections: workspace.collections?.length || 0,
    requests: requests.length,
    environments: workspace.environments?.map((env) => env.name) || [],
    secrets,
    cloudSyncAllowed: workspace.sync?.cloudSyncAllowed === true
  }, null, 2));
}

async function loadWorkspace(file, passphrase) {
  let doc = JSON.parse(await readFile(file, "utf8"));
  if (doc.format === "cpd.encrypted") {
    if (!passphrase) throw new Error("Encrypted .cpd requires --passphrase");
    doc = decryptWorkspace(doc, passphrase);
  }
  if (doc.format !== "curlpostdock.cpd") throw new Error("Not a CurlPostDock workspace");
  return doc;
}

function decryptWorkspace(doc, passphrase) {
  const salt = Buffer.from(doc.salt, "base64");
  const iv = Buffer.from(doc.iv, "base64");
  const encrypted = Buffer.from(doc.data, "base64");
  const tag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const key = pbkdf2Sync(passphrase, salt, Number(doc.iterations || 250000), 32, "sha256");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}

function getRequests(workspace, scope, collectionName, requestName) {
  const collections = workspace.collections || [];
  if (requestName) {
    return collections.flatMap((collection) => collection.requests || []).filter((request) => request.name === requestName || request.id === requestName);
  }
  if (collectionName) {
    return collections.filter((collection) => collection.name === collectionName || collection.id === collectionName).flatMap((collection) => collection.requests || []);
  }
  if (scope === "first") return [collections[0]?.requests?.[0]].filter(Boolean);
  return collections.flatMap((collection) => collection.requests || []);
}

async function executeWithRetry(workspace, request, envName, data, retry) {
  let result = await executeRequest(workspace, request, envName, data);
  if (retry && !result.passed) {
    result = await executeRequest(workspace, request, envName, data);
    result.retried = true;
  }
  return result;
}

async function executeRequest(workspace, sourceRequest, envName, data) {
  const started = performance.now();
  const collection = (workspace.collections || []).find((item) => (item.requests || []).some((request) => request.id === sourceRequest.id));
  const request = JSON.parse(JSON.stringify(sourceRequest));
  const scopes = buildScopes(workspace, collection, request, envName, data);
  request.url = applyPathParams(resolveTemplate(request.url || "", scopes), request.pathParams || [], scopes);
  request.headers = (request.headers || []).map((item) => ({ ...item, key: resolveTemplate(item.key || "", scopes), value: resolveTemplate(item.value || "", scopes) }));
  request.body = resolveTemplate(request.body || "", scopes);
  applyAuth(request, scopes);
  request.url = appendQueryParams(request.url, request.params || [], scopes);
  if (!["REST", "GraphQL"].includes(request.protocol || "REST")) {
    const response = {
      status: 501,
      statusText: "Bridge required",
      bodyText: `${request.protocol} requires a dedicated CurlPostDock transport bridge.`,
      headers: [],
      timings: { total: performance.now() - started },
      tests: [{ name: "protocol bridge available", pass: false, message: "Bridge not available in CLI MVP" }]
    };
    return { request, response, passed: false };
  }
  try {
    const headers = Object.fromEntries((request.headers || []).filter((item) => item.enabled !== false && item.key).map((item) => [item.key, item.value || ""]));
    const method = request.protocol === "GraphQL" ? "POST" : (request.method || "GET");
    const body = ["GET", "HEAD"].includes(method) || request.bodyType === "none" ? undefined : request.body;
    const response = await fetch(request.url, { method, headers, body, redirect: "follow" });
    const bodyText = await response.text();
    const model = {
      status: response.status,
      statusText: response.statusText,
      headers: Array.from(response.headers.entries()).map(([key, value]) => ({ key, value })),
      bodyText,
      timings: { total: performance.now() - started },
      tests: []
    };
    model.tests = runTests(sourceRequest.scripts?.postResponse || "", request, model);
    const passed = response.ok && model.tests.every((test) => test.pass !== false);
    return { request, response: model, passed };
  } catch (error) {
    return {
      request,
      response: {
        status: 0,
        statusText: "Execution failed",
        bodyText: error.message,
        headers: [],
        timings: { total: performance.now() - started },
        tests: [{ name: "request executed", pass: false, message: error.message }]
      },
      passed: false,
      error
    };
  }
}

function buildScopes(workspace, collection, request, envName, data) {
  const env = (workspace.environments || []).find((item) => item.name === envName || item.id === envName) || (workspace.environments || [])[0];
  return {
    global: kvToObject(workspace.globals || []),
    workspace: kvToObject(workspace.variables || []),
    environment: kvToObject(env?.values || []),
    collection: kvToObject(collection?.variables || []),
    folder: {},
    request: kvToObject(request.variables || []),
    data: data || {}
  };
}

function kvToObject(items) {
  return items.filter((item) => item.enabled !== false && item.key).reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});
}

function resolveTemplate(value, scopes) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, token) => {
    const key = token.trim();
    if (key === "$timestamp") return String(Date.now());
    if (key === "$isoTimestamp") return new Date().toISOString();
    if (key === "$uuid") return randomUUID();
    for (const scope of ["data", "request", "folder", "collection", "environment", "workspace", "global"]) {
      if (Object.prototype.hasOwnProperty.call(scopes[scope] || {}, key)) return resolveTemplate(String(scopes[scope][key]), scopes);
    }
    return `{{${key}}}`;
  });
}

function applyPathParams(url, params, scopes) {
  let next = url;
  for (const param of params) {
    if (param.enabled === false || !param.key) continue;
    const key = resolveTemplate(param.key, scopes);
    const value = encodeURIComponent(resolveTemplate(param.value || "", scopes));
    next = next.replaceAll(`:${key}`, value).replaceAll(`{${key}}`, value);
  }
  return next;
}

function appendQueryParams(url, params, scopes) {
  const enabled = params.filter((param) => param.enabled !== false && param.key);
  if (!enabled.length) return url;
  const parsed = new URL(url);
  for (const param of enabled) parsed.searchParams.set(resolveTemplate(param.key, scopes), resolveTemplate(param.value || "", scopes));
  return parsed.toString();
}

function applyAuth(request, scopes) {
  request.headers ||= [];
  const auth = request.auth || {};
  const token = resolveTemplate(auth.token || "", scopes);
  const username = resolveTemplate(auth.username || "", scopes);
  if (auth.type === "basic") setHeader(request, "Authorization", `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}`);
  if (auth.type === "bearer" || auth.type === "jwt") setHeader(request, "Authorization", `Bearer ${token}`);
  if (auth.type === "apiKey") {
    if (auth.placement === "query") request.params.push({ key: username || "api_key", value: token, enabled: true });
    else setHeader(request, username || "X-API-Key", token);
  }
}

function setHeader(request, key, value) {
  const existing = request.headers.find((item) => item.key?.toLowerCase() === key.toLowerCase());
  if (existing) existing.value = value;
  else request.headers.push({ key, value, enabled: true });
}

function runTests(code, request, response) {
  const tests = [];
  if (!code?.trim()) return tests;
  const cpd = {
    test: (name, fn) => {
      try {
        fn();
        tests.push({ name, pass: true });
      } catch (error) {
        tests.push({ name, pass: false, message: error.message });
      }
    },
    expect: makeExpectation
  };
  const pm = {
    test: cpd.test,
    expect: cpd.expect,
    request,
    response: {
      code: response.status,
      text: () => response.bodyText,
      json: () => JSON.parse(response.bodyText || "{}")
    }
  };
  try {
    new Function("cpd", "pm", "request", "response", code)(cpd, pm, request, response);
  } catch (error) {
    tests.push({ name: "post-response script", pass: false, message: error.message });
  }
  return tests;
}

function makeExpectation(actual) {
  return {
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
        }
      }
    }
  };
}

function buildMockRules(workspace) {
  if (workspace.mocks?.length) return workspace.mocks;
  return (workspace.collections || []).flatMap((collection) => (collection.requests || []).map((request) => {
    let path = "/";
    try {
      path = new URL(request.url).pathname;
    } catch {
      path = request.url || "/";
    }
    return {
      id: request.id,
      name: request.name,
      method: request.method || "GET",
      path,
      status: request.method === "POST" ? 201 : 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mock: true, name: request.name }, null, 2)
    };
  }));
}

function pathMatches(rulePath, incomingPath) {
  if (rulePath === incomingPath) return true;
  const pattern = "^" + escapeRegex(rulePath).replace(/:[^/]+/g, "[^/]+").replace(/\\\{[^/]+\\\}/g, "[^/]+") + "$";
  return new RegExp(pattern).test(incomingPath);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderMockBody(rule, state) {
  return String(rule.body || "").replace(/\{\{\s*\$timestamp\s*\}\}/g, String(Date.now())).replace(/\{\{\s*mockHitCount\s*\}\}/g, String(state.count));
}

function logResult(result) {
  const mark = result.passed ? "PASS" : "FAIL";
  console.log(`${mark} ${result.request.method} ${result.request.url} ${result.response.status} ${Math.round(result.response.timings.total)}ms`);
}

function summarizeResult(result) {
  return {
    name: result.request.name,
    method: result.request.method,
    url: result.request.url,
    status: result.response.status,
    passed: result.passed,
    durationMs: Math.round(result.response.timings.total),
    tests: result.response.tests || []
  };
}

function junit(summary) {
  const tests = summary.flatMap((result) => result.tests.length ? result.tests.map((test) => ({ result, test })) : [{ result, test: { name: "request executed", pass: result.passed } }]);
  const failures = tests.filter(({ test }) => test.pass === false).length;
  return `<?xml version="1.0" encoding="UTF-8"?><testsuite tests="${tests.length}" failures="${failures}">${tests.map(({ result, test }) => `<testcase classname="${escapeXml(result.name)}" name="${escapeXml(test.name)}" time="${result.durationMs / 1000}">${test.pass === false ? `<failure message="${escapeXml(test.message || "failed")}"></failure>` : ""}</testcase>`).join("")}</testsuite>`;
}

function html(summary) {
  const rows = summary.map((item) => `<tr><td>${escapeXml(item.name)}</td><td>${item.status}</td><td>${item.passed ? "PASS" : "FAIL"}</td><td>${item.durationMs}</td></tr>`).join("");
  return `<!doctype html><title>CurlPostDock Report</title><table><thead><tr><th>Name</th><th>Status</th><th>Result</th><th>ms</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function sarif(summary) {
  return {
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "CurlPostDock CLI" } },
      results: summary.filter((item) => !item.passed).map((item) => ({
        ruleId: "api-test-failed",
        level: "error",
        message: { text: `${item.name} failed with status ${item.status}` }
      }))
    }]
  };
}

function escapeXml(value) {
  return String(value ?? "").replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[char]));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

function usage() {
  console.log([
    "CurlPostDock CLI/agent",
    "",
    "Usage:",
    "  node cli/cpd-agent.mjs run workspace.cpd --env dev --report report.json --junit report.xml",
    "  node cli/cpd-agent.mjs mock workspace.cpd --port 8787",
    "  node cli/cpd-agent.mjs inspect workspace.cpd",
    "",
    "Options:",
    "  --collection <name>   Run a single collection",
    "  --request <name|id>   Run a single request",
    "  --data <file.json>    Run with JSON data rows",
    "  --parallel           Run requests in parallel",
    "  --retry              Retry failed tests once",
    "  --stopOnFailure      Stop at first failure",
    "  --passphrase <text>  Open encrypted .cpd files"
  ].join("\n"));
}
