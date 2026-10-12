# Saved reviews and agent sessions

Rehearsal sends a saved review, its branch/region identity, captured inputs,
source receipts and frozen PNG to an explicitly selected agent destination.
Replies return to that review. A follow-up continues the same session with the
original evidence. Completing an agent turn never resolves the review.

## Connection and setup

A destination is **provider + host + project directory + thread/session ID**.
Session IDs belong to their harness and host; an ID by itself is insufficient.
Register destinations once in `.review-data/agents.json` on the Rehearsal host.
The file is operator-owned and private; the browser cannot supply executable
paths, SSH hosts or permission overrides. The workspace's existing directory
protections exclude this file from Vite serving and handoff exports.

Example (replace the directories and UUIDs with verified session bindings):

```json
[
  {
    "id": "codex-rehearsal",
    "label": "Rehearsal implementation",
    "provider": "codex",
    "sessionId": "12345678-1234-4234-8234-123456789abc",
    "cwd": "/absolute/path/to/rehearsal",
    "executable": "/opt/homebrew/bin/codex"
  },
  {
    "id": "claude-product",
    "label": "Product correction",
    "provider": "claude",
    "sessionId": "87654321-1234-4234-8234-123456789abc",
    "cwd": "/absolute/path/to/product",
    "executable": "/opt/homebrew/bin/claude"
  }
]
```

Open a saved review, reload destinations, choose one, inspect its host/directory/
session, then **Send saved review**. No destination is selected automatically.
Sending starts work and can use that harness's account quota.

### Codex

Connects with `codex app-server proxy`, not a second standalone app server.
The configured host must already have a compatible managed daemon/control
socket. Optional `socket` sets `proxy --sock /absolute/socket/path`. The operator
can start the daemon using `codex app-server daemon start`; Rehearsal does not
install, restart or reconfigure a harness.

The bridge initializes the protocol, reads the exact thread, verifies its
directory and idle status, resumes it without model/permission overrides, and
starts a turn with text and the PNG as a data URL. It retains the returned turn
ID, final assistant messages and completion receipt. Busy threads are refused.
The idle check is not atomic with starting a turn; another client can start work
between those calls. Keep one owner for a dispatch session until Codex offers
an atomic compare-and-start operation.
Rehearsal declines command/file approval requests and does not grant permissions
or answer agent questions. Use the harness when interaction is required.

The desktop application's private `ipc.sock` is not assumed to be this protocol.
Neither a local transcript nor a thread visible in the app proves that the
configured daemon owns its live session. A thread already owned elsewhere must
be coordinated through its owning harness; do not run competing servers.

### Claude Code

Uses the installed CLI's documented headless resume and streaming JSON:
`claude -p --resume ID --input-format stream-json --output-format stream-json
--verbose --permission-prompts none`. The packet and PNG are structured user
input on stdin. A matching initialization session ID is the acceptance receipt;
the result message supplies the agent reply and turn outcome.

This continues an **idle saved CLI session**, not an arbitrary Claude Desktop,
Claude Design or cloud conversation. Current Claude Code refuses headless resume
of a background session still running. Rehearsal does not silently fork, stop it,
bypass permissions or manipulate an undocumented Remote Control API. Permission
requests in this unattended run are denied; operator-configured permissions and
settings still apply. A refusal without a structured receipt remains uncertain.
The operator must verify that the Claude session belongs to the configured cwd;
unlike Codex, this adapter has no metadata-only session directory check.

### Remote machines

Add `"sshHost": "my-agent-host"` using a preconfigured SSH host. Set `cwd`,
`executable` and optional Codex `socket` to paths on that host. SSH uses batch mode
and strict known-host checking. The same provider protocol runs through stdin/
stdout; review text and screenshots are never shell arguments. No raw public
app-server listener or browser-held account token is required.

The frozen image is transferred in the protocol. Reopen links still point at the
Rehearsal host and require its local authenticated session; a remote agent cannot
open those links through its own localhost. Interactive reopening and writing
structured evidence back from a remote host remain separate work.

