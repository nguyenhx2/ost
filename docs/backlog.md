# Backlog - OST

Flat list of open work. Replaces the old `docs/tasks/` (master-plan + per-task files with
session logs) - completed work is history and lives in git, not here. When an item starts,
just work it directly against the code and this list; no task-file ceremony required. When it
ships, delete the row (or move it under a `## Shipped` heading briefly if a PR is still in
flight and you want a paper trail until merge).

## Parked / deferred (owner decisions already made - do not restart without a trigger)

- **Cloud OCR backends (opt-in, BR-09-equivalent).** Owner-authorized in principle (see
  `docs/decisions.md`, 2026-07-09 OCR entry) but parked: a cloud OCR round-trip stacked in
  series before the LLM translate call plausibly cannot fit the region p95 < 2s budget (local
  OCR alone already costs ~277ms). Local OCR meets EN/JA at 1.000 accuracy and isn't blocking
  any real need. Unpark on: a real user need, a measured spike showing cloud-OCR + translate
  fits inside 2s, or an owner-signed relaxation of the region-latency budget for the opt-in
  path only.
- **Cloud STT backends (realtime-translate deferral).** Researched in full (candidates: Google
  Cloud STT, Azure AI Speech, possibly OpenAI realtime transcription) but never authorized -
  see `docs/decisions.md`, 2026-07-11 entry. Streaming raw audio off-machine is a bigger
  privacy trade than the OCR crop case, and local whisper (with the tier switcher) already
  covers ja/vi/en needs without egress. Unpark only on a genuine need (e.g. hardware too weak
  for local whisper) or explicit owner sign-off.

## Open gaps

- **Multi-monitor region select does not work on secondary displays.** Region selection only
  behaves correctly on the primary monitor; needs investigation into how `RegionRect`
  coordinates and the capture backend handle non-primary monitor origins/DPI.
- **Gated first signed release not yet executed (owner-only steps).** The release pipeline
  (`.github/workflows/release.yml`) and Tauri bundler/updater config are in place and gated
  (`workflow_dispatch` only, fail-closed without a signing key), but nobody has performed the
  one-time owner steps: generate the updater keypair (`tauri signer generate`), add
  `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)` to GitHub Actions secrets, replace the placeholder
  `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` with the real public key, then
  manually dispatch the release workflow and publish the resulting draft.

## Live-captions gaps (owner-reported)

- No STT model shown in the live-caption UI - the user can't tell which whisper tier is
  active.
- No pause/stop control on the live-caption overlay itself.
- Captions REPLACE the previous line instead of accumulating, so there is no readable running
  transcript of a session - only ever the latest line.
- Audio source is system-loopback only; there is no microphone input option.
- End-to-end speed still feels slow to the user in practice, independent of the measured p95
  numbers - worth a fresh look at perceived latency (e.g. partial/streaming captions) not just
  the benchmark figure.

## Housekeeping

- `docs/architecture.md`'s IPC and provider-contract sections should be spot-checked against
  `src/lib/ipc.ts` and the `src-tauri/src/shell/*.rs` / `src-tauri/src/providers/*.rs` code
  periodically - they were accurate as of the 2026 harness simplification but there is no
  longer an automated reminder hook tied to a `docs/architecture/` path.
