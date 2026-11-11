use std::path::PathBuf;

fn main() {
    // ort-sys (links = "onnxruntime") derleme betiği önce çalışır ve DirectML.dll'i hedef klasöre koyar.
    // Tauri paketine kaynak olarak sabit bir yoldan eklemek için oraya kopyalanır.
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let profile_dir = out.ancestors().nth(3).unwrap();
    let dst = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("target").join("bundle-libs");
    std::fs::create_dir_all(&dst).unwrap();
    let src = profile_dir.join("DirectML.dll");
    if src.is_file() {
        std::fs::copy(&src, dst.join("DirectML.dll")).unwrap();
    } else if !dst.join("DirectML.dll").is_file() {
        println!("cargo:warning=DirectML.dll bulunamadı ({})", src.display());
    }
    tauri_build::build()
}
