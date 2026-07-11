//! Shared "never build a webview inline on the calling turn" helper (TASK-027,
//! generalizing TASK-023's fix across every window-creation site).
//!
//! # The defect this closes
//! TASK-023 proved with a cdb thread dump that calling
//! `WebviewWindowBuilder::build()` while the main thread is ALREADY nested
//! inside another WebView2 synchronous pump (`webview2_com::wait_with_pump`) -
//! e.g. because the caller is a `#[tauri::command]` invoked from inside a
//! WebView's own IPC callback - reenters wry and deadlocks on the
//! non-reentrant `WebviewWrapper` mutex. The global-hotkey/tray path never
//! showed this: it runs on a fresh top-level event-loop iteration, never
//! nested inside a pump. TASK-023 fixed ONE site (region-preview) by deferring
//! the open to the region-select window's `Destroyed` event. This module
//! generalizes that fix so EVERY window-creation site is safe regardless of
//! calling context, without requiring a "prior window closing" hook.
//!
//! # Mechanism (provably returns from the IPC callback before `build()` runs)
//! `AppHandle::run_on_main_thread` (tauri-runtime-wry `send_user_message`)
//! takes a FAST PATH that runs the closure INLINE, on the SAME call stack,
//! when it is called FROM the main thread - which would reproduce the exact
//! reentrancy this module exists to prevent. It only goes through the tao
//! event-loop proxy's `send_event` (queued, and drained by wry's
//! `handle_event_loop` at the top of the NEXT event-loop iteration - the same
//! safe point TASK-023 relies on via `WindowEvent::Destroyed`) when the
//! caller is a DIFFERENT thread. [`open_deferred`] therefore spawns a
//! short-lived worker thread whose only job is to hand the window-build
//! closure to `run_on_main_thread` FROM OFF the main thread, forcing the
//! queued path. The calling `#[tauri::command]` returns immediately (the
//! spawn is fire-and-forget), unblocking the IPC callback; the actual
//! `build()` runs later, on the main thread, but on a fresh event-loop turn -
//! never nested inside the callback's own pump.
//!
//! # Guard
//! Every window-creation call in `src-tauri/src/shell/` MUST go through
//! [`open_deferred`] - see `no_raw_webview_window_builder_outside_this_module`
//! below, which fails `cargo test` if a raw `WebviewWindowBuilder` reappears
//! in any other `shell/*.rs` file.

use std::thread;

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// How to react when the target window is ALREADY open. Chosen per call site
/// so [`open_deferred`] preserves each window's pre-existing behavior exactly
/// (no build is involved on this path - it is always safe to run inline).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Existing {
    /// Only bring the window to the foreground (the overlay windows - caption,
    /// region select/preview - are already visible once created and are never
    /// hidden while alive).
    FocusOnly,
    /// Un-hide (close-to-tray windows are hidden, not destroyed, on close -
    /// `shell::on_window_event`) THEN focus (Settings, History).
    ShowAndFocus,
}

impl Existing {
    fn apply<R: Runtime>(self, window: &WebviewWindow<R>) {
        if matches!(self, Existing::ShowAndFocus) {
            let _ = window.show();
        }
        let _ = window.set_focus();
    }
}

/// Open (or focus) a single-instance window WITHOUT EVER calling
/// `WebviewWindowBuilder::build()` on the current call stack (see module docs
/// for the full mechanism and why this is the fix, not a guess).
///
/// `configure` builds the window's option chain (title/decorations/size/etc)
/// on a fresh main-thread turn; `after_build` runs any post-build setup that
/// must happen before the window is user-visible (e.g. the region-select
/// overlay's monitor positioning) and is responsible for showing the window
/// when the builder used `.visible(false)`. Both closures run on the main
/// thread but AFTER the calling command has already returned, so neither can
/// observe or report a build failure synchronously - failures are logged
/// (never silently dropped, human-in-the-loop.md) rather than propagated.
pub fn open_deferred<R, F, A>(
    app: &AppHandle<R>,
    label: &'static str,
    url: WebviewUrl,
    existing: Existing,
    configure: F,
    after_build: A,
) where
    R: Runtime,
    F: for<'a> FnOnce(
            WebviewWindowBuilder<'a, R, AppHandle<R>>,
        ) -> WebviewWindowBuilder<'a, R, AppHandle<R>>
        + Send
        + 'static,
    A: FnOnce(&WebviewWindow<R>) -> tauri::Result<()> + Send + 'static,
{
    if let Some(window) = app.get_webview_window(label) {
        existing.apply(&window);
        return;
    }

    let main_thread_app = app.clone();
    // Spawn OFF the main thread so `run_on_main_thread` cannot take its
    // same-thread fast path (which would run `build()` inline, on THIS call
    // stack, reproducing the reentrant deadlock). See module docs.
    thread::spawn(move || {
        let deferred_app = main_thread_app.clone();
        let schedule_result = main_thread_app.run_on_main_thread(move || {
            // Re-check on the main thread: another caller may have opened the
            // window between the check above and this deferred turn running.
            if deferred_app.get_webview_window(label).is_some() {
                return;
            }
            let builder = configure(WebviewWindowBuilder::new(&deferred_app, label, url));
            match builder.build() {
                Ok(window) => {
                    if let Err(error) = after_build(&window) {
                        tracing::error!(
                            label,
                            %error,
                            "deferred window post-build setup failed"
                        );
                    }
                }
                Err(error) => {
                    tracing::error!(label, %error, "deferred window build failed");
                }
            }
        });
        if let Err(error) = schedule_result {
            tracing::error!(label, %error, "failed to schedule a deferred window open");
        }
    });
}

/// e2e-only observability (mirrors `region::e2e_region_probe`): returns the
/// labels of every currently open window. tauri-driver attaches to ONE
/// WebView and cannot switch to the app's other windows (documented
/// single-WebView limit), so this lets a WebDriver session assert that a
/// DEFERRED build actually produced the window it scheduled - not merely
/// that the app stayed responsive. Absent from production builds.
#[cfg(feature = "e2e")]
#[tauri::command]
pub fn e2e_list_window_labels(app: tauri::AppHandle) -> Vec<String> {
    app.webview_windows().keys().cloned().collect()
}

#[cfg(test)]
mod tests {
    /// GUARD (TASK-027): a raw `WebviewWindowBuilder` outside this module
    /// reintroduces the exact reentrant-deadlock risk TASK-023/027 fixed - any
    /// new (or reverted) window-creation site MUST go through
    /// [`super::open_deferred`] instead of calling `WebviewWindowBuilder`
    /// directly. This test greps every sibling `shell/*.rs` source file so a
    /// regression fails `cargo test`, not just code review.
    #[test]
    fn no_raw_webview_window_builder_outside_this_module() {
        let shell_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/shell");
        let entries = std::fs::read_dir(&shell_dir)
            .unwrap_or_else(|error| panic!("read {}: {error}", shell_dir.display()));

        let mut offenders = Vec::new();
        for entry in entries {
            let entry = entry.expect("dir entry");
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("rs") {
                continue;
            }
            if path.file_name().and_then(|name| name.to_str()) == Some("windows.rs") {
                continue; // the ONLY module allowed to build a webview window.
            }
            let contents = std::fs::read_to_string(&path)
                .unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
            if contents.contains("WebviewWindowBuilder") {
                offenders.push(path.display().to_string());
            }
        }

        assert!(
            offenders.is_empty(),
            "raw WebviewWindowBuilder usage found outside shell/windows.rs: {offenders:?} - \
             route window creation through shell::windows::open_deferred (TASK-027 guard)"
        );
    }
}
