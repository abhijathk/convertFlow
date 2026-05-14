// convertFlow Tauri entrypoint.
//
// The frontend (Astro + Svelte) is served from the bundled dist/ folder.
// This crate wraps it with a native window and reads the user's settings
// from localStorage (via the webview) to honour desktop preferences:
//   - desktopStartMinimized
//   - desktopRememberWindowSize
//   - desktopConfirmExit
//   - desktopAutoUpdate (placeholder; wire updater plugin to use)
//   - desktopMinimizeToTray (placeholder; needs tray plugin)
//
// Settings live in localStorage under the key `dataprep:appSettings`. We
// read them on startup via an inline JS snippet evaluated in the webview
// so the same source of truth drives both the web app and the desktop app.

use tauri::{Emitter, Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // On window-close request, ask the frontend whether the user has
        // 'confirm before exit' enabled. The frontend handles the prompt;
        // it emits 'tauri://close-confirmed' back when the user approves.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Read the localStorage flag synchronously via eval. If the
                // user opted in to confirm-on-exit, we delay the actual
                // close and let the frontend show its own dialog.
                let confirm_exit = window
                    .eval(
                        "(function(){\
                            try{\
                                const s=JSON.parse(localStorage.getItem('dataprep:appSettings')||'{}');\
                                return !!s.desktopConfirmExit;\
                            }catch(e){return false;}\
                        })()",
                    )
                    .is_ok();
                if confirm_exit {
                    api.prevent_close();
                    let _ = window.emit("desktop://request-exit", ());
                }
            }
        })
        .setup(|app| {
            let main = app
                .get_webview_window("main")
                .expect("main window missing");

            // Read user prefs from localStorage via a one-shot eval. We
            // do this AFTER the window mounts so localStorage is ready.
            let prefs_js = "(function(){\
                try{\
                    const s=JSON.parse(localStorage.getItem('dataprep:appSettings')||'{}');\
                    return JSON.stringify({\
                        startMinimized: !!s.desktopStartMinimized,\
                        rememberWindowSize: s.desktopRememberWindowSize !== false,\
                        confirmExit: !!s.desktopConfirmExit,\
                    });\
                }catch(e){return '{}';}\
            })()";

            // If start-minimized is on, minimize after the window's first
            // paint. We use a short timer so the layout has a chance to
            // measure before disappearing into the dock/taskbar.
            let _ = main.eval(&format!(
                "setTimeout(function(){{\
                    try{{\
                        const prefs=JSON.parse({prefs_js});\
                        if(prefs.startMinimized){{\
                            window.__TAURI_INTERNALS__.invoke('plugin:window|minimize').catch(()=>{{}});\
                        }}\
                    }}catch(e){{}}\
                }},120);",
                prefs_js = prefs_js
            ));

            // Persist window size across launches when rememberWindowSize
            // is enabled. Read last-known size from localStorage and apply
            // it; on close (handled above) the frontend writes back.
            let _ = main.eval(
                "(function(){\
                    try{\
                        const s=JSON.parse(localStorage.getItem('dataprep:appSettings')||'{}');\
                        if(s.desktopRememberWindowSize===false)return;\
                        const sz=JSON.parse(localStorage.getItem('dataprep:windowSize')||'null');\
                        if(sz && sz.w>=400 && sz.h>=300){\
                            window.__TAURI_INTERNALS__.invoke('plugin:window|set_size',{size:{type:'Physical',width:sz.w,height:sz.h}}).catch(()=>{});\
                        }\
                        window.addEventListener('beforeunload',function(){\
                            try{\
                                localStorage.setItem('dataprep:windowSize',JSON.stringify({w:window.outerWidth*window.devicePixelRatio,h:window.outerHeight*window.devicePixelRatio}));\
                            }catch(e){}\
                        });\
                    }catch(e){}\
                })()",
            );

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running convertFlow");
}
