# Package verification — October 10, 2026

This report concerns the portable handoff copy. Original browser acceptance is separately recorded in `source/docs/design/review-product/build-evidence.md`.

The source was copied to a fresh temporary folder outside the original checkout. A new local Git repository/import commit was created **only in that disposable test copy**, following the README. The ZIP contains no Git internals or that test repository. The original branch, worktree and port-3010 runtime were not changed.

| Check | Result |
|---|---|
| Dependency installation | `pnpm install --frozen-lockfile` passed in the temporary copy; an earlier offline attempt lacked a cached tarball and did not pass |
| Type/style check | `pnpm --dir apps/web run check` passed, including 1,591 static utilities and stylesheet separation |
| Focused component/unit checks | Seven files, 59/59 tests passed |
| Local API/inventory checks | 4/4 passed using the available Node 24 runtime with loopback listeners permitted |
| Independent startup | Vite review started on temporary `127.0.0.1:3137`, using bundled design references and synthetic backend URLs |
| Authentication/entry | Newly generated key authenticated; `/review?scenario=intake.towel.fabric` returned the review entry |
| Inventory | 173 scenarios, 10 bundled design hash entries, and the original final source/fixture hashes |
| Cached screen library | All 176 map screen IDs returned PNG bytes exactly matching the bundled cache |
| Implementation copy fidelity | All 770 copied files under apps/packages/convex compared byte-for-byte with the original working source |
| Private-state exclusions | No Git internals, environment files, dependencies, personal harness state or existing review store in payload; original access-key bytes absent from every packaged file |
| Credential pattern scan | No private-key blocks or matching GitHub/OpenAI/Anthropic secret-token patterns detected; this is a bounded check, not a forensic secret audit |

The first type-check attempt found two Laundry research manifests imported by existing tests. Those manifests and related test inputs were added to the package, and the type/style check then passed. No application source was changed to make the package pass.

The temporary server was stopped after verification. Dependencies and test-created private state remained in the disposable test copy and were not copied back into the payload.

The fresh-copy browser UI and explicit Playwright journey scenario were not exercised again. Original manual browser evidence remains historical evidence for the identical implementation. A completely cold-cache install, physical devices, native runners, production build/deployment, full app suite and multiplayer were not checked. The runtime uses Chrome for newly generated captures; the bundled cached thumbnails do not prove fresh capture behavior on another machine.

Archive integrity and extraction are recorded in `ARCHIVE-VERIFICATION.json` beside the ZIP. `MANIFEST.json` and `SHA256SUMS` inside the ZIP describe the final payload.
