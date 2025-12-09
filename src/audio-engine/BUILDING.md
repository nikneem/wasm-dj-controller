# Audio Engine - Build & Deployment Guide

Complete guide for building, testing, and deploying the WASM audio engine.

## Environment Setup

### 1. Install Rust (if not already installed)

**Windows:**
```bash
# Download and run rustup installer
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Or download from: https://rustup.rs/
```

**macOS/Linux:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 2. Install Required Tools

```bash
# Update Rust
rustup update

# Install wasm32 target
rustup target add wasm32-unknown-unknown

# Install wasm-pack
cargo install wasm-pack
```

### 3. Verify Installation

```bash
rustc --version          # Should show Rust version
cargo --version          # Should show Cargo version
wasm-pack --version      # Should show wasm-pack version
```

## Project Structure

```
audio-engine/
├── Cargo.toml           # Project manifest and dependencies
├── Cargo.lock           # Lock file (auto-generated)
├── build.rs             # Build script for optimization flags
├── README.md            # User documentation
├── BUILDING.md          # This file
├── src/
│   ├── lib.rs           # Main entry point (1000+ lines)
│   ├── buffer_manager.rs
│   ├── equalizer.rs
│   ├── fader.rs
│   ├── phase_vocoder.rs
│   └── pitch_shifter.rs
└── pkg/                 # Generated WASM package (after build)
    ├── audio_engine.wasm
    ├── audio_engine.js
    ├── audio_engine.d.ts
    └── package.json
```

## Building from Source

### Local Build (for testing)

```bash
# Navigate to project
cd src/audio-engine

# Development build (faster, larger binary, debug symbols)
cargo build --target wasm32-unknown-unknown

# Check for errors without building
cargo check

# Run tests
cargo test

# Run tests with output
cargo test -- --nocapture
```

### Production Build with wasm-pack

```bash
# Navigate to project
cd src/audio-engine

# Build for web (creates pkg/ folder)
wasm-pack build --target web --release

# Build with custom optimization flags
RUSTFLAGS="-C target-feature=+simd128 -C inline-threshold=5000" \
  wasm-pack build --target web --release
```

### Build Output Sizes

```
Debug build:              ~2.5MB (uncompressed)
Release build:            ~600KB (uncompressed)
Release + gzip:           ~200KB (compressed)
Release + brotli:         ~180KB (compressed)
```

## Testing

### Unit Tests

```bash
cd src/audio-engine

# Run all tests
cargo test

# Run with output
cargo test -- --nocapture

# Run specific test
cargo test test_processor_creation

# Run specific module
cargo test buffer_manager::
```

### Benchmarking

```bash
# Create a benchmark test
# (Add to Cargo.toml under [dev-dependencies])

# Run benchmarks
cargo bench
```

### Memory Profiling

```bash
# Build with profiling info
cargo build --target wasm32-unknown-unknown --release

# Analyze binary size
wasm-pack build --target web --release
twiggy top -n 20 pkg/audio_engine_bg.wasm
```

## Integration Steps

### 1. Using as NPM Package

**Option A: Local development**

```bash
# From project root
cd src/audio-engine
wasm-pack build --target web --release

# Link to main project (from project root)
npm install --save ./src/audio-engine/pkg
```

**Option B: Publish to npm**

```bash
cd src/audio-engine/pkg

# Update package.json version
npm version patch

# Publish to npm
npm publish
```

### 2. TypeScript Integration

```typescript
import init, { AudioProcessor } from 'audio-engine';

async function setupAudioEngine() {
    // Initialize WebAssembly module
    await init();
    
    // Create processor instance
    const processor = new AudioProcessor(48000, 1024);
    
    // Type-safe usage
    processor.set_input_gain(1.5);
    const tempo: number = processor.get_tempo_ratio();
    
    return processor;
}
```

### 3. JavaScript Integration

```javascript
import init, { AudioProcessor } from 'audio-engine';

(async () => {
    await init();
    
    const processor = new AudioProcessor(48000, 1024);
    
    // Process audio
    const output = processor.process_frame(leftChannel, rightChannel);
})();
```

## Continuous Integration

### GitHub Actions Example

