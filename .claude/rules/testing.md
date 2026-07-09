# Rule: Testing

TDD (red-green-refactor) for business logic and pipeline stages; tests follow the FR
acceptance criteria.

## Layers

| Layer | Framework | Scope |
|-------|-----------|-------|
| Unit (Rust) | cargo test | pipeline stages, provider clients (mocked HTTP), key storage wrapper (mocked keyring), chunking/VAD logic |
| Unit (TS) | Vitest | hooks, lib modules, IPC wrapper (mocked invoke) |
| Integration | cargo test + wiremock | provider trait impls against recorded/mocked HTTP; STT against tiny fixture audio |
| E2E | WebdriverIO + tauri-driver | critical flows: settings/key entry, region select -> preview, overlay lifecycle |

## Non-negotiables

- Mock EVERY external provider - no real API calls in tests. Opt-in live smoke tests exist
  behind an explicit env flag (`OST_TEST_*` keys) and never run in CI by default.
- Fixture audio/images are synthetic or self-recorded; never real user content.
- Coverage threshold for business-logic modules: >= 80%.
- Performance budgets are tested: a latency benchmark (criterion) guards the STT chunk path;
  regressions beyond budget fail review.
- Run `/test` before opening a PR; red CI blocks merge.
