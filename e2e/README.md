# e2e - WebdriverIO + tauri-driver (TASK-022)

End-to-end acceptance gate for the critical flows (testing.md). Drives the RELEASE
binary through a real WebDriver session.

## Why the release binary

Debug / `tauri dev` load the WebView from `http://localhost:1420`, which is blocked in
this environment, and only the release build embeds the frontend so the automation session
can reach `http://tauri.localhost`. So e2e ALWAYS targets the release binary.

## Prerequisites

1. `cargo install tauri-driver --locked` (pinned 2.0.6).
2. `msedgedriver` matching the installed WebView2 runtime, at `e2e/.driver/msedgedriver.exe`
   (gitignored). Check the runtime version and download the matching build.
3. The release binary built WITH the e2e feature (adds the WebDriver-only region probe;
   absent from production builds):
   `npm run tauri build -- --no-bundle --features e2e`
   (run through the vcvars wrapper that puts CMake + LLVM on PATH and sets LIBCLANG_PATH).

## Run

```
npm run test:e2e            # all specs
npm run test:e2e:region     # just the region real-capturer spec
```

Point at a prebuilt binary / driver with `OST_E2E_BINARY` and `OST_E2E_MSEDGEDRIVER`.

## Specs and where they run

| Spec | Drives | Runs |
|------|--------|------|
| `smoke` | tauri-driver launch + DOM access | any display host + matching msedgedriver |
| `settings-keys` | real SettingsView + key-status IPC + OS keychain; masked-key invariant | same (no capture) |
| `overlay-lifecycle` | caption overlay keyboard operability | same (copy-with-content leg needs a live audio session -> dev host / manual) |
| `region-select` | the REAL WindowsScreenCapturer + PaddleOcrEngine via `e2e_region_probe`; asserts a terminal outcome and NON-HANG | needs a DISPLAY + OCR models present (`~/.oar`) -> dev host, not headless CI |

A green `smoke`/`settings`/`overlay` run does NOT prove screen capture works - only a
`region-select` run on a display-backed host with the OCR models present proves that.

## Troubleshooting

- `ETIMEDOUT` creating the session: kill stray `ost` / `tauri-driver` / `msedgedriver`
  processes and re-run (WebView2 session startup is occasionally flaky on the first try).
