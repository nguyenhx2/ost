---
title: "TASK-006: Provider layer core - TranslationProvider trait, Gemini client, keyring storage"
status: Planned
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

## Result
<Fill when moving to Done.>