```yaml
# .github/workflows/build-audio-engine.yml
name: Build Audio Engine

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Rust
        uses: rust-lang/rust-toolchain@v1
        with:
          toolchain: stable
          targets: wasm32-unknown-unknown
      
      - name: Install wasm-pack
        run: curl https://rustwasm.org/wasm-pack/installer/init.sh -sSf | sh
      
      - name: Build
        run: |
          cd src/audio-engine
          wasm-pack build --target web --release
      
      - name: Test
        run: |
          cd src/audio-engine
          cargo test
      
      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: audio-engine-wasm
          path: src/audio-engine/pkg/
```

## Troubleshooting

### Common Issues

#### 1. `wasm-bindgen` version mismatch

```bash
# Problem: wasm-bindgen CLI version doesn't match package version

# Solution: Update both
rustup update
cargo install wasm-bindgen-cli --force
```

#### 2. SIMD features not available

```bash
# Problem: Compile error about simd128

# Solution: Check target support or disable in build.rs
# Some WebAssembly runtimes don't support SIMD

# Edit build.rs to comment out SIMD line
```

#### 3. Binary too large

```bash
# Problem: WASM file > 500KB

# Solution 1: Enable compression in server
# Solution 2: Run strip in release build (already done)
# Solution 3: Remove unused dependencies

# Check size contributors
twiggy top -n 30 target/wasm32-unknown-unknown/release/audio_engine.wasm
```

#### 4. Performance issues

```bash
# Problem: Audio processing is too slow

# Solution 1: Reduce FFT size (use 256 or 512)
# Solution 2: Disable pitch shifting if not needed
# Solution 3: Increase buffer size (256 -> 512)
# Solution 4: Use release build, not debug
```

## Performance Profiling

### Using Flamegraph

```bash
# Install flamegraph
cargo install flamegraph

# Run with profiling
cargo flamegraph --bin audio_engine
```

### Browser Profiling

```javascript
// Measure processing time in JavaScript
const startTime = performance.now();

for (let i = 0; i < 100; i++) {
    processor.process_frame(leftBuffer, rightBuffer);
}

const elapsed = performance.now() - startTime;
console.log(`Average: ${elapsed / 100}ms`);
```

## Deployment Checklist

- [ ] All tests pass (`cargo test`)
- [ ] No compiler warnings
- [ ] Documentation complete (rustdoc)
- [ ] Performance benchmarked (< 5.3ms per frame)
- [ ] Binary size acceptable (< 300KB gzipped)
- [ ] SIMD features properly detected
- [ ] Version number updated in Cargo.toml
- [ ] Changelog updated
- [ ] Tagged release in Git
- [ ] WASM package published to npm (if applicable)
- [ ] Integration tests with JavaScript pass
- [ ] TypeScript definitions generated and correct

## Development Workflow

### Daily Development

```bash
cd src/audio-engine

# Check for issues
cargo clippy

# Format code
cargo fmt

# Test
cargo test

# Build WASM
wasm-pack build --target web --dev
```

### Before Commit

```bash
cd src/audio-engine

# Format
cargo fmt --all

# Lint
cargo clippy --all-targets --all-features -- -D warnings

# Test everything
cargo test --all-features

# Check documentation
cargo doc --no-deps --open
```

### Release Process

```bash
# Update version in Cargo.toml
# Edit CHANGELOG
# Commit changes

cd src/audio-engine
git tag -a v1.0.0 -m "Release 1.0.0"

# Build release
wasm-pack build --target web --release

# Publish to npm
cd pkg
npm publish
```

## Documentation

### Generate and View Docs

```bash
cd src/audio-engine

# Generate documentation
cargo doc --no-deps --open

# Each module has extensive rustdoc comments explaining:
# - Algorithm details
# - Performance characteristics
# - Usage examples
# - Edge cases and limitations
```

## Resources

- [Rust Book](https://doc.rust-lang.org/book/)
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)
- [wasm-bindgen Guide](https://rustwasm.org/docs/wasm-bindgen/)
- [wasm-pack Documentation](https://rustwasm.org/docs/wasm-pack/)
- [WebAssembly Spec](https://webassembly.org/)

## Support

For issues with:
- **Rust compilation**: Check [Rust Documentation](https://doc.rust-lang.org/)
- **WebAssembly**: See [WebAssembly Resources](https://webassembly.org/getting-started/)
- **Integration**: Refer to README.md for JavaScript examples
- **Performance**: Review "Performance Notes" section in README.md
