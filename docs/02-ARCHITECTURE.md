# Architecture Overview

This document describes the overall architecture of the WASM DJ Controller, including component interactions, threading model, and data flow.

## System Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────┐
│                          Browser Environment                      │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────┐         ┌──────────────────────────┐ │
│  │   Angular UI Layer      │         │   Web Workers            │ │
│  │   (Main Thread)         │         │   (Background Thread)    │ │
│  │                         │         │                          │ │
│  │ ┌─────────────────────┐ │         │ ┌────────────────────┐   │ │
│  │ │   Components        │ │         │ │ BPM Analyzer       │   │ │
│  │ │ - Deck 1 / Deck 2   │ │         │ │ - Spectral Flux    │   │ │
│  │ │ - Crossfader        │ │         │ │ - Onset Detection  │   │ │
│  │ │ - Controls          │ │         │ │ - Tempo Estimation │   │ │
│  │ │ - Waveform          │ │         │ └────────────────────┘   │ │
│  │ └──────────┬──────────┘ │         │                          │ │
│  │            │            │         │ ┌────────────────────┐   │ │
│  │ ┌──────────▼──────────┐ │         │ │ Track Processor    │   │ │
│  │ │ Services            │ │         │ │ - Key Detection    │   │ │
│  │ │ - AudioService      │ │         │ │ - Analysis Cache   │   │ │
│  │ │ - AudioWorkletSvc   │◄──────────┤ └────────────────────┘   │ │
│  │ │ - TrackLoaderSvc    │ │Message  │                          │ │
│  │ │ - UISyncSvc         │ │Port     │                          │ │
│  │ └─────────────────────┘ │         │                          │ │
│  └─────────────────────────┘         └──────────────────────────┘ │
│            │                                    ▲                 │
│            │                                    │                 │
│            │          MessagePort               │                 │
│            └────────────────────────────────────┘                 │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │            AudioWorklet (Dedicated Audio Thread)             │ │
│  │                                                              │ │
│  │  ┌────────────────────────────────────────────────────────┐  │ │
│  │  │ AudioWorkletProcessor (Real-Time Audio Loop)           │  │ │
│  │  │                                                        │  │ │
│  │  │ ┌──────────────────────────────────────────────────┐   │  │ │
│  │  │ │ process(inputs[], outputs[], params) {           │   │  │ │
│  │  │ │   1. Fetch PCM from decoder buffer               │   │  │ │
│  │  │ │   2. Call Wasm: phase_vocoder(pitch, tempo)      │   │  │ │
│  │  │ │   3. Apply gain control                          │   │  │ │
│  │  │ │   4. Mix deck 1 + deck 2 via crossfader          │   │  │ │
│  │  │ │   5. Send to output (speakers)                   │   │  │ │
│  │  │ │ }                                                │   │  │ │
│  │  │ └──────────────────────────────────────────────────┘   │  │ │
│  │  │                                                        │  │ │
│  │  │ Message Handler:                                       │  │ │
│  │  │ - volumeChange → adjust gain                           │  │ │
│  │  │ - tempoChange → update phase vocoder param             │  │ │
│  │  │ - pitchChange → update pitch-shift param               │  │ │
│  │  │ - crossfaderMove → adjust mix ratio                    │  │ │
│  │  └────────────────────────────────────────────────────────┘  │ │
│  │                           ▲                                  │ │
│  │                           │ Uses                             │ │
│  │  ┌────────────────────────┴────────────────────────────────┐ │ │
│  │  │      WebAssembly Module (Phase Vocoder Engine)          │ │ │
│  │  │                                                         │ │ │
│  │  │  ┌───────────────────────────────────────────────────┐  │ │ │
│  │  │  │ process_frame(                                    │  │ │ │
│  │  │  │   &input[],                                       │  │ │ │
│  │  │  │   tempo_ratio: f32,                               │  │ │ │
│  │  │  │   pitch_shift: i32,                               │  │ │ │
│  │  │  │ ) -> &output[]                                    │  │ │ │
│  │  │  │                                                   │  │ │ │
│  │  │  │  • FFT analysis                                   │  │ │ │
│  │  │  │  • Phase vocoder algorithm                        │  │ │ │
│  │  │  │  • Pitch-shift via bin rotation                   │  │ │ │
│  │  │  │  • IFFT synthesis                                 │  │ │ │
│  │  │  └───────────────────────────────────────────────────┘  │ │ │
│  │  │                                                         │ │ │
│  │  │  Analysis Functions (Initial Track Processing):         │ │ │
│  │  │  - analyze_bpm() → BPM value                            │ │ │
│  │  │  - detect_key() → Key (C-B, major/minor)                │ │ │
│  │  │  - extract_onsets() → beat grid                    ,    │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │           Web Audio API (Audio Output)                       │ │
│  │                                                              │ │
│  │  AudioContext → [L+R PCM Data from Wasm]                     │ │
│  │                    ↓                                         │ │
│  │           GainNode (Volume)                                  │ │
│  │                    ↓                                         │ │
│  │           AnalyserNode (FFT for Visualization)               │ │
│  │                    ↓                                         │ │
│  │           Destination (Speakers)                             │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Angular UI Layer (Main Thread)

