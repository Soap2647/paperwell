// Yerel yapay zekâ çıkarımı: ONNX Runtime + DirectML (her DirectX 12 ekran kartı), olmazsa CPU.
// Modeller uygulama veri klasörüne iner; tensörler JS ile ham bayt olarak gidip gelir (JSON sayı dizisi yok).
//
// Ham ileti biçimi (istek ve yanıt aynı):
//   [u32 LE başlık uzunluğu][başlık JSON][0-7 bayt dolgu][tensör baytları...]
//   başlık: {"session":1,"tensors":[{"name":"x","type":"float32","dims":[1,3,320,320],"offset":0,"length":1228800}]}
//   offset tensör bölgesinin başına göredir.

use ort::ep::{self, ExecutionProvider};
use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::{DynValue, Tensor, TensorElementType, ValueType};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Serialize, Default)]
pub struct AccelInfo {
    /// "directml" ya da "cpu"; ONNX Runtime hiç yüklenemediyse boş
    pub provider: String,
    pub adapter: Option<String>,
    pub vram_mb: Option<u64>,
    /// GPU kullanılamıyorsa nedeni
    pub reason: Option<String>,
}

struct Loaded {
    session: Mutex<Session>,
    inputs: Vec<String>,
    outputs: Vec<String>,
}

#[derive(Default)]
pub struct Ai {
    info: Mutex<Option<AccelInfo>>,
    sessions: Mutex<Vec<Arc<Loaded>>>,
    by_key: Mutex<HashMap<String, (usize, String)>>,
    /// Rust'ta tutulan çıktılar (ör. SAM gömmeleri): her çözümde 16 MB'ı yeniden göndermemek için
    stash: Mutex<HashMap<u64, Arc<DynValue>>>,
    next_ref: std::sync::atomic::AtomicU64,
}

static ENV: OnceLock<Result<ort::environment::Environment, String>> = OnceLock::new();

fn env() -> Result<&'static ort::environment::Environment, String> {
    ENV.get_or_init(|| ort::init().with_name("paperwell").build().map_err(|e| e.to_string()))
        .as_ref()
        .map_err(|e| e.clone())
}

/// En güçlü (yüksek performans tercihli) donanım ekran kartı: DirectML'in seçeceğiyle aynı sıra
#[cfg(windows)]
fn best_adapter() -> Option<(String, u64)> {
    use windows::Win32::Graphics::Dxgi::*;
    unsafe {
        let factory: IDXGIFactory6 = CreateDXGIFactory1().ok()?;
        for i in 0.. {
            let adapter: IDXGIAdapter1 = factory.EnumAdapterByGpuPreference(i, DXGI_GPU_PREFERENCE_HIGH_PERFORMANCE).ok()?;
            let desc = adapter.GetDesc1().ok()?;
            if desc.Flags & (DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32) != 0 {
                continue;
            }
            let end = desc.Description.iter().position(|&c| c == 0).unwrap_or(desc.Description.len());
            return Some((String::from_utf16_lossy(&desc.Description[..end]), (desc.DedicatedVideoMemory / (1 << 20)) as u64));
        }
        None
    }
}

#[cfg(not(windows))]
fn best_adapter() -> Option<(String, u64)> {
    None
}

impl Ai {
    pub fn info(&self) -> AccelInfo {
        let mut g = self.info.lock().unwrap();
        if g.is_none() {
            *g = Some(probe());
        }
        g.clone().unwrap()
    }

    /// Tek bir model DirectML'de açılamadıysa o model CPU'da çalışır; diğerleri GPU'da kalır, neden bildirilir
    fn gpu_failed(&self, reason: String) {
        if let Some(i) = self.info.lock().unwrap().as_mut() {
            i.reason = Some(reason);
        }
    }
}

fn probe() -> AccelInfo {
    if let Err(e) = env() {
        return AccelInfo { reason: Some(format!("ONNX Runtime yüklenemedi: {e}")), ..Default::default() };
    }
    if std::env::var_os("PAPERWELL_NO_GPU").is_some() {
        return AccelInfo { provider: "cpu".into(), reason: Some("PAPERWELL_NO_GPU ile kapatıldı".into()), ..Default::default() };
    }
    match (ep::DirectML::is_available(), best_adapter()) {
        (Ok(true), Some((name, vram))) => AccelInfo { provider: "directml".into(), adapter: Some(name), vram_mb: Some(vram), reason: None },
        (Ok(true), None) => AccelInfo { provider: "cpu".into(), reason: Some("DirectX 12 ekran kartı bulunamadı".into()), ..Default::default() },
        (Ok(false), _) => AccelInfo { provider: "cpu".into(), reason: Some("DirectML bu ONNX Runtime derlemesinde yok".into()), ..Default::default() },
        (Err(e), _) => AccelInfo { provider: "cpu".into(), reason: Some(e.to_string()), ..Default::default() },
    }
}

