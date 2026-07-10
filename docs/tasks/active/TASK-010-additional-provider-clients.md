---
title: "TASK-010: Additional LLM provider clients: Anthropic, OpenAI, OpenRouter"
status: Active
fr: "FR-03"
owner: llm-integration-dev
deps: "TASK-006"
priority: P0
phase: 1
created: 2026-07-10
tags: [task]
---

<!-- TASK FILES ARE WRITTEN 100% IN ENGLISH (see .claude/rules/task-tracking.md). -->

# TASK-010: Additional LLM provider clients: Anthropic, OpenAI, OpenRouter

## Goal
Implement Anthropic, OpenAI and OpenRouter clients behind the existing `TranslationProvider` trait so all four providers work with model selection and user-defined fallback.

## Inputs / context
- Related FR: [FR-03](../../specs/05-functional-requirements.md#fr-03)
- Related files: `src-tauri/src/providers/` (anthropic.rs, openai.rs, openrouter.rs), the provider registry/factory, `src-tauri/src/keys/`
- The `TranslationProvider` trait is certified to need NO change to add these (code-reviewer). If a change turns out necessary, ESCALATE to the orchestrator/owner - do not change the trait quietly.

## To do
- [ ] `anthropic.rs`, `openai.rs`, `openrouter.rs`: each implements `TranslationProvider` (translate + validate_key + model list) as its own module.
- [ ] Register the three in the provider factory so Settings lists all 4 (AC-03.1) and fallback order can include them (AC-03.6).
- [ ] Instruction/data separation in every prompt; schema-validate each provider response before use; render plain text (AC-03.8).
- [ ] Log redaction: no key or PII in logs or error messages; safe error surfaces (AC-03.4); key never in files/logs and the IPC surface returns only masked status (AC-03.2, AC-03.3).
- [ ] Fold in the security-reviewer optional hardening for the non-Gemini clients (request timeouts, TLS enforced, bounded response size, no key echoed in errors).
- [ ] wiremock integration tests per client (recorded/mocked HTTP) - NO real API calls.

## Test scenarios / acceptance
- [ ] AC-03.1: Settings lists all 4 providers with key + model actions.
- [ ] AC-03.4: check-key does one minimal call, safe result, no key leak.
- [ ] AC-03.6: fallback tries the next provider on error; the badge shows the actual provider used.
- [ ] AC-03.8: instruction/data separation, response schema-validated, plain-text render.
- [ ] Every provider mocked; coverage >= 80% on the client logic.

## Orchestration notes
- Shared layer; keys stay only in the OS keychain via keys/. security-reviewer MANDATORY (providers/ + keys/ + network egress).
- Trait-change escalation clause above is a hard rule.

## Session log (AI session log)

| Date | Who | What was done | Result |
|------|-----|---------------|--------|
| 2026-07-10 | orchestrator | Task created and registered in master-plan (Phase B decomposition) | Planned |
| 2026-07-10 | spec-guardian | Pre-dispatch scope check vs FR-03/BR-02. ALIGNED: TranslationProvider trait sufficient as-is, no change needed. Added AC-03.2/03.3 citations. | Go |
| 2026-07-10 | llm-integration-dev | Flip status Planned->Active; read Gemini client, trait, keys, contract. Start Anthropic/OpenAI/OpenRouter clients + factory. | In progress |
| 2026-07-10 | llm-integration-dev | CRASH RECOVERY: recovered orphaned uncommitted work (anthropic/openai/openrouter/factory + mod.rs + commands/keys.rs). Verified trait UNCHANGED (traits.rs diff vs origin/main empty). Reviewed all 3 clients match certified Gemini shape: TLS enforced, per-request timeout, bounded retries+backoff, redaction, schema-validated responses, instruction/data separation. Factory total over 4 providers; keys command validates all 4 via build_provider. Synced providers.md + ipc.md. | Clients complete |
| 2026-07-10 | llm-integration-dev | cargo fmt --check OK; clippy --all-targets -j2 -D warnings OK (0 warnings); cargo test -j2: 177 passed / 0 failed / 1 ignored. 3 new clients carry full wiremock suites (success, injection-separation, auth/quota/network/timeout, malformed/missing-field, bounded 5xx retry, streaming happy+auth+malformed, validate_key one-call+redacted+network-is-error, insecure-url, model-id validation). | Green |

## Result
<Fill when moving to Done; link the PR/commit. Then move the file to docs/tasks/done/.>
