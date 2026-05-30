# CurlPostDock

CurlPostDock is an offline-first API testing client intended as a security-friendly replacement for cloud-synced Postman workspaces and a more approachable alternative to Bruno. The workspace format is `.cpd`, a readable JSON document that is designed for pull requests, diffs, and local/enterprise source control.

The current implementation is a dependency-free local web app plus a small Node.js CLI/agent. It uses the supplied `CurlPostDock.png` as the application icon and keeps cloud sync disabled by design.

## Quick Start

From this folder:

```bash
python3 -m http.server 4173
```

Open:

```text
http://localhost:4173
```

You can also open `index.html` directly, but encrypted export and the offline service worker work best from `localhost`.

## Current Capabilities

- Postman/Hoppscotch-style request builder with collections, nested folder paths, favorites, recent history, tags, search, request templates, variables, scripts, and response viewer.
- `.cpd` workspace save/load, plus encrypted `.cpd` export/import using AES-GCM with PBKDF2.
- Offline by default. `cloudSyncAllowed` is always written as `false`.
- Bruno `.zip` import for `.bru` requests and Postman environment JSON found inside Bruno exports.
- Import support for `.cpd`, `.bru`, Postman collections/environments, OpenAPI/Swagger JSON, Insomnia JSON, HAR, and cURL text.
- Export support for `.cpd`, individual requests, cURL, and runner reports.
- HTTP/HTTPS REST methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `TRACE`.
- Protocol models for REST, GraphQL, gRPC, WebSocket, SSE, Socket.IO, and MQTT.
- Browser execution for REST, GraphQL, WebSocket, and SSE where browser security policy allows it.
- Query params, path params, headers, cookies, raw bodies, GraphQL body, protobuf content type, binary upload selection, multipart/form modeling.
- Response viewer with pretty view, raw view, headers, cookies, timings, and binary hex preview.
- Code snippet generation for cURL, JavaScript fetch, Node.js, Python requests, Java HttpClient, and Go net/http.
- Auth configuration for Basic, Bearer, API key, OAuth 2.0, OpenID Connect, JWT, Digest, AWS SigV4, mTLS, NTLM, Kerberos, and custom script auth.
- Executed auth today: Basic, Bearer/JWT, API key, and custom script headers.
- Pre-request scripts and post-response tests with a small `cpd` API and partial Postman-style `pm` compatibility.
- Automated runner for current request, collection, or all collections with environment selection, JSON data rows, parallel mode, retry failed, stop on failure, and reports.
- Report export: JSON, JUnit XML, HTML, and SARIF.
- Mock rule generation from a collection plus local mock serving through the CLI.
- Offline assisted test generation from OpenAPI, traffic logs, bug reports, and production failures using deterministic local heuristics.
- Enterprise security panel for bring-your-own-vault URI, policy-as-code validation, zero-trust workspace settings, and encrypted sync metadata.

## CLI / Local Agent

The CLI uses Node.js built-ins only. It is useful for CI/CD, local mocks, and avoiding browser CORS limitations.

Inspect a workspace:

```bash
node cli/cpd-agent.mjs inspect workspace.cpd
```

Run tests:

```bash
node cli/cpd-agent.mjs run workspace.cpd --env dev --report report.json --junit report.xml --html report.html --sarif report.sarif
```

Run a single collection or request:

```bash
node cli/cpd-agent.mjs run workspace.cpd --collection "Smoke Tests"
node cli/cpd-agent.mjs run workspace.cpd --request "Health check"
```

Run with data and retry:

```bash
node cli/cpd-agent.mjs run workspace.cpd --data data.json --retry --stopOnFailure
```

Start a local mock server:

```bash
node cli/cpd-agent.mjs mock workspace.cpd --port 8787
```

Try the included sample workspace:

```bash
node cli/cpd-agent.mjs inspect examples/sample.cpd
node cli/cpd-agent.mjs mock examples/sample.cpd --port 8787
```

Open encrypted `.cpd` files:

```bash
node cli/cpd-agent.mjs run workspace.encrypted.cpd --passphrase "your-passphrase"
```

## Bruno Migration

1. Start the local web app.
2. Use **Import Bruno zip**.
3. Select `Bruno.zip`.
4. CurlPostDock groups `.bru` files by Bruno collection folder and imports Postman environment files from the archive.
5. Save the migrated workspace as `.cpd`.

The included Bruno archive contains many `.bru` requests plus Postman environment JSON. CurlPostDock ignores macOS `__MACOSX` metadata and `collection.bru` marker files during import.

## Variable Precedence

When resolving `{{variables}}`, CurlPostDock uses this order:

1. Runner data variables
2. Request variables
3. Folder variables
4. Collection variables
5. Active environment variables
6. Workspace variables
7. Global variables

Dynamic variables include:

- `{{$timestamp}}`
- `{{$isoTimestamp}}`
- `{{$uuid}}`
- `{{$randomInt}}`
- `{{$randomEmail}}`

## Scripting

Post-response test example:

```javascript
cpd.test('status is successful', () => {
  cpd.expect(response.status).to.be.below(400);
});

cpd.test('response is JSON', () => {
  JSON.parse(response.bodyText);
});
```

Pre-request mutation example:

```javascript
request.headers.push({
  key: 'X-Request-Id',
  value: cpd.uuid(),
  enabled: true
});
```

Environment update:

```javascript
cpd.setEnv('token', response.bodyText);
```

## Security Model

- No automatic cloud sync is implemented.
- Workspaces are local browser storage until exported as `.cpd`.
- `.cpd` files are readable JSON for code review.
- Encrypted export uses AES-GCM and PBKDF2-SHA-256.
- Secret variables can be marked as `secret`; use encrypted export or a vault URI for team sharing.
- Policy-as-code is stored in the workspace under `security.policy`.
- Enterprise transports such as mTLS, NTLM/Kerberos, raw gRPC, MQTT, and Socket.IO need a desktop/native bridge for full fidelity.

## File Format

The main file format is `.cpd`:

```json
{
  "format": "curlpostdock.cpd",
  "version": "0.1.0",
  "app": "CurlPostDock",
  "sync": {
    "mode": "offline",
    "cloudSyncAllowed": false
  },
  "collections": []
}
```

Schema:

```text
schema/cpd.schema.json
```

## Repository Note

The requested remote is:

```text
https://wwwin-github.cisco.com/susugath/CurlPostDock.git
```

This environment could reach the host but could not authenticate non-interactively:

```text
fatal: could not read Username for 'https://wwwin-github.cisco.com': Device not configured
```

After authenticating locally, initialize or clone the repository and push these files:

```bash
git clone https://wwwin-github.cisco.com/susugath/CurlPostDock.git repo
```

If the remote is empty, these workspace files can be committed as the first version.

## Roadmap

- Desktop shell for native certificates, mTLS, NTLM/Kerberos, gRPC, MQTT, Socket.IO, and private-network execution.
- Full OpenAPI schema assertion generation.
- Vault adapters for HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, and enterprise internal vaults.
- Policy enforcement hooks for blocked hosts, approved certificate profiles, and required encrypted export.
- PR review helpers that render `.cpd` diffs as human-readable request changes.
