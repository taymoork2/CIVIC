# 0007: Review on the journey goes to agents, tracked across lines of work

- **Status:** Accepted
- **Date:** 2026-10-11
- **Decider:** Founder
- **Amends:** [0006](0006-deterministic-civic-for-agentic-teams.md)

## Context

Decision 0006 kept agents entirely outside CIVIC and deferred any agent interface. The founder found that too strict. They want to select, comment on, and annotate the user journey, its screens, parts of screens, and its paths and branches, and then hand that to an agent to work on. Agents work on separate branches and worktrees, PRs have preview builds, and designers keep several drafts, so CIVIC has to know which version every comment, capture, and fix belongs to. The full proposal is in [review to agent](../agent-review-loop.md).

## Decision

**CIVIC still makes no model calls (D30 stands).** It captures, compares, and replays deterministically. Agents run in the team's own harness, on its own budget. What changes:

1. **Agents get a narrow write path and are attributed actors (D35).** Through a CLI and an MCP server over the same calls, an agent can read work requests and contracts, claim a request for its line, comment, report a fix with its revision and preview, and record an annotation for its person. Every agent acts for a named person, who is accountable. Agents can't approve, decide, resolve, or write evidence. CIVIC doesn't launch agents itself. That's a separate decision for later.
2. **Lines and the lens (D36).** A line is any stream of work with revisions: main, a branch, a worktree, a PR with its preview, or a design draft. The canvas reads the graph as of one design line and one code line. Every annotation, capture, and piece of evidence records the revision and line it saw. Records made on a line stay there until it merges, and choosing between design drafts is a Decision record.
3. **Annotations anchor by identity (D37).** An annotation can target a journey, a flow, a screen or state, part of a screen, a path, a branch, or a design-draft frame. It follows a change by stable target ID first, then by exact element locator. If neither matches, it shows as not found on that revision, and it's never moved to the nearest element. A screenshot with a comment and no anchor is accepted as an unanchored annotation.
4. **Work requests close by a policy a person sets (D38).** Selected annotations become a work request carrying the captures, the `civic context` export, the base revision, a repro command, and acceptance. When a fix is reported, CIVIC re-captures the scenario on the fix's preview. People are kept out of the critical path by three lanes. **Auto:** CIVIC resolves a routine, contract-restoring request on a target that isn't high risk once its executable acceptance passes, and the requester can reopen it. **Batch review:** before and after pairs are cleared many at a time. **Owner sign-off:** changes to intent or behavior and high-risk targets go to the named owner. Checks an agent wrote for its own fix count toward Auto only after a person accepts them.
5. **Local records live in the git common directory (D39).** All worktrees of a repository share it, so every worktree and local agent sees the same annotations, requests, and claims, and nothing is committed to product branches. The team-wide store is roadmap step 5.
6. **Capture works wherever you are (D40).** CIVIC offers three ways to capture. A capture overlay injected into dev and preview builds works in any browser, including the browsers built into desktop harnesses. One MCP server with thin per-harness packages (a Claude Code plugin first, then Codex) covers agents. Screenshot import keeps the founder's current habit.

## Consequences

- 0006's "the graph has no agent actor" is replaced by D35's attributed agent actor. Segregation of duties gains one rule: for a high-risk target, the person who delegated the fix can't be its only approver.
- The agent interface moves from "Later, not scheduled" to the next build, ahead of the Card demo. Line, Annotation, WorkRequest, and Actor start step 3's typed records, and the first slice runs on the journey engine with Example.
- Everything else in 0006 is unchanged: no model calls inside CIVIC, no agent-drafted designs, adapters, or prototypes, and no model-suggested states.
