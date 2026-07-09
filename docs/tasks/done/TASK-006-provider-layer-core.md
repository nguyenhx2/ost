---
title: "TASK-006: Provider layer core - TranslationProvider trait, Gemini client, keyring storage"
status: Done
fr: "FR-03"
owner: llm-integration-dev
deps: "TASK-002, TASK-003"
priority: P0
phase: 1
created: 2026-07-09
tags: [task]
---

# TASK-006: Provider layer core - TranslationProvider trait, Gemini client, keyring storage

## Goal
The shared LLM layer exists: `TranslationProvider` trait, one working provider (Gemini),
and keychain-backed key storage - the foundation both pipelines call.

## Inputs / context
- FR-03 spec; ADR-003; `.claude/rules/security-privacy.md`; agent llm-integration-dev
  design constraints.

## To do
- [x] `src-tauri/src/keys/`: keyring wrapper (store/retrieve/delete/status) + unit tests
      with a mocked backend.
- [x] `src-tauri/src/providers/`: trait (translate streaming + non-streaming, list_models,
      validate_key), typed errors (auth/quota/network/timeout), prompt template with
      instruction/data separation.
- [x] Gemini client impl, wiremock integration tests, log redaction.
- [x] `docs/architecture/api-contracts/providers.md` written in the same PR.

## Test scenarios / acceptance
- [x] All provider HTTP mocked; no key value ever appears in logs/errors (test asserts).
- [ ] Key round-trip works against Windows Credential Manager (manual smoke) - NOT DONE, carried to TASK-009.
- [x] Anthropic/OpenAI/OpenRouter clients are follow-up tasks - trait must not need
      changes to add them (reviewed by code-reviewer).

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-09 | orchestrator | Task created and registered in master-plan (bootstrap seed) | Planned |
| 2026-07-09 | orchestrator | worktree+branch feat/provider-layer-core created off 525ba51; dispatched spec-guardian for FR-03 spec lock | Active |
| 2026-07-09 | llm-integration-dev | Implemented providers/ (TranslationProvider trait: translate + translate_stream + list_models + validate_key; typed ProviderError auth/quota/network/timeout/invalid/api/config; Gemini client with bounded retries+backoff, HTTPS enforcement, instruction/data-separated prompt, serde schema validation, redaction) and keys/ (ApiKey redacting newtype, KeyBackend trait, KeyringBackend, KeyStore store/retrieve/delete/status via spawn_blocking, mock backend). All HTTP wiremock-mocked; keyring mocked. Wrote providers.md contract | Done |
| 2026-07-09 | llm-integration-dev | Rebased branch onto main (fda5f99) for .gitattributes eol=lf + CI; clean rebase, renormalize no-op | Done |
| 2026-07-09 | llm-integration-dev | Fixed flaky logs_never_contain_the_api_key: thread-local tracing subscriber filtered under parallel harness; switched to process-wide global default installed once | Done |
| 2026-07-09 | llm-integration-dev | Verified: cargo fmt clean, clippy --all-targets -D warnings clean, cargo test -j 2 = 53 passed 0 failed (green x3 in parallel). Windows Credential Manager round-trip NOT verified in-agent (manual smoke pending) | Done |
| 2026-07-09 | llm-integration-dev | Advisory fix round pre-secret-scan: (1) de-prefixed synthetic test keys from the real Google key prefix to "FAKE-TEST-KEY-..." in keys/store.rs + providers/gemini.rs (0 real-prefix strings left in worktree); redaction tests still assert fake key never leaks. (2) Hardened config.rs base_url_is_allowed to parse via url crate + reject userinfo (blocks http://localhost:8080@evil.com bypass); added url="2.5.8" direct pinned dep (logged in tool-changelog). Added tests userinfo_embedding_loopback_is_rejected, loopback_ipv6_http_is_allowed, malformed_url_is_rejected. Verified: cargo fmt clean, clippy -D warnings clean, cargo test -j 2 = 56 passed 0 failed (sandbox off per known-issue #11) | Done |

## Result
<Fill when moving to Done.>
| 2026-07-09 | code-reviewer + security-reviewer | Both PASS. Security: ApiKey newtype has no Serialize/Display and a Debug printing ApiKey([REDACTED]); header-only key transport; HTTPS enforced; end-to-end log-redaction test | Done |
| 2026-07-09 | claude | Independently re-verified on the merged tree: cargo test 56 passed / 0 failed, clippy -D warnings clean, secret scan on the diff clean. PR #2 merged to main (2aef857) | Done |

## Result
Provider layer core is on `main` (PR #2, merge commit 2aef857).

Delivered: the `TranslationProvider` trait (translate, translate_stream, list_models,
validate_key) with a typed `ProviderError` taxonomy; the Gemini client with bounded
retries, HTTPS enforcement, instruction/data-separated prompt template, serde schema
validation and log redaction; `keys/` with the redacting `ApiKey` newtype, a `KeyBackend`
trait and the `KeyringBackend` (Windows Credential Manager) behind `spawn_blocking`; and
the `docs/architecture/api-contracts/providers.md` contract.

Evidence: `cargo test -j 2` 56 passed / 0 failed (all provider HTTP wiremock-mocked, no
real API calls); `clippy --all-targets -- -D warnings` clean; `cargo fmt --check` clean;
CI `lint-and-test` green on PR #2. code-reviewer and security-reviewer both PASS; the
trait was reviewed against the criterion that Anthropic/OpenAI/OpenRouter can be added
without changing it.

Carried forward, not done here:
- Windows Credential Manager real round-trip is still only covered by a mocked backend in
  unit tests. The manual smoke test moves to TASK-009, which is the first task to put a
  real key through the keychain from the UI.
- When Tauri IPC commands for keys are added (TASK-009), assert no command returns
  `ApiKey` or calls `expose()`. The type system helps - `ApiKey` has no `Serialize` - but a
  command could still stringify it.
