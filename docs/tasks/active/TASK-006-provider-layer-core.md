---
title: "TASK-006: Provider layer core - TranslationProvider trait, Gemini client, keyring storage"
status: Active
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
- [ ] `src-tauri/src/keys/`: keyring wrapper (store/retrieve/delete/status) + unit tests
      with a mocked backend.
- [ ] `src-tauri/src/providers/`: trait (translate streaming + non-streaming, list_models,
      validate_key), typed errors (auth/quota/network/timeout), prompt template with
      instruction/data separation.
- [ ] Gemini client impl, wiremock integration tests, log redaction.
- [ ] `docs/architecture/api-contracts/providers.md` written in the same PR.

## Test scenarios / acceptance
- [ ] All provider HTTP mocked; no key value ever appears in logs/errors (test asserts).
- [ ] Key round-trip works against Windows Credential Manager (manual smoke).
- [ ] Anthropic/OpenAI/OpenRouter clients are follow-up tasks - trait must not need
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

## Result
<Fill when moving to Done.>