// ─── Model önbelleği ─────────────────────────────────────────────────────────

const ALLOWED: &str = "https://huggingface.co/";

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("models"))
}

/// URL'nin klasörü kısa bir özetle, dosya adı aynen korunur (harici veri dosyaları modelin yanında aranır)
fn cache_path(dir: &Path, url: &str) -> Result<PathBuf, String> {
    if !url.starts_with(ALLOWED) {
        return Err(format!("izin verilmeyen model adresi: {url}"));
    }
    let (base, name) = url.rsplit_once('/').ok_or("geçersiz adres")?;
    if name.is_empty() || name.contains(['\\', ':', '?', '#']) || name.starts_with('.') {
        return Err("geçersiz dosya adı".into());
    }
    // FNV-1a: kararlı, bağımlılıksız
    let mut h: u64 = 0xcbf29ce484222325;
    for b in base.bytes() {
        h = (h ^ b as u64).wrapping_mul(0x100000001b3);
    }
    Ok(dir.join(format!("{h:016x}")).join(name))
}

#[tauri::command]
pub fn ai_info(ai: State<Ai>) -> AccelInfo {
    ai.info()
}

#[tauri::command]
pub fn ai_cached(app: AppHandle, urls: Vec<String>) -> Result<bool, String> {
    let dir = models_dir(&app)?;
    for u in &urls {
        if !cache_path(&dir, u)?.is_file() {
            return Ok(false);
        }
    }
    Ok(true)
}

#[derive(Clone, Serialize)]
struct Progress<'a> {
    url: &'a str,
    loaded: u64,
    total: u64,
}

fn download(app: &AppHandle, url: &str, path: &Path) -> Result<(), String> {
    let mut res = ureq::get(url).call().map_err(|e| format!("indirilemedi: {e}"))?;
    let total = res.headers().get("content-length").and_then(|v| v.to_str().ok()?.parse().ok()).unwrap_or(0);
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let part = path.with_extension("part");
    let mut file = std::fs::File::create(&part).map_err(|e| e.to_string())?;
    let mut reader = res.body_mut().with_config().limit(4 << 30).reader();
    let mut buf = vec![0u8; 1 << 20];
    let (mut loaded, mut last) = (0u64, Instant::now());
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        loaded += n as u64;
        if last.elapsed().as_millis() > 150 {
            last = Instant::now();
            let _ = app.emit("ai-download", Progress { url, loaded, total });
        }
    }
    drop(file);
    if total > 0 && loaded != total {
        let _ = std::fs::remove_file(&part);
        return Err("indirme yarıda kaldı".into());
    }
    std::fs::rename(&part, path).map_err(|e| e.to_string())?;
    let _ = app.emit("ai-download", Progress { url, loaded, total: loaded });
    Ok(())
}

/// Modeli (onay JS tarafında alındıktan sonra) indirir; zaten varsa hemen döner. İlerleme: "ai-download" olayı.
#[tauri::command]
pub async fn ai_download(app: AppHandle, url: String) -> Result<(), String> {
    let path = cache_path(&models_dir(&app)?, &url)?;
    if path.is_file() {
        return Ok(());
    }
    tauri::async_runtime::spawn_blocking(move || download(&app, &url, &path))
        .await
        .map_err(|e| e.to_string())?
}

// ─── Oturumlar ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct LoadArgs {
    /// İlk adres model, diğerleri harici veri (önceden indirilmiş olmalı)
    urls: Vec<String>,
    /// false: GPU varken bile CPU (ör. DirectML'de hatalı çalışan model)
    #[serde(default = "yes")]
    gpu: bool,
}
fn yes() -> bool {
    true
}

#[derive(Serialize)]
pub struct Loadedinfo {
    session: usize,
    inputs: Vec<String>,
    outputs: Vec<String>,
    provider: String,
    ms: u128,
}

