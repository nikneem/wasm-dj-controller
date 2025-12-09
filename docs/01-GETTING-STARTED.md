# Getting Started with WASM DJ Controller

This guide will help you set up the development environment and run the WASM DJ Controller project.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

### Required Tools
- **Node.js** (18.x or later) - https://nodejs.org/
- **npm** (9.x or later) - comes with Node.js
- **Rust** (1.70 or later) - https://www.rust-lang.org/tools/install
- **wasm-pack** (1.3 or later) - `cargo install wasm-pack`
- **Angular CLI** (17.x or later) - `npm install -g @angular/cli`

### Optional But Recommended
- **Git** - for version control
- **Visual Studio Code** - with extensions:
  - Rust-analyzer (rust-lang.rust-analyzer)
  - WebAssembly (dtsn.wasm)
  - Angular Language Service
- **Chrome DevTools** - for profiling and debugging

## Installation Steps

### 1. Clone or Set Up the Project

```bash
# If cloning from GitHub
git clone https://github.com/nikneem/wasm-dj-controller.git
cd wasm-dj-controller

# If setting up from scratch
mkdir wasm-dj-controller
cd wasm-dj-controller
```

### 2. Verify Prerequisites

```bash
# Check Node.js version
node --version
# Expected: v18.0.0 or later

# Check Rust version
rustup --version
# Expected: rustup 1.26.0 or later

# Check wasm-pack
wasm-pack --version
# Expected: 1.3.0 or later

# Check Angular CLI
ng version
# Expected: 17.x or later
```

### 3. Install Audio Engine Dependencies

```bash
cd src/audio-engine
cargo build --release
wasm-pack build --target web --release
```

This will create the WebAssembly module in `pkg/` directory.

### 4. Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

### 5. Configure Audio Engine in Frontend

Create a symbolic link or copy the Wasm module to the Angular assets:

```bash
# From src/frontend directory
# Copy the generated Wasm module
cp -r ../audio-engine/pkg/* src/assets/wasm/
```

Or configure in `angular.json` to include the Wasm files from the build output.

## Project Structure Setup

Ensure your project has the following structure:

```
wasm-dj-controller/
├── src/
│   ├── audio-engine/          # Rust/Wasm module
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   └── pkg/               # Generated Wasm output
│   ├── frontend/              # Angular application
│   │   ├── src/
│   │   ├── angular.json
│   │   └── package.json
│   └── workers/               # Web Workers
├── docs/                       # Documentation
└── README.md
```

## Running the Project

### Development Mode

**Terminal 1: Start the Angular development server**
```bash
cd src/frontend
ng serve
```

The application will be available at `http://localhost:4200/`

**Terminal 2: Watch the Audio Engine for changes** (optional)
```bash
cd src/audio-engine
wasm-pack build --target web --watch
```

### Production Build

```bash
# Build audio engine
cd src/audio-engine
wasm-pack build --target web --release

# Build Angular frontend
cd ../frontend
ng build --configuration production
```

## First Run Checklist

After starting the development server, verify:

- [ ] Angular development server starts without errors
- [ ] Browser opens to `http://localhost:4200/`
- [ ] UI loads (should show two virtual decks)
- [ ] Console shows no errors (check DevTools)
- [ ] Web Audio API is available (Chrome DevTools → Console)
- [ ] Wasm module loads (check Network tab for `.wasm` file)

## Loading an Audio Track

1. Click the **"Load Track"** button on Deck 1
2. Select an MP3 file from your computer
3. Wait for BPM detection to complete (shows in status bar)
4. The track should appear in the waveform display
5. Click **Play** to start playback

## Testing Audio Playback

### Basic Playback Test
1. Load a track on Deck 1
2. Click Play
3. Listen for continuous, uninterrupted audio
4. Verify no skips or glitches

### Tempo Control Test
1. Track playing on Deck 1
2. Adjust **Tempo** slider (left/right)
3. Audio should speed up or slow down smoothly
4. Pitch should NOT change

### Pitch Control Test
1. Track playing on Deck 1
2. Adjust **Pitch** slider (±2 semitones)
3. Audio pitch should change
4. Tempo should NOT change

## Troubleshooting Initial Setup

### "wasm-pack command not found"
```bash
cargo install wasm-pack
```

### "Angular CLI not found"
```bash
npm install -g @angular/cli
```

### Wasm module fails to load
1. Verify `wasm-pack build` completed successfully
2. Check that `.wasm` files exist in `src/frontend/src/assets/wasm/`
3. Verify MIME types in dev server are correct (`.wasm` → `application/wasm`)

### Audio Context initialization fails
- Check browser console for errors
- Ensure HTTPS (or localhost) - Web Audio API requires secure context
- Verify browser supports AudioWorklet (Chrome 67+, Firefox 76+)

### Performance Issues During Development
- Make sure you're using the **development build** of Angular (`ng serve`)
- Disable browser extensions (especially DevTools extensions)
- Close unused tabs to free resources
- Test on a different browser to isolate issues

## Development Workflow

### Typical Development Session

1. **Start both dev servers**
   ```bash
   # Terminal 1
   cd src/frontend
   ng serve
   
   # Terminal 2 (optional)
   cd src/audio-engine
   wasm-pack build --target web --watch
   ```

2. **Make changes** to TypeScript, Rust, or template files

3. **Test in browser** (auto-refresh for Angular changes)

4. **Check DevTools** for errors or performance issues

5. **Rebuild Wasm** if you modified Rust code
   ```bash
   cd src/audio-engine
   wasm-pack build --target web
   ```

### Committing Changes

Before committing:
```bash
# Run linting
cd src/frontend
ng lint

# Run tests
ng test

# Build for production to catch errors
ng build --configuration production
```

## Next Steps

Once the project is running:

1. **Read [Architecture Overview](./02-ARCHITECTURE.md)** to understand the system design
2. **Explore [Feature Guides](./FEATURES/)** to understand individual components
3. **Check [Implementation Guides](./IMPLEMENTATION/)** before making code changes
4. **Review [Performance Requirements](./PERFORMANCE/01-REQUIREMENTS.md)** for optimization guidance

## Getting Help

- Check [FAQ](./TROUBLESHOOTING/01-FAQ.md) for common questions
- See [Build Issues](./TROUBLESHOOTING/03-BUILD-ISSUES.md) for build problems
- Review [Debugging Audio Issues](./TESTING/02-DEBUGGING.md) for playback problems
- Consult [API Reference](./REFERENCE/01-API.md) for interface details

## Performance Baseline

On a typical development machine:
- **Angular dev server startup**: 10-30 seconds
- **Wasm build time**: 30-60 seconds
- **Audio latency**: 50-100ms (acceptable for DJ use)
- **UI frame rate**: 60 FPS (with audio processing on separate thread)

---

**Estimated Setup Time**: 10-15 minutes (assuming all tools already installed)

**Last Updated**: December 2025
