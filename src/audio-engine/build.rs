/// Build script for audio-engine WebAssembly target
/// 
/// This script configures compiler settings for optimal WASM performance:
/// - Target-specific features for WebAssembly
/// - Optimization flags for small binary size and fast execution

fn main() {
    // Configure Rust flags for WASM optimization
    println!("cargo:rustc-env=RUSTFLAGS=-C target-feature=+simd128");
    
    // Set feature flags for optimal WASM compilation
    println!("cargo:rustc-cfg=wasm");
    
    // Inform cargo about the optimization profile
    println!("cargo:rustc-env=PROFILE=release");
}
