// convertFlow Tauri entrypoint.
//
// Wraps the bundled Astro+Svelte frontend in a native window. Desktop
// preferences live in the frontend's localStorage (`dataprep:appSettings`)
// so the same source of truth drives both the web app and the desktop app.
//
// Rust side only handles:
//   - on close-request: always prevent close, emit `desktop://request-exit`
//     to the frontend. Frontend reads `desktopConfirmExit` from localStorage
//     and either (a) calls window.destroy directly, or (b) shows a confirm
//     dialog and calls destroy if the user agrees.
//   - on setup: eval a one-shot snippet inside the webview so it can apply
//     `desktopStartMinimized` and restore the last `dataprep:windowSize`.

use tauri::{Emitter, Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Always defer to the frontend — it owns the user pref and
                // calls destroy when appropriate. This keeps the Rust side
                // dumb and the JS side authoritative.
                api.prevent_close();
                let _ = window.emit("desktop://request-exit", ());
            }
        })
        .setup(|app| {
            let main = app
                .get_webview_window("main")
                .expect("main window missing");

            // One eval that reads localStorage, applies window size if
            // remembered, and minimises on launch if requested. Runs after
            // a 100ms beat so layout has measured before any minimise.
            let _ = main.eval(
                "(function(){\
                    try{\
                        const s=JSON.parse(localStorage.getItem('dataprep:appSettings')||'{}');\
                        if(s.desktopRememberWindowSize!==false){\
                            const sz=JSON.parse(localStorage.getItem('dataprep:windowSize')||'null');\
                            if(sz && sz.w>=400 && sz.h>=300){\
                                window.__TAURI_INTERNALS__.invoke('plugin:window|set_size',{size:{type:'Physical',width:sz.w,height:sz.h}}).catch(()=>{});\
                            }\
                            window.addEventListener('beforeunload',function(){\
                                try{\
                                    localStorage.setItem('dataprep:windowSize',JSON.stringify({w:Math.round(window.outerWidth*window.devicePixelRatio),h:Math.round(window.outerHeight*window.devicePixelRatio)}));\
                                }catch(e){}\
                            });\
                        }\
                        if(s.desktopStartMinimized){\
                            setTimeout(function(){\
                                window.__TAURI_INTERNALS__.invoke('plugin:window|minimize').catch(()=>{});\
                            },120);\
                        }\
                    }catch(e){}\
                })()",
            );

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running convertFlow");
}
