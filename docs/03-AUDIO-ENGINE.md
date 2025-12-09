# Audio Engine Design

This document provides an in-depth look at the WebAssembly audio engine that powers the WASM DJ Controller.

## Overview

The Audio Engine is a Rust crate compiled to WebAssembly, providing high-performance audio processing algorithms that run in the browser. It handles:
- Real-time tempo adjustment without pitch change (Phase Vocoder)
- Real-time pitch shifting without tempo change
- BPM and beat detection (track analysis)
- Musical key detection (harmonic analysis)
- Audio decoding and PCM data management

## Architecture

### Module Structure

```
audio-engine/
├── src/
│   ├── lib.rs              # Wasm entry point, public API exports
│   ├── decoder.rs          # MP3 decoding wrapper (FFmpeg binding)
│   ├── phase_vocoder.rs    # Time-stretching algorithm
│   ├── pitch_shift.rs      # Pitch-shifting implementation
│   ├── bpm_detection.rs    # BPM analysis via spectral flux
│   ├── key_detection.rs    # Musical key detection via chroma
│   ├── filters.rs          # DSP utilities (windowing, FFT wrapper)
│   ├── buffer.rs           # Ring buffer implementation
│   └── utils.rs            # Math helpers, constants
├── Cargo.toml              # Dependencies
└── wasm-pack.toml          # Wasm build config
```

### Dependencies

```toml
[dependencies]
wasm-bindgen = "0.2"           # JS↔Rust interop
rustfft = "6.1"                # FFT computation
ndarray = "0.15"               # Multi-dimensional arrays
num-complex = "0.4"            # Complex number math
hann = "0.3"                   # Window functions

# Optional: Hardware acceleration
[target.'cfg(target_arch="wasm32")'.dependencies]
wasm-bindgen-rayon = "1.1"     # Parallel FFT (if rayon available)
```

## Core Algorithms

### 1. Phase Vocoder (Time-Stretching)

**Purpose**: Change tempo without changing pitch

**Why Wasm**: FFT + IFFT per audio frame is computationally expensive. A JavaScript version would cause audio glitches. Wasm allows near-native performance.

#### Algorithm Overview

```
Input: x[n] (mono audio samples)
       tempo_ratio (0.5 = half speed, 2.0 = double speed)
       window_size = 2048 samples
       hop_size = 512 samples

Process:
  1. Frame Analysis
     - Extract window of audio: x[frame_start:frame_start+window_size]
     - Apply Hann window (smooth edges)
     - Compute FFT → X[k] (frequency domain)
  
  2. Phase Vocoder Core
     - Store previous frame's phase: φ_prev[k]
     - Calculate phase advancement: Δφ[k] = ∠X[k] - φ_prev[k]
     - Unwrap phase discontinuities (handle ±π wrapping)
     - Estimate true frequency: f_true[k] = (∠X[k] + 2πk) / hop_size
  
  3. Time Stretching
     - New hop size: hop_new = hop_old * tempo_ratio
     - Scale phase by ratio: φ_new[k] = f_true[k] * hop_new
  
  4. Synthesis
     - Reconstruct magnitude from original FFT: |X[k]|
     - Combine with new phase: X_new[k] = |X[k]| ∠φ_new[k]
     - Compute IFFT → y[n]
     - Apply Hann window again (overlap-add)
     - Overlap-add with previous frame for continuity

Output: y[n] (time-stretched audio, pitch preserved)
```

#### Key Parameters

```rust
pub struct PhaseVocoderConfig {
    pub sample_rate: f32,           // Hz (typically 48000)
    pub window_size: usize,         // 2048 or 4096 (larger = better quality, more latency)
    pub hop_size: usize,            // window_size / 4
    pub fft_size: usize,            // window_size (zero-padded if needed)
}

// Typical: 48kHz, 2048 window, 512 hop → ~10.7ms latency
```

#### Implementation Strategy

