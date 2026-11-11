// Paperwell masaüstü kabuğu: dosya aç/kaydet, "Birlikte aç" ile gelen dosyalar, Inkwell köprüsü.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{Emitter, Manager, State};

/// Uygulama açılırken komut satırından gelen dosyalar
struct Opened(Mutex<Vec<String>>);

fn file_args(args: &[String]) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-') && Path::new(a).is_file())
        .cloned()
        .collect()
}

/// Başlık değerlerinde yalnız ASCII olabilir; yol JS tarafında yüzde-kodlanır
fn percent_decode(s: &str) -> Result<String, String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            let hex = std::str::from_utf8(&b[i + 1..i + 3]).map_err(|e| e.to_string())?;
            out.push(u8::from_str_radix(hex, 16).map_err(|e| e.to_string())?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|e| e.to_string())
}

fn header(request: &Request, name: &str) -> Result<String, String> {
    let raw = request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("{name} başlığı eksik"))?;
    percent_decode(raw)
}

fn body_bytes<'a>(request: &'a Request) -> Result<&'a [u8], String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes),
        _ => Err("ham veri bekleniyordu".into()),
    }
}

#[tauri::command]
fn take_opened_files(state: State<Opened>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

#[tauri::command]
fn read_file(path: String) -> Result<Response, String> {
    std::fs::read(&path).map(Response::new).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(request: Request) -> Result<(), String> {
    let path = header(&request, "x-path")?;
    std::fs::write(&path, body_bytes(&request)?).map_err(|e| e.to_string())
}

/// Inkwell'in kurulu olduğu yeri arar
fn find_inkwell() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(p) = std::env::var("INKWELL_PATH") {
        candidates.push(PathBuf::from(p));
    }
    #[cfg(windows)]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            candidates.push(PathBuf::from(&local).join("Inkwell").join("inkwell.exe"));
            candidates.push(PathBuf::from(&local).join("Programs").join("Inkwell").join("inkwell.exe"));
        }
        for var in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(pf) = std::env::var(var) {
                candidates.push(PathBuf::from(pf).join("Inkwell").join("inkwell.exe"));
            }
        }
    }
    #[cfg(target_os = "macos")]
    candidates.push(PathBuf::from("/Applications/Inkwell.app/Contents/MacOS/inkwell"));
    #[cfg(target_os = "linux")]
    {
        candidates.push(PathBuf::from("/usr/bin/inkwell"));
        candidates.push(PathBuf::from("/usr/local/bin/inkwell"));
    }
    candidates.into_iter().find(|p| p.is_file())
}

#[tauri::command]
fn inkwell_available() -> bool {
    find_inkwell().is_some()
}

/// PDF'i geçici dosyaya yazıp Inkwell'de açar
#[tauri::command]
fn open_in_inkwell(request: Request) -> Result<String, String> {
    let exe = find_inkwell().ok_or("Inkwell bulunamadı")?;
    let name = header(&request, "x-name").unwrap_or_else(|_| "belge.pdf".into());
    let safe: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let dir = std::env::temp_dir().join("paperwell");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(safe);
    std::fs::write(&path, body_bytes(&request)?).map_err(|e| e.to_string())?;
    std::process::Command::new(exe)
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

fn main() {
    let initial = file_args(&std::env::args().collect::<Vec<_>>());

    tauri::Builder::default()
        // İkinci kez açılınca (ör. başka bir PDF'e çift tıklama) mevcut pencereye ilet
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let files = file_args(&args);
            if !files.is_empty() {
                let _ = app.emit("open-files", files);
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(Opened(Mutex::new(initial)))
        .invoke_handler(tauri::generate_handler![
            take_opened_files,
            read_file,
            write_file,
            inkwell_available,
            open_in_inkwell
        ])
        .run(tauri::generate_context!())
        .expect("Paperwell başlatılamadı");
}
