fn main() {
    // Public PE files should record a filename rather than the developer's PDB path.
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        println!("cargo:rustc-link-arg=/PDBALTPATH:md-sticky-note.pdb");
    }
    // Windows EXE resources must be rebuilt when the branding assets change.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