```rust
pub struct PhaseVocoder {
    sample_rate: f32,
    window_size: usize,
    hop_size: usize,
    
    // Pre-allocated buffers (no allocations in hot path)
    window: Vec<f32>,               // Hann window
    input_buffer: Vec<f32>,         // Current frame input
    output_buffer: Vec<f32>,        // Overlap-add output
    fft_input: Vec<Complex32>,      // FFT input
    prev_phase: Vec<f32>,           // Previous frame's phase
    prev_magnitude: Vec<f32>,       // Previous frame's magnitude
    
    // Ring buffer for overlap-add
    overlap_buffer: Vec<f32>,       // Circular buffer
    overlap_pos: usize,
}

impl PhaseVocoder {
    pub fn process(&mut self, input: &[f32], tempo: f32) -> &[f32] {
        // 1. Fill input buffer (gather samples)
        self.fill_window(input);
        
        // 2. Apply window
        self.apply_window();
        
        // 3. FFT
        self.compute_fft();
        
        // 4. Phase vocoder algorithm
        self.time_stretch(tempo);
        
        // 5. IFFT
        self.compute_ifft();
        
        // 6. Overlap-add
        self.overlap_add();
        
        // Return processed samples
        &self.output_buffer[..]
    }
    
    fn time_stretch(&mut self, tempo: f32) {
        let hop_new = (self.hop_size as f32 / tempo) as usize;
        
        for k in 0..self.window_size/2 {
            // Phase vocoder math here
            let phase_diff = /* unwrap phase discontinuity */;
            let true_freq = /* estimate true frequency */;
            let new_phase = /* scale by tempo ratio */;
            
            // Update for next frame
            self.prev_phase[k] = new_phase;
        }
    }
}
```

#### Characteristics

| Property | Value |
|---|---|
| Latency | 10-20ms (2x window size) |
| Quality | Excellent (minimal artifacts) |
| Artifacts | Minor phase distortion at extreme tempos (>±50%) |
| CPU Cost | ~80-90% of audio frame budget |
| Memory | ~100KB working buffers |

### 2. Pitch Shifting

**Purpose**: Change pitch without changing tempo

**Implementation**: Variant of Phase Vocoder with frequency bin rotation

#### Algorithm

```
Input: x[n] (audio)
       pitch_shift (in semitones: -12 to +12)
       
Process:
  1. Apply Phase Vocoder with tempo_ratio = 1.0
     (This preserves tempo while preparing frequency data)
  
  2. Frequency Bin Rotation
     - Calculate bin shift: bins_shift = pitch_shift * (fft_size / 12)
       [Each semitone = 1/12 octave ≈ bins_shift bins]
     
     - Rotate FFT bins:
       for k in range(FFT_SIZE/2):
           new_k = k + bins_shift
           if 0 <= new_k < FFT_SIZE/2:
               X_new[new_k] = X[k]  (with phase continuity)
  
  3. Reconstruct via IFFT
     - Compute IFFT with rotated bins
     - Apply windowing and overlap-add (same as phase vocoder)

Output: y[n] (pitch-shifted audio, tempo preserved)
```

#### Pitch-Shift Parameters

```rust
pub struct PitchShiftConfig {
    pub shift_semitones: i32,    // -24 to +24 semitones (2 octaves range)
    pub use_phase_vocoder: bool, // false for quick shift, true for high quality
}

// Typical: ±2 semitones for harmonic mixing in DJ context
```

### 3. BPM Detection

**Purpose**: Detect the tempo of a track (one-time analysis during load)

**Algorithm**: Spectral Flux + Onset Detection + Autocorrelation

#### Process

```
Input: Full audio track (PCM samples)
       
Step 1: Spectral Flux Analysis
  - Divide audio into frames (~2048 samples)
  - For each frame: compute FFT → spectrum S[k]
  - Calculate spectral flux: SF[t] = Σ|S[t][k] - S[t-1][k]|²
    (Measures change in frequency spectrum)
  - High flux = drum hit or onset
  
Step 2: Onset Detection
  - Find local maxima in spectral flux signal
  - Apply peak picking: locate times where flux spikes
  - These are likely drum beats
  - List of onset times: [t1, t2, t3, ...]
  
Step 3: Tempo Estimation via Autocorrelation
  - Compute time differences between onsets: [Δt1, Δt2, Δt3, ...]
  - Find most common interval (peak in histogram)
  - This is the beat interval
  - BPM = 60 / beat_interval
  
Step 4: Confidence & Refinement
  - Calculate confidence score (how "regular" are the beats?)
  - If low confidence, try alternative peaks in histogram
  - Return (BPM, confidence, beat_times)

Output: { bpm: 120, confidence: 0.85, beat_grid: [0.0, 0.5, 1.0, ...] }
```

#### Implementation

