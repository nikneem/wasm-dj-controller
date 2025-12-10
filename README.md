<div align="center">

# 🎧 WASM DJ Controller

[![Build and Deploy](https://github.com/nikneem/wasm-dj-controller/actions/workflows/azure-static-web-apps.yml/badge.svg)](https://github.com/nikneem/wasm-dj-controller/actions/workflows/azure-static-web-apps.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange.svg)](https://www.rust-lang.org/)
[![Angular](https://img.shields.io/badge/Angular-21.0-red.svg)](https://angular.io/)
[![WebAssembly](https://img.shields.io/badge/WebAssembly-WASM-654FF0.svg)](https://webassembly.org/)

**A high-performance DJ controller application powered by WebAssembly and modern web technologies**

[Features](#-features) • [Tech Stack](#-tech-stack) • [Getting Started](#-getting-started) • [Architecture](#-architecture) • [Deployment](#-deployment)

![DJ Controller Preview](https://img.shields.io/badge/Status-Active-success)

</div>

---

## ✨ Features

- 🎵 **Professional Audio Engine** - High-performance audio processing using Rust compiled to WebAssembly
- 🎛️ **Dual Deck System** - Two independent decks with full transport controls
- 🎚️ **3-Band EQ** - Professional equalizer with low, mid, and high frequency control
- ⚡ **Tempo Control** - Adjustable tempo with pitch preservation using phase vocoder
- 🎹 **Pitch Shifter** - Independent pitch control without affecting playback speed
- 📊 **Real-time Waveform** - Visual feedback with beat grid and playback position
- 🔄 **Crossfader & Mixer** - Professional mixing capabilities
- 🎯 **Beat Detection** - Advanced multi-band spectral flux analysis for accurate BPM detection
- 💾 **Cue Points** - Set and recall cue points for precise mixing
- 🌊 **Drag & Drop** - Easy track loading with visual feedback

Demo at https://zealous-cliff-0bce69b03.3.azurestaticapps.net/

## 🚀 Tech Stack

### Frontend
- **[Angular 21](https://angular.io/)** - Modern web framework with standalone components
- **[PrimeNG](https://primeng.org/)** - Professional UI component library
- **TypeScript** - Type-safe JavaScript development
- **Web Audio API** - Native browser audio processing

### Audio Engine (WebAssembly)
- **[Rust](https://www.rust-lang.org/)** - High-performance systems programming language
- **[wasm-bindgen](https://github.com/rustwasm/wasm-bindgen)** - Rust/JavaScript interoperability
- **[rustfft](https://github.com/ejmahler/RustFFT)** - Fast Fourier Transform for audio analysis
- **Custom DSP Algorithms** - Phase vocoder, pitch shifting, spectral analysis

### Infrastructure
- **[Azure Static Web Apps](https://azure.microsoft.com/en-us/products/app-service/static)** - Serverless hosting with global CDN
- **GitHub Actions** - CI/CD automation
- **Bicep** - Infrastructure as Code

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Angular Frontend                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Deck         │  │ Mixer        │  │ Beat Grid    │       │
│  │ Component    │  │ Component    │  │ Component    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│           │                 │                 │             │
│           └─────────────────┴─────────────────┘             │
│                           │                                 │
│                  ┌────────▼────────┐                        │
│                  │ Audio Engine    │                        │
│                  │ Service         │                        │
│                  └────────┬────────┘                        │
└───────────────────────────┼─────────────────────────────────┘
                            │
                    ┌───────▼───────┐
                    │   WASM Module │
                    │   (Rust)      │
                    ├───────────────┤
                    │ • Audio DSP   │
                    │ • BPM Detect  │
                    │ • Phase Voc.  │
                    │ • Equalizer   │
                    │ • Fader       │
                    └───────────────┘
```

## 📦 Getting Started

### Prerequisites

- **Node.js** 20+ 
- **Rust** 1.75+ with `wasm32-unknown-unknown` target
- **wasm-bindgen-cli** (install via `cargo install wasm-bindgen-cli`)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/nikneem/wasm-dj-controller.git
   cd wasm-dj-controller
   ```

2. **Build the WASM audio engine**
   ```bash
   cd src/audio-engine
   cargo build --release --target wasm32-unknown-unknown
   wasm-bindgen --target web --out-dir ../dj-controller/src/wasm target/wasm32-unknown-unknown/release/audio_engine.wasm
   ```

   Or use the PowerShell build script:
   ```powershell
   .\build-wasm.ps1
   ```

3. **Install Angular dependencies**
   ```bash
   cd ../dj-controller
   npm install
   ```

4. **Start development server**
   ```bash
   npm start
   ```

5. **Open browser**
   Navigate to `http://localhost:4200`

## 🎯 Usage

1. **Load tracks** - Drag and drop audio files onto the deck
2. **Analyze** - Automatic BPM detection and waveform generation
3. **Mix** - Use transport controls, EQ, and crossfader
4. **Perform** - Real-time tempo and pitch control

## 🧪 Audio Processing Features

### Multi-band Spectral Flux BPM Detection
Advanced tempo detection using:
- 6 frequency band analysis (20Hz - 8kHz)
- Weighted spectral flux calculation
- Autocorrelation with peak detection
- Multi-section consensus voting
- Automatic octave correction
- Genre-aware tempo preferences

**Accuracy**: Typically ±1 BPM for electronic music

### Real-time Audio Processing
- **Buffer size**: 4096 samples for optimal latency/quality balance
- **Sample rate**: 44.1kHz / 48kHz support
- **Processing**: Zero-copy when possible
- **Latency**: ~93ms round-trip

## 🚀 Deployment

### Azure Static Web Apps

The project deploys automatically to Azure Static Web Apps via GitHub Actions:

1. **Automatic Infrastructure** - Resource group and Static Web App created via Bicep
2. **Build Pipeline** - Rust WASM + Angular compiled in CI/CD
3. **Global CDN** - Distributed worldwide for low latency
4. **PR Previews** - Staging environments for every pull request

See [AZURE_DEPLOYMENT.md](docs/AZURE_DEPLOYMENT.md) for setup instructions.

## 📚 Documentation

- [Getting Started Guide](docs/01-GETTING-STARTED.md)
- [Architecture Overview](docs/02-ARCHITECTURE.md)
- [Audio Engine Details](docs/03-AUDIO-ENGINE.md)
- [BPM Detection Algorithm](docs/BPM_DETECTION_MULTIBAND.md)
- [Azure Deployment Guide](docs/AZURE_DEPLOYMENT.md)

## 🛠️ Development

### Project Structure

```
wasm-dj-controller/
├── src/
│   ├── audio-engine/          # Rust WASM audio processing
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── audio_analysis.rs   # BPM/key detection
│   │   │   ├── equalizer.rs        # 3-band EQ
│   │   │   ├── fader.rs            # Crossfader
│   │   │   └── ...
│   │   └── Cargo.toml
│   └── dj-controller/         # Angular frontend
│       ├── src/
│       │   ├── app/
│       │   │   ├── components/
│       │   │   ├── services/
│       │   │   └── pages/
│       │   └── wasm/          # Generated WASM bindings
│       └── package.json
├── infrastructure/            # Bicep templates
├── docs/                     # Documentation
└── .github/workflows/        # CI/CD pipelines
```

### Running Tests

```bash
# Rust tests
cd src/audio-engine
cargo test

# Angular tests
cd src/dj-controller
npm test
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **RustFFT** for fast Fourier transforms
- **Angular Team** for the amazing framework
- **PrimeNG** for professional UI components
- **WebAssembly** community for making high-performance web apps possible

---

<div align="center">

**Built with ❤️ using Rust 🦀 and Angular 🅰️**

[Report Bug](https://github.com/nikneem/wasm-dj-controller/issues) • [Request Feature](https://github.com/nikneem/wasm-dj-controller/issues)

</div>