fn build(path: &Path, gpu: bool) -> ort::Result<Session> {
    let mut b = Session::builder(env().map_err(ort::Error::new)?)?.with_optimization_level(GraphOptimizationLevel::Level3)?;
    if gpu {
        // DirectML: bellek deseni ve paralel yürütme kapalı olmalı
        b = b.with_memory_pattern(false)?.with_parallel_execution(false)?.with_execution_providers([ep::DirectML::default()
            .with_performance_preference(ep::directml::PerformancePreference::HighPerformance)
            .build()
            .error_on_failure()])?;
    } else {
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
        b = b.with_intra_threads(threads)?;
    }
    b.commit_from_file(path)
}

#[tauri::command]
pub async fn ai_load(app: AppHandle, args: LoadArgs) -> Result<Loadedinfo, String> {
    let dir = models_dir(&app)?;
    let path = cache_path(&dir, args.urls.first().ok_or("model adresi yok")?)?;
    for u in &args.urls {
        if !cache_path(&dir, u)?.is_file() {
            return Err(format!("model indirilmemiş: {u}"));
        }
    }
    let ai = app.state::<Ai>();
    let want_gpu = args.gpu && ai.info().provider == "directml";
    let key = format!("{}|{want_gpu}", args.urls[0]);
    if let Some((id, provider)) = ai.by_key.lock().unwrap().get(&key).cloned() {
        let s = ai.sessions.lock().unwrap()[id].clone();
        return Ok(Loadedinfo { session: id, inputs: s.inputs.clone(), outputs: s.outputs.clone(), provider, ms: 0 });
    }
    let t0 = Instant::now();
    let app2 = app.clone();
    let (session, provider) = tauri::async_runtime::spawn_blocking(move || -> Result<(Session, String), String> {
        if want_gpu {
            match build(&path, true) {
                Ok(s) => return Ok((s, "directml".into())),
                Err(e) => app2.state::<Ai>().gpu_failed(format!("DirectML oturumu açılamadı: {e}")),
            }
        }
        build(&path, false).map(|s| (s, "cpu".into())).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    let loaded = Arc::new(Loaded {
        inputs: session.inputs().iter().map(|o| o.name().to_string()).collect(),
        outputs: session.outputs().iter().map(|o| o.name().to_string()).collect(),
        session: Mutex::new(session),
    });
    let id = {
        let mut v = ai.sessions.lock().unwrap();
        v.push(loaded.clone());
        v.len() - 1
    };
    ai.by_key.lock().unwrap().insert(key, (id, provider.clone()));
    Ok(Loadedinfo { session: id, inputs: loaded.inputs.clone(), outputs: loaded.outputs.clone(), provider, ms: t0.elapsed().as_millis() })
}

#[derive(Serialize, Deserialize)]
struct TensorHead {
    name: String,
    #[serde(rename = "type")]
    ty: String,
    dims: Vec<i64>,
    #[serde(default)]
    offset: usize,
    #[serde(default)]
    length: usize,
    /// Veri yerine Rust'ta tutulan tensörün kimliği
    #[serde(default, rename = "ref", skip_serializing_if = "Option::is_none")]
    reference: Option<u64>,
}

#[derive(Serialize, Deserialize)]
struct Head {
    session: usize,
    tensors: Vec<TensorHead>,
    /// Rust'ta tutulacak (JS'e verisi gönderilmeyecek) çıktı adları
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    keep: Vec<String>,
}

fn parse(body: &[u8]) -> Result<(Head, &[u8]), String> {
    if body.len() < 4 {
        return Err("boş ileti".into());
    }
    let n = u32::from_le_bytes(body[..4].try_into().unwrap()) as usize;
    let head: Head = serde_json::from_slice(body.get(4..4 + n).ok_or("kısa ileti")?).map_err(|e| e.to_string())?;
    let start = (4 + n + 7) & !7;
    Ok((head, body.get(start..).unwrap_or(&[])))
}

fn cast<T: Copy>(b: &[u8]) -> Vec<T> {
    let n = b.len() / std::mem::size_of::<T>();
    let mut v = Vec::<T>::with_capacity(n);
    // Kaynak hizalı olmayabilir: bayt bayt kopyala
    unsafe {
        std::ptr::copy_nonoverlapping(b.as_ptr(), v.as_mut_ptr() as *mut u8, n * std::mem::size_of::<T>());
        v.set_len(n);
    }
    v
}

fn bytes_of<T>(v: &[T]) -> &[u8] {
    unsafe { std::slice::from_raw_parts(v.as_ptr() as *const u8, std::mem::size_of_val(v)) }
}

fn to_value(t: &TensorHead, data: &[u8]) -> Result<DynValue, String> {
    let b = data.get(t.offset..t.offset + t.length).ok_or("tensör sınır dışı")?;
    let shape = t.dims.clone();
    let v = match t.ty.as_str() {
        "float32" => Tensor::from_array((shape, cast::<f32>(b))).map(|t| t.into_dyn()),
        "uint8" => Tensor::from_array((shape, b.to_vec())).map(|t| t.into_dyn()),
        "int8" => Tensor::from_array((shape, cast::<i8>(b))).map(|t| t.into_dyn()),
        "int32" => Tensor::from_array((shape, cast::<i32>(b))).map(|t| t.into_dyn()),
        "int64" => Tensor::from_array((shape, cast::<i64>(b))).map(|t| t.into_dyn()),
        "bool" => Tensor::from_array((shape, b.iter().map(|&x| x != 0).collect::<Vec<bool>>())).map(|t| t.into_dyn()),
        other => return Err(format!("desteklenmeyen tensör türü: {other}")),
    };
    v.map_err(|e| e.to_string())
}

/// (tür, boyutlar, ham bayt)
type Raw = (String, Vec<i64>, Vec<u8>);

fn from_value(v: &DynValue) -> Result<Raw, String> {
    let ty = match v.dtype() {
        ValueType::Tensor { ty, .. } => *ty,
        other => return Err(format!("tensör olmayan çıktı: {other:?}")),
    };
    macro_rules! ext {
        ($t:ty, $name:expr) => {{
            let (shape, d) = v.try_extract_tensor::<$t>().map_err(|e| e.to_string())?;
            ($name.to_string(), shape.to_vec(), bytes_of(d).to_vec())
        }};
    }
    Ok(match ty {
        TensorElementType::Float32 => ext!(f32, "float32"),
        TensorElementType::Uint8 => ext!(u8, "uint8"),
        TensorElementType::Int8 => ext!(i8, "int8"),
        TensorElementType::Int32 => ext!(i32, "int32"),
        TensorElementType::Int64 => ext!(i64, "int64"),
        TensorElementType::Bool => {
            let (shape, d) = v.try_extract_tensor::<bool>().map_err(|e| e.to_string())?;
            ("bool".into(), shape.to_vec(), d.iter().map(|&x| x as u8).collect())
        }
        other => return Err(format!("desteklenmeyen çıktı türü: {other:?}")),
    })
}

fn encode(session: usize, outs: Vec<(TensorHead, Vec<u8>)>) -> Vec<u8> {
    let mut tensors = Vec::new();
    let mut off = 0;
    for (mut t, data) in outs.iter().map(|(t, d)| (TensorHead { name: t.name.clone(), ty: t.ty.clone(), dims: t.dims.clone(), offset: 0, length: 0, reference: t.reference }, d)) {
        t.offset = off;
        t.length = data.len();
        off = (off + data.len() + 7) & !7;
        tensors.push(t);
    }
    let head = serde_json::to_vec(&Head { session, tensors, keep: vec![] }).unwrap();
    let start = (4 + head.len() + 7) & !7;
    let mut out = vec![0u8; start + off];
    out[..4].copy_from_slice(&(head.len() as u32).to_le_bytes());
    out[4..4 + head.len()].copy_from_slice(&head);
    let mut off = 0;
    for (_, data) in &outs {
        out[start + off..start + off + data.len()].copy_from_slice(data);
        off = (off + data.len() + 7) & !7;
    }
    out
}

fn run(ai: &Ai, body: &[u8]) -> Result<Vec<u8>, String> {
    let (head, data) = parse(body)?;
    let s = ai.sessions.lock().unwrap().get(head.session).cloned().ok_or("oturum yok")?;
    // Önce saklı tensörleri topla (görünümleri bunlardan ödünç alınır)
    let mut held: Vec<Option<Arc<DynValue>>> = Vec::with_capacity(head.tensors.len());
    {
        let stash = ai.stash.lock().unwrap();
        for t in &head.tensors {
            held.push(match t.reference {
                Some(r) => Some(stash.get(&r).cloned().ok_or("saklı tensör bulunamadı")?),
                None => None,
            });
        }
    }
    let mut inputs: Vec<(String, ort::session::SessionInputValue)> = Vec::with_capacity(head.tensors.len());
    for (t, h) in head.tensors.iter().zip(&held) {
        match h {
            Some(v) => inputs.push((t.name.clone(), v.view().into())),
            None => inputs.push((t.name.clone(), to_value(t, data)?.into())),
        }
    }
    let mut session = s.session.lock().unwrap();
    let mut outputs = session.run(inputs).map_err(|e| e.to_string())?;
    let mut res = Vec::new();
    for name in &s.outputs {
        if head.keep.contains(name) {
            let v = outputs.remove(name.as_str()).ok_or("çıktı yok")?;
            let (ty, dims) = match v.dtype() {
                ValueType::Tensor { ty, shape, .. } => (format!("{ty:?}").to_lowercase(), shape.to_vec()),
                _ => return Err("tensör olmayan çıktı".into()),
            };
            let id = ai.next_ref.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            ai.stash.lock().unwrap().insert(id, Arc::new(v));
            res.push((TensorHead { name: name.clone(), ty, dims, offset: 0, length: 0, reference: Some(id) }, Vec::new()));
        } else {
            let (ty, dims, bytes) = from_value(&outputs[name.as_str()])?;
            res.push((TensorHead { name: name.clone(), ty, dims, offset: 0, length: 0, reference: None }, bytes));
        }
    }
    Ok(encode(head.session, res))
}

/// Saklı tensörleri bırakır
#[tauri::command]
pub fn ai_free(ai: State<Ai>, refs: Vec<u64>) {
    let mut stash = ai.stash.lock().unwrap();
    for r in refs {
        stash.remove(&r);
    }
}

/// Ham bayt girdi → ham bayt çıktı (biçim dosya başında)
#[tauri::command]
pub async fn ai_run(app: AppHandle, request: Request<'_>) -> Result<Response, String> {
    let body = match request.body() {
        InvokeBody::Raw(b) => b.clone(),
        _ => return Err("ham veri bekleniyordu".into()),
    };
    tauri::async_runtime::spawn_blocking(move || run(&app.state::<Ai>(), &body).map(Response::new))
        .await
        .map_err(|e| e.to_string())?
}

/// Paketlenmiş uygulamayı arayüzsüz denemek için: `paperwell.exe --ai-selftest <model.onnx> <sonuç.json>`
/// Modeli GPU ile (yoksa CPU) açar, tüm girdileri sıfır tensörle besleyip süreyi yazar.
pub fn selftest(model: &str, out: &str) {
    let ai = Ai::default();
    let info = ai.info();
    let mut report = serde_json::json!({ "info": info });
    let res = (|| -> Result<serde_json::Value, String> {
        let gpu = info.provider == "directml";
        let t0 = Instant::now();
        let (mut s, provider) = match build(Path::new(model), gpu) {
            Ok(s) => (s, if gpu { "directml" } else { "cpu" }),
            Err(e) if gpu => {
                report["gpu_error"] = e.to_string().into();
                (build(Path::new(model), false).map_err(|e| e.to_string())?, "cpu")
            }
            Err(e) => return Err(e.to_string()),
        };
        let load_ms = t0.elapsed().as_millis();
        let mut inputs: Vec<(String, DynValue)> = Vec::new();
        for i in s.inputs() {
            let ValueType::Tensor { shape, .. } = i.dtype() else { return Err("tensör olmayan girdi".into()) };
            let dims: Vec<i64> = shape.iter().map(|&d| if d < 0 { 320 } else { d }).collect();
            let n = dims.iter().product::<i64>() as usize;
            inputs.push((i.name().to_string(), Tensor::from_array((dims, vec![0f32; n])).map_err(|e| e.to_string())?.into_dyn()));
        }
        let mut times = Vec::new();
        for _ in 0..3 {
            let t = Instant::now();
            let o = s.run(inputs.iter().map(|(k, v)| (k.as_str(), v.view())).collect::<Vec<_>>()).map_err(|e| e.to_string())?;
            drop(o);
            times.push(t.elapsed().as_millis());
        }
        Ok(serde_json::json!({ "provider": provider, "load_ms": load_ms, "run_ms": times }))
    })();
    match res {
        Ok(v) => report["result"] = v,
        Err(e) => report["error"] = e.into(),
    }
    let _ = std::fs::write(out, serde_json::to_string_pretty(&report).unwrap());
}