```rust
pub struct BPMDetector {
    sample_rate: f32,
    frame_size: usize,
}

impl BPMDetector {
    pub fn analyze(&self, audio: &[f32]) -> BPMAnalysis {
        // 1. Compute spectral flux
        let spectral_flux = self.compute_spectral_flux(audio);
        
        // 2. Detect onsets
        let onsets = self.detect_onsets(&spectral_flux);
        
        // 3. Estimate tempo from onset intervals
        let (bpm, confidence) = self.estimate_tempo(&onsets);
        
        BPMAnalysis { bpm, confidence, beat_times: onsets }
    }
    
    fn compute_spectral_flux(&self, audio: &[f32]) -> Vec<f32> {
        let mut flux = Vec::new();
        let mut prev_spectrum = vec![0.0; self.frame_size/2];
        
        for chunk in audio.chunks(self.frame_size) {
            let spectrum = self.fft_magnitude(chunk);
            let mut diff = 0.0;
            
            for i in 0..spectrum.len() {
                diff += (spectrum[i] - prev_spectrum[i]).abs();
            }
            
            flux.push(diff);
            prev_spectrum = spectrum;
        }
        
        flux
    }
    
    fn detect_onsets(&self, flux: &[f32]) -> Vec<f32> {
        // Peak picking with threshold
        let mean_flux = flux.iter().sum::<f32>() / flux.len() as f32;
        let threshold = mean_flux * 1.5;  // 50% above mean
        
        let mut onsets = Vec::new();
        
        for i in 1..flux.len()-1 {
            if flux[i] > threshold && 
               flux[i] > flux[i-1] && 
               flux[i] > flux[i+1] {
                // Convert frame index to time (seconds)
                let time = (i as f32 * self.frame_size as f32) / self.sample_rate;
                onsets.push(time);
            }
        }
        
        onsets
    }
    
    fn estimate_tempo(&self, onsets: &[f32]) -> (f32, f32) {
        // Calculate intervals between onsets
        let intervals: Vec<f32> = onsets
            .windows(2)
            .map(|w| w[1] - w[0])
            .collect();
        
        if intervals.is_empty() {
            return (0.0, 0.0);  // No beats detected
        }
        
        // Find most common interval (median is robust)
        let mut sorted = intervals.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let median_interval = sorted[sorted.len() / 2];
        
        // Convert to BPM
        let bpm = 60.0 / median_interval;
        
        // Confidence: how consistent are intervals?
        let variance = self.variance(&intervals, median_interval);
        let confidence = (-variance.sqrt()).exp();  // Gaussian: high if low variance
        
        (bpm, confidence)
    }
}
```

#### Characteristics

| Property | Value |
|---|---|
| Latency | 5-30 seconds (full file analysis) |
| Accuracy | ±2% typical |
| Failure modes | No clear beat (electronic/ambient), polyrhythmic music |
| Works best | Dance, hip-hop, house (clear steady beat) |
| CPU Cost | ~5 seconds on modern CPU for 3-minute track |

### 4. Key Detection

**Purpose**: Detect musical key for harmonic mixing

**Algorithm**: Chroma Vector Analysis + Peak Finding

#### Process

```
Input: Full audio track
       
Step 1: Chroma Vector Extraction
  - Divide audio into frames (2048 samples)
  - For each frame:
    - Compute FFT
    - Map frequency bins to 12 chromatic pitches (C, C#, D, ..., B)
    - Chroma vector: [C, C#, D, D#, E, F, F#, G, G#, A, A#, B]
    - Sum magnitudes across octaves for each pitch
    - Normalize: chroma_vector / sum(chroma_vector)
  
Step 2: Temporal Aggregation
  - Average chroma vectors over entire track
  - Result: 12-element vector representing "tonal color" of song
  
Step 3: Key Identification
  - Find peak in chroma vector (most dominant pitch)
  - Correlate with major and minor key profiles
  - Determine: key = C (major) or A (minor), etc.
  
Step 4: Root Note & Scale
  - Root note = pitch with highest energy
  - Major or minor = correlate with reference profiles
  - Camelot wheel = convert to DJ notation (1A, 2A, ..., 12B)

Output: { key: "C Major", camelot: "8B", root_note: "C" }
```

#### Implementation Sketch

```rust
pub struct KeyDetector {
    sample_rate: f32,
}

const PITCH_CLASS_LABELS: &[&str] = &["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

impl KeyDetector {
    pub fn analyze(&self, audio: &[f32]) -> KeyAnalysis {
        let mut chroma_sum = vec![0.0; 12];
        
        // Aggregate chroma vectors over entire track
        for chunk in audio.chunks(2048) {
            let chroma = self.extract_chroma_vector(chunk);
            for i in 0..12 {
                chroma_sum[i] += chroma[i];
            }
        }
        
        // Find dominant pitch class
        let root_idx = chroma_sum
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
            .unwrap()
            .0;
        
        let root_note = PITCH_CLASS_LABELS[root_idx];
        
        // Determine major vs minor by correlating with profiles
        let (is_major, confidence) = self.detect_scale(&chroma_sum);
        
        let key_string = format!("{} {}", root_note, if is_major { "Major" } else { "Minor" });
        
        KeyAnalysis {
            key: key_string,
            root_note: root_note.to_string(),
            is_major,
            confidence,
            camelot_wheel: self.to_camelot(root_idx, is_major),
        }
    }
    
    fn extract_chroma_vector(&self, audio: &[f32]) -> Vec<f32> {
        let spectrum = self.fft_magnitude(audio);
        let mut chroma = vec![0.0; 12];
        
        for (freq_bin, magnitude) in spectrum.iter().enumerate() {
            // Map frequency bin to pitch class
            let freq = freq_bin as f32 * self.sample_rate / audio.len() as f32;
            let pitch_class = self.freq_to_pitch_class(freq);
            
            chroma[pitch_class] += magnitude;
        }
        
        // Normalize
        let sum: f32 = chroma.iter().sum();
        for c in &mut chroma {
            *c /= sum.max(0.001);
        }
        
        chroma
    }
}
```

