---
description: Run lint plus the unit and end-to-end suites, and report each failure with its owning agent.
allowed-tools: Bash(npm run test:*), Bash(npm run lint:*), Bash(cargo test:*), Bash(cargo fmt:*), Bash(cargo clippy:*), Read, Grep, Glob
---

1. Run `npm run lint` (eslint + prettier) and `cargo fmt --check` + `cargo clippy --all-targets -- -D warnings`
   (both manifests: `src-tauri/Cargo.toml`).
2. Run `npm run test` (Vitest, TS unit suite) and `cargo test --manifest-path src-tauri/Cargo.toml` (Rust unit
   suite), then the WebdriverIO + tauri-driver end-to-end suite (`npm run test:e2e`) when the flow it covers is
   in scope.
3. Every external provider is mocked. A test that makes a real network call is a defect, not a
   passing test: report it as a failure even when it is green.
4. Coverage target: 80% on domain logic (Recognition/Translation/Capture business rules). Report the actual figure and whether it regressed against
   main.
5. Report each failure with the agent that owns the code per the routing table, and with the
   acceptance criterion it breaks.
6. Append the run to the task file session log. A quality gate counts as passed only when the
   session log records the run: a claim of "tests pass" with no logged run is unverified.

Never edit a test to make it pass. A failing test is either a real defect in the code or a wrong
expectation, and deciding which one is the point of the exercise.