## Delivery and two-way conversation

```mermaid
sequenceDiagram
  participant U as Reviewer
  participant R as Rehearsal
  participant H as Harness on selected host
  U->>R: Send saved review to registered session
  R->>R: Persist pending delivery identity
  R->>H: Brief, captured state, frozen PNG
  H-->>R: Matching session / turn acknowledgement
  R->>R: Retain accepted receipt
  H-->>R: Agent messages and final outcome
  R-->>U: Replies beside the original review
  U->>R: Follow-up to the same destination
  R->>H: Follow-up and original review evidence
  Note over U,R: Verify separately; resolution requires evidence
```

The feedback store retains delivery history: `pending`, `accepted`, `completed`,
`failed`, or `unknown`, with destination binding, timestamps, turn ID when
available, user follow-ups and bounded agent replies. Acceptance confirms the
harness/session response, not comprehension or a correct implementation.

POST `/api/review/feedback/:id/send` accepts a delivery `requestId` and registered
`destination`. Repeating that request returns its stored receipt. Follow-ups add
`replyTo` (the latest acknowledged delivery) and `message`. Repointed destinations,
stale reply IDs and unresolved in-flight sends are rejected. GET
`/api/review/agents` returns destination labels/bindings without executable or
socket details. GET `/api/review/feedback` returns the conversation history.

No automatic retries follow uncertain delivery. A bridge restart converts pending
or accepted deliveries to unknown because the harness may still be working.
Unknown blocks another send to that session. Recovery currently requires the
operator to inspect the harness and reconcile the stored receipt; there is no
UI for that reconciliation yet. Failed preflight sends can be attempted again;
an acknowledged turn that fails can receive an explicit follow-up.

Existing linked-source watchers refresh app inventory and screenshots when code
changes. This is independent of agent completion: a receipt is not a source
change and a refreshed snapshot is not verification proof. Product ownership,
design reconciliation and application checks remain separate.

## Does this require MCP?

**No for review delivery, agent replies and follow-up turns.** Those use the
harness protocol above. **MCP is an optional next interface for structured tools**
that an agent can call during its turn. A scoped Rehearsal MCP could expose
`get_review`, `get_journey`, `attach_evidence` and `submit_proposal`, all against
the same store and existing validation. Each connection should be restricted to
its assigned review/project; writebacks should be version-bound and leave final
acceptance with the reviewer. MCP should not be a second feedback database or a
way to bypass harness permissions.

MCP installation, review-scoped credentials, remote interactive reopening,
structured evidence writebacks and approval UI are **not implemented** here.
The current return path is agent messages and completion receipts, not tool-based
writebacks. Neither review resolution nor design acceptance is automatic.

## Evidence and limits

Inspected locally on October 11, 2026: Codex CLI 0.162.1 and Claude Code 2.1.287.
Codex's generated schema confirms the thread/read, thread/resume, turn/start,
image input and message receipt shapes. Version drift can refuse the bridge.

- [Codex app-server protocol](https://developers.openai.com/codex/app-server)
- [Claude headless session resume and running-session restrictions](https://code.claude.com/docs/en/sessions#resume-a-running-background-session)
- [Claude CLI streaming and permission prompts](https://code.claude.com/docs/en/cli-reference)

Provider-free protocol checks cover exact session binding, wrong-directory/busy
refusal, screenshot input, settings preservation, missing acknowledgements,
Claude session receipts and SSH quoting. API checks cover durable identities,
follow-ups, origin checks, duplicate rejection and restart recovery. Chromium
checks use mocked harness receipts, with actual synthetic saved-review capture.
No real agent turn or remote SSH delivery is claimed by those tests.

This machine has no default managed Codex control socket and no registered agent
destination. Setup is therefore still required before a real send. The existing
desktop owner chat has not received a review, and f7ce/backend data were not
modified by this work.