## Real-Time Performance Budget

**Frame Duration @ 48kHz, 256 samples**: 5.3ms

**Budget Allocation**:
| Component | Time | Notes |
|---|---|---|
| Phase Vocoder FFT | 2.5ms | Must complete in < 3ms to be safe |
| Pitch Shifting | +1.0ms | Adds frequency bin rotation |
| Overlap-Add | 0.3ms | Fast, mostly memory copy |
| Buffer Management | 0.2ms | Minimal |
| Overhead/Margin | 1.3ms | Safety buffer for variations |
| **Total** | **5.3ms** | No room for error |

**Implications**:
- FFT size cannot exceed 2048 without glitches
- Smaller FFT = faster but lower quality (more artifacts)
- Trade-off: 2048 is sweet spot (good quality, fast enough)

## Memory Management

### Pre-Allocated Buffers (No Runtime Allocations)

```rust
pub struct AudioEngine {
    // Per-channel buffers
    input_pcm: Vec<f32>,           // 2 seconds @ 48kHz = 96KB
    output_pcm: Vec<f32>,          // 2 seconds @ 48kHz = 96KB
    
    // Phase Vocoder state
    pv: PhaseVocoder,              // ~100KB internal buffers
    
    // Temporary work buffers
    fft_buffer: Vec<Complex32>,    // 2048 complex = 16KB
    scratch: Vec<f32>,             // 2048 floats = 8KB
    
    // Total: ~320KB per instance (minimal)
}
```

### Memory Growth Prevention

```rust
// ✅ GOOD: Pre-allocate once
let mut output = Vec::with_capacity(capacity);
for sample in input {
    output.push(sample);  // No reallocation
}

// ❌ BAD: Allocation in hot path
for sample in input {
    let mut temp = Vec::new();  // Allocation per sample!
    temp.push(sample * 2.0);
}
```

## Integration with JavaScript

### Exported Functions (via wasm-bindgen)

```rust
#[wasm_bindgen]
pub fn new_phase_vocoder(sample_rate: f32) -> PhaseVocoderHandle {
    // Returns opaque handle to JS
}

#[wasm_bindgen]
pub fn process_frame(
    handle: PhaseVocoderHandle,
    input: &[f32],
    tempo_ratio: f32,
    pitch_shift: i32,
) -> Box<[f32]> {
    // Returns processed audio as TypedArray
}

#[wasm_bindgen]
pub fn analyze_bpm(audio: &[f32], sample_rate: f32) -> BPMAnalysisJS {
    // Returns JSON-serializable struct
}
```

### TypeScript Binding Example

```typescript
import init, { new_phase_vocoder, process_frame } from './audio_engine.js';

await init();  // Load Wasm module

const pv = new_phase_vocoder(48000);
const output = process_frame(pv, inputArray, 1.05, 0);  // Tempo +5%, no pitch shift
```

## Testing the Audio Engine

### Unit Tests (Rust)

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_phase_vocoder_preserves_pitch() {
        let input = generate_sine_wave(440.0, 2.0);  // A4 at 2 seconds
        let mut pv = PhaseVocoder::new(48000);
        
        let output = pv.process(&input, 1.5);  // 50% tempo increase
        
        let input_pitch = detect_pitch(&input);
        let output_pitch = detect_pitch(&output);
        
        assert!((input_pitch - output_pitch).abs() < 5.0);  // Within 5 Hz
    }
}
```

### Integration Tests (JS/TypeScript)

```typescript
describe('Audio Engine', () => {
    it('should maintain audio quality with tempo changes', async () => {
        const audio = await loadTestTrack('test.mp3');
        const result = processWithTempo(audio, 1.1);
        
        const quality = measureAudioQuality(audio, result);
        expect(quality.snr).toBeGreaterThan(30);  // > 30dB SNR
    });
});
```

---

**Last Updated**: December 2025

**Related Documents**:
- [Architecture Overview](./02-ARCHITECTURE.md) - How this fits in the overall system
- [Web Audio Integration](./04-WEB-AUDIO-INTEGRATION.md) - How it connects to the browser
- [Performance Requirements](./PERFORMANCE/01-REQUIREMENTS.md) - Detailed benchmarks
