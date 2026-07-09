---
title: "ADR-001: Tauri 2 with Rust core and React 19 frontend"
status: Accepted
date: 2026-07-09
deciders: [nguyenhx2]
tags: [adr, architecture]
---

# ADR-001: Tauri 2 with Rust core and React 19 frontend

## Context

OST is a cross-platform desktop app whose top priorities are background operation, speed,
and low resource usage. It needs native system-audio loopback capture, screen-region
capture, always-on-top overlays, a system tray, and global hotkeys - while idling at
minimal RAM/CPU. The dev machine is Windows 11; Windows ships first.

## Decision

Tauri 2 with a Rust core owning all heavy pipelines (audio, STT, capture, OCR, provider
I/O) and a React 19 + TypeScript + Vite frontend in the system WebView. All OS-dependent
components sit behind Rust traits so macOS/Linux (Phase 4) swap implementations, not call
sites.

## Options considered

| Option | Pros | Cons |
|--------|------|------|
| A (chosen) Tauri 2 + Rust | ~10-40MB idle RAM, small binary, native-speed capture/STT in-process, first-class tray/overlay, memory-safe | Rust learning curve; toolchain must be installed |
| B Electron + TypeScript | Largest ecosystem, one language, fastest to prototype | 150-300MB idle RAM, contradicts the background/performance requirement; native audio capture still needs native modules |
| C Flutter desktop | Nice UI toolkit, single codebase | System-audio/region-capture plugins largely hand-written; immature desktop ecosystem for this niche |

## Consequences

- Positive: performance budgets (idle < 100MB RAM, < 1% CPU) are achievable; pipeline code
  is in-process with capture (no IPC hops for audio buffers).
- Negative / trade-off: two languages (Rust + TS); contributors need the Rust toolchain
  (TASK-001).
- Follow-up work: scaffold via create-tauri-app (TASK-002); define the capture/STT/OCR
  traits before the first pipeline lands.

## References

- Project intake, 2026-07-09 (framework question).
- docs/architecture/system-overview.md