**Responsibility**: User interface, user input handling, visual feedback

**Key Components**:
- **Deck Components**: Display track info, waveform, playback position
- **Crossfader Component**: Visual slider for mixing deck 1 and deck 2
- **Control Components**: Tempo slider, pitch slider, volume knobs
- **Status Bar**: Real-time BPM display, key indicator, waveform visualization

**Important Constraint**: 
- Must never block the audio thread
- Receives high-frequency updates from audio engine (don't update UI every frame)
- Uses RxJS subjects with debounce/throttle for performance

### 2. Services Layer

**AudioService**
- Manages AudioContext creation and lifecycle
- Initializes AudioWorklet
- Provides high-level playback API
- Thread-safe message passing to AudioWorklet

**AudioWorkletService**
- Creates AudioWorkletNode
- Manages parameter updates
- Handles real-time control messaging
- Synchronizes UI state with audio state

**TrackLoaderService**
- Fetches MP3 files
- Manages File API
- Triggers Web Worker analysis
- Caches decoded track metadata

**UISyncService**
- Keeps UI in sync with audio state
- Debounces high-frequency updates
- Updates visualizations

### 3. Web Workers (Background Threads)

**BPM Analyzer Worker**
- Performs initial track analysis (runs off-UI-thread)
- Detects BPM via spectral flux and onset detection
- Detects musical key via chroma vector analysis
- Caches results to avoid re-analysis

**Responsibilities**:
- Heavy computation that doesn't require real-time response
- Frees up main thread for UI updates

### 4. AudioWorklet (Dedicated Audio Thread)

**Critical Role**: Real-time audio processing

**Process Loop** (called every ~5-10ms by browser):
```
1. Receive control messages (tempo, pitch, volume changes)
2. Fetch next chunk of PCM data from internal buffer
3. Call Wasm phase_vocoder() with current tempo/pitch settings
4. Apply gain control (volume level)
5. Mix outputs from Deck 1 and Deck 2 via crossfader ratio
6. Write to output buffer
7. Repeat
```

**Constraints**:
- Must complete within ~5-10ms per callback (strict real-time)
- No DOM access, no network I/O
- Cannot allocate memory (pre-allocate all buffers)
- No GC pauses allowed

### 5. WebAssembly Module (Audio Engine)

**Written in**: Rust (compiled to WebAssembly)

**Core Functions**:

**Real-Time Processing**:
- `process_frame()` - Phase vocoder + pitch shifting (called per audio frame)
- Buffer management for overlap-add windowing
- Sample-accurate timing

**Track Analysis** (called once during loading):
- `analyze_bpm()` - Spectral flux onset detection
- `detect_key()` - Chroma vector analysis
- `extract_beat_grid()` - Marker extraction

**Performance Characteristics**:
- Phase Vocoder: ~95% CPU on average frame (must be <100%)
- Memory usage: ~50-100MB per track (pre-allocated)
- Latency: 50-100ms (Phase Vocoder inherent delay)

## Threading Model

```
Main Thread (Angular)
├─ User Input (Sliders, Buttons)
├─ Virtual DOM Updates
├─ Component Lifecycle
└─ Network I/O (Track Loading)
    ↓ (offload heavy work to Worker)
    
Background Thread (Web Worker)
├─ BPM Analysis
├─ Key Detection
├─ Feature Extraction
└─ (no UI updates)

Audio Thread (AudioWorklet)
├─ Phase Vocoder (Wasm)
├─ Pitch Shifting (Wasm)
├─ Mix Control
└─ Output Routing
    ↓ (never blocks this thread!)
    
Web Audio API
├─ GainNode
├─ AnalyserNode
└─ Speakers
```

**Key Rule**: Never, ever block the AudioWorklet thread. All heavy computation must either:
1. Pre-compute and cache (during track load in Worker)
2. Delegate to Wasm (Phase Vocoder, pitch-shift)
3. Use look-up tables (avoid expensive math in hot path)

## Data Flow

### Track Load Flow
```
User: "Load Track" Button
  ↓
FileInput → TrackLoaderService (Main Thread)
  ↓
Fetch File → ArrayBuffer (MP3 data)
  ↓
Send to BPM Analyzer Worker
  ↓
Worker calls Wasm:
  - analyze_bpm() → BPM value
  - detect_key() → Key info
  ↓
Worker returns metadata → Main Thread
  ↓
Update UI (deck info, BPM display, key indicator)
  ↓
Ready for playback!
```

### Playback & Control Flow
```
User: Move Tempo Slider to +5%
  ↓
DeckControls Component → UISync Subject
  ↓
AudioService debounces changes
  ↓
AudioService.setTempo(1.05) → MessagePort
  ↓
AudioWorkletProcessor receives message:
  { type: 'tempo', value: 1.05 }
  ↓
Next audio callback:
  Wasm phase_vocoder(tempo_ratio=1.05)
  ↓
Output plays 5% faster (pitch unchanged)
  ↓
UI updates BPM display (120 BPM → 126 BPM)
```

### Real-Time Audio Loop
```
Browser Audio Callback (~256 samples @ 48kHz ≈ 5.3ms)
  ↓
AudioWorkletProcessor.process(inputs[], outputs[], params)
  ↓
Check message port for control updates
  ↓
Read next chunk from PCM buffer
  ↓
Call Wasm: process_frame(
    &pcm_input,
    tempo_ratio=params.tempo,
    pitch_shift=params.pitch
  )
  ↓
Apply crossfader mix:
  output = (deck1_sample * crossfader) + 
           (deck2_sample * (1-crossfader))
  ↓
Apply gain: output *= gain_level
  ↓
Write to output buffer → Speakers
  ↓
Repeat ~48,000 times per second
```

## Synchronization Points

**Main Thread ↔ Audio Thread**:
- Communication via MessagePort (not shared memory for safety)
- No blocking operations
- Audio thread NEVER waits for main thread

**Example - Tempo Change**:
```typescript
// Main Thread
audioService.setTempo(1.05);  // Non-blocking

// Travels via MessagePort → AudioWorklet
// AudioWorklet receives immediately:
port.onmessage = (event) => {
  if (event.data.type === 'tempo') {
    currentTempo = event.data.value;  // Applied on next callback
  }
}

// No wait, no sync, no blocking!
```

## Buffer Management

### Audio Buffers
- **Input Buffer**: ~2 seconds of decoded PCM (pre-allocated)
- **Working Buffer**: ~1 second for Phase Vocoder (pre-allocated, reused)
- **Output Buffer**: Web Audio API's internal buffer (~512-4096 samples)

### Memory Usage
- Deck 1: ~50MB (2 sec @ 48kHz stereo)
- Deck 2: ~50MB (2 sec @ 48kHz stereo)
- Wasm tables + heap: ~20MB
- **Total**: ~120MB per session

### Pre-loading Strategy
- Load only 2 seconds into memory (streaming in longer tracks later)
- Pre-allocate all buffers during initialization
- No allocations in audio callback (zero GC pauses)

## Failure Modes & Recovery

| Failure Mode | Symptom | Recovery |
|---|---|---|
| AudioWorklet crash | No audio output | Recreate AudioContext |
| Wasm OOM | Process slows | Release track, reload |
| Main thread blocks | UI frozen | Async operation timeout |
| Buffer underrun | Audio glitch | Increase buffer size |
| Phase Vocoder latency > 5.3ms | Glitches | Reduce FFT size (quality trade-off) |

## Performance Targets

| Component | Target | Acceptable | Critical |
|---|---|---|---|
| Audio latency | 50-100ms | <200ms | >500ms ❌ |
| UI responsiveness | <16ms (60fps) | <33ms | >100ms ❌ |
| Wasm FFT per frame | <4ms | <5ms | >5.3ms ❌ |
| BPM analysis (one-time) | <5 seconds | <10 seconds | >30s ⚠️ |
| Memory per track | <100MB | <150MB | >200MB ⚠️ |

---

**Last Updated**: December 2025

**Related Documents**:
- [Audio Engine Design](./03-AUDIO-ENGINE.md) - Deep dive into Wasm algorithms
- [Web Audio Integration](./04-WEB-AUDIO-INTEGRATION.md) - AudioWorklet details
- [Performance Requirements](./PERFORMANCE/01-REQUIREMENTS.md) - Detailed benchmarks
