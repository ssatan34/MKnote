fn main() {
    // Windows EXE resources must be rebuilt when the branding assets change.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
