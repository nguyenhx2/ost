---
paths:
  - "src/**/*.{ts,tsx}"
  - "src-tauri/src/**/*.rs"
  - "e2e/**"
---

# Rule: Testing

The design driver is the domain model and its invariants (`domain-model.md`), not test-first
ordering. **This does not mean dropping tests.** DDD replaces TDD as the ORGANIZING principle:
design starts from the bounded context's aggregate boundaries and the contract it publishes to
other contexts (a trait, an IPC command), and a test's job is to prove that boundary and its
invariants hold - not to dictate the order code gets written in. Tests remain mandatory and map to
two things: the domain invariants of the context they sit in (a `Segment`'s Confidence/Fidelity is
always set; a `TranslationProposal` never carries a raw, unvalidated provider response) and the
FR's acceptance criteria. Business logic and pipeline stages are still written test-first where
that is the fastest way to pin the invariant down; presentation glue and generated code are not
TDD-theater targets.

## Layers

| Layer | Framework | Scope |
|-------|-----------|-------|
| Unit (Rust) | cargo test | pipeline stages, provider clients (mocked HTTP), key storage wrapper (mocked keyring), chunking/VAD logic |
| Unit (TS) | Vitest | hooks, lib modules, IPC wrapper (mocked invoke) |
| Integration | cargo test + wiremock | provider trait impls against recorded/mocked HTTP; STT against tiny fixture audio |
| E2E | WebdriverIO + tauri-driver | critical flows: settings/key entry, region select -> preview, overlay lifecycle |

## Non-negotiables (unchanged by the DDD reframing)

- Mock EVERY external provider - no real API calls in tests. Opt-in live smoke tests exist behind
  an explicit env flag (`OST_TEST_*` keys) and never run in CI by default.
- Fixture audio/images are synthetic or self-recorded; never real user content.
- Coverage threshold for domain-logic modules: >= 80%.
- Performance budgets are acceptance criteria, not a separate concern: a latency benchmark
  (criterion) guards the STT chunk path and the region pipeline; regressions beyond budget fail
  review, exactly like a failed functional test.
- Run `/test` before opening a PR; red CI blocks merge.

## Context-boundary tests

Every trait that acts as an anti-corruption layer (`TranslationProvider`, `OcrEngine`,
`SpeechToText`, `ScreenCapturer`, `AudioSource`) gets a test against the trait's CONTRACT, not just
against one implementation - a mock/fake implementation exercised the same way a real one would be
proves the contract is enough for callers on the other side of the boundary. A change that breaks
this contract test is a domain-model change (consult `domain-modeler`), not a test to loosen.
