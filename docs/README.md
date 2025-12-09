# WASM DJ Controller - Documentation

Welcome to the WASM DJ Controller project documentation. This folder contains comprehensive guides for understanding and developing this high-performance browser-based DJ mixing application.

## Documentation Structure

### Quick Start
- **[Getting Started](./01-GETTING-STARTED.md)** - Setup instructions, environment configuration, first run

### Architecture & Design
- **[Architecture Overview](./02-ARCHITECTURE.md)** - System design, component interactions, threading model
- **[Audio Engine Design](./03-AUDIO-ENGINE.md)** - WebAssembly module architecture, algorithms, performance considerations
- **[Web Audio Integration](./04-WEB-AUDIO-INTEGRATION.md)** - AudioWorklet setup, audio graph routing, synchronization

### Implementation Guides
- **[Frontend Implementation](./IMPLEMENTATION/01-FRONTEND.md)** - Angular setup, component structure, services
- **[Audio Engine Implementation](./IMPLEMENTATION/02-AUDIO-ENGINE.md)** - Rust/Wasm setup, building, deployment
- **[Worker Threads](./IMPLEMENTATION/03-WORKERS.md)** - Web Worker setup, BPM analysis, background processing
- **[AudioWorklet Processor](./IMPLEMENTATION/04-AUDIOWORKLET-PROCESSOR.md)** - AudioWorklet script creation, Wasm integration, real-time processing

### Feature Guides
- **[Tempo & BPM Control](./FEATURES/01-TEMPO-BPM.md)** - Phase Vocoder, time-stretching, beat matching
- **[Pitch & Key Detection](./FEATURES/02-PITCH-KEY.md)** - Pitch-shifting, harmonic mixing, key detection algorithms
- **[Track Loading & Analysis](./FEATURES/03-TRACK-LOADING.md)** - MP3 decoding, BPM analysis workflow
- **[Mixing & Crossfading](./FEATURES/04-MIXING.md)** - Audio routing, gain control, crossfader implementation

### Performance & Optimization
- **[Performance Requirements](./PERFORMANCE/01-REQUIREMENTS.md)** - Latency targets, buffer management, stability goals
- **[Optimization Guide](./PERFORMANCE/02-OPTIMIZATION.md)** - Profiling, bottleneck identification, SIMD usage
- **[Real-Time Audio Best Practices](./PERFORMANCE/03-BEST-PRACTICES.md)** - Thread safety, memory management, debugging techniques

### Testing & Debugging
- **[Testing Strategy](./TESTING/01-STRATEGY.md)** - Unit tests, integration tests, performance tests
- **[Debugging Audio Issues](./TESTING/02-DEBUGGING.md)** - Common problems, diagnostic tools, troubleshooting
- **[Performance Profiling](./TESTING/03-PROFILING.md)** - Chrome DevTools, Wasm profiling, memory analysis

### Technical Reference
- **[API Reference](./REFERENCE/01-API.md)** - Service interfaces, component APIs, Wasm function signatures
- **[Type Definitions](./REFERENCE/02-TYPES.md)** - TypeScript models, data structures
- **[Constants & Configuration](./REFERENCE/03-CONSTANTS.md)** - Buffer sizes, FFT sizes, timing constants

### Troubleshooting
- **[FAQ](./TROUBLESHOOTING/01-FAQ.md)** - Common questions and solutions
- **[Audio Issues](./TROUBLESHOOTING/02-AUDIO-ISSUES.md)** - Glitches, latency, playback problems
- **[Build Issues](./TROUBLESHOOTING/03-BUILD-ISSUES.md)** - Compilation errors, dependency problems

## Quick Navigation

### I want to...

**Get the project running**
→ Start with [Getting Started](./01-GETTING-STARTED.md)

**Understand the architecture**
→ Read [Architecture Overview](./02-ARCHITECTURE.md) then [Audio Engine Design](./03-AUDIO-ENGINE.md)

**Build a new feature**
→ Check [Feature Guides](./FEATURES/) and [Implementation Guides](./IMPLEMENTATION/)

**Fix a performance issue**
→ See [Performance Optimization](./PERFORMANCE/02-OPTIMIZATION.md) and [Debugging](./TESTING/02-DEBUGGING.md)

**Understand how a specific component works**
→ Find it in [Implementation Guides](./IMPLEMENTATION/) or [API Reference](./REFERENCE/01-API.md)

## Key Concepts

### Priority 1: Audio Playback Stability
The entire architecture is designed around one principle: **never hiccup audio playback**. This means:
- Audio processing runs on a dedicated thread (AudioWorklet)
- The UI thread (Angular) never blocks the audio thread
- All algorithms must complete within strict real-time constraints
- Buffer management is critical for glitch-free playback

### Multi-Threading Model
```
Angular UI (Main Thread)
    ↓ (Messages via Worker)
Workers (Analysis)
    ↓ (Computed BPM/Key)
AudioWorklet (Dedicated Audio Thread)
    ↓ (Controls Wasm Engine)
WebAssembly (Phase Vocoder, Pitch Shift, Analysis)
    ↓
Web Audio API
    ↓
Speaker Output
```

### Real-Time Audio Constraints
At 48kHz sample rate with 256-sample buffer:
- **5.3ms** available per audio callback
- Phase Vocoder FFT must complete in this window
- No allocations allowed in hot path
- Pre-calculation and buffer pooling required

## Project Status

**Current Phase**: Foundation
- ✅ Architecture designed
- 🔄 Core Wasm modules in development
- 🔄 Angular UI scaffolding
- ⏳ Integration and testing

## Contributing

When contributing to documentation:
1. Keep examples practical and runnable
2. Include performance implications where relevant
3. Link to related sections for context
4. Update the table of contents when adding new docs
5. Test any code examples before committing

## Resources

### External References
- [Web Audio API](https://www.w3.org/TR/webaudio/)
- [AudioWorklet Spec](https://www.w3.org/TR/webaudio/#audioworklet)
- [Rust wasm-bindgen](https://rustwasm.org/docs/wasm-bindgen/)
- [Phase Vocoder Theory](https://en.wikipedia.org/wiki/Phase_vocoder)
- [Essentia.js](https://mtg.github.io/essentia.js/) - BPM detection reference

### Tools & Libraries
- **wasm-pack** - Rust to WebAssembly compiler
- **Chrome DevTools** - Profiling and debugging
- **Web Audio API Specification** - Official reference

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 0.1.0 | Dec 2025 | Initial documentation structure and architecture design |

---

**Last Updated**: December 2025

For questions or corrections, please refer to the project's GitHub issues or discussion forums.
