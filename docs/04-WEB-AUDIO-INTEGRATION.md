# Web Audio Integration

This document explains how the WebAssembly audio engine integrates with the browser's Web Audio API and AudioWorklet.

## Web Audio API Overview

The Web Audio API is a browser standard for real-time audio processing. It provides:
- **AudioContext**: Central audio processing hub
- **Nodes**: Audio processing units (gain, filters, effects)
- **Connections**: Route audio between nodes
- **AnalyserNode**: FFT analysis for visualization
- **AudioWorklet**: Dedicated thread for custom audio processing

### Audio Graph Architecture

```
[Track 1 PCM] → [AudioWorkletNode 1] ─┐
                                       ├→ [Crossfader/Mixer] → [GainNode] → [AnalyserNode] → [Speakers]
[Track 2 PCM] → [AudioWorkletNode 2] ─┘

Each AudioWorkletNode:
- Input: PCM data from decoder buffer
- Processing: Wasm phase vocoder + pitch shift
- Output: Processed PCM samples
```

## AudioWorklet: The Real-Time Audio Thread

### What is AudioWorklet?

AudioWorklet is a modern Web API that runs audio processing code in a dedicated thread, separate from the main JavaScript thread (where Angular runs).

**Key Properties**:
- **Dedicated Thread**: Never blocked by UI updates or network I/O
- **Real-Time Scheduling**: Guaranteed low-latency callbacks
- **Buffer Size**: Typically 128-512 samples per callback
- **Sample Rate**: Inherited from AudioContext (e.g., 48kHz)
- **No DOM Access**: Cannot update UI directly (must use MessagePort)

### AudioWorklet vs. ScriptProcessor (Legacy)

| Feature | AudioWorklet | ScriptProcessor |
|---|---|---|
| Thread | Dedicated | Main thread (blocking!) |
| Latency | Low, predictable | High, variable |
| CPU | Efficient | Inefficient |
| Status | Modern standard | Deprecated |

**Always use AudioWorklet, never ScriptProcessor.**

## Implementation: Creating an AudioWorklet

### Step 1: Create the AudioWorklet Processor Script

**File: `src/assets/audio-worklet-processor.ts`**

```typescript
import init, { process_frame } from './wasm/audio_engine.js';

// Wasm module instance
let wasmModule: any;

// Processor class runs in AudioWorklet thread
class AudioWorkletProcessor extends AudioWorkletProcessor {
  sampleRate: number = 48000;
  wasmHandle: any = null;
  
  // Real-time parameters (updated via messages)
  tempo: f32 = 1.0;
  pitch: i32 = 0;
  volume: f32 = 1.0;
  crossfader: f32 = 0.5;  // 0 = deck1, 1 = deck2
  
  // Audio buffers for input data
  deck1Buffer: RingBuffer;
  deck2Buffer: RingBuffer;
  
  constructor(options: AudioWorkletNodeOptions) {
    super(options);
    
    this.deck1Buffer = new RingBuffer(2 * 48000);  // 2 seconds
    this.deck2Buffer = new RingBuffer(2 * 48000);
    
    // Listen for parameter changes from main thread
    this.port.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data);
    };
  }
  
  handleMessage(data: any) {
    switch (data.type) {
      case 'tempo':
        this.tempo = data.value;
        break;
      case 'pitch':
        this.pitch = data.value;
        break;
      case 'volume':
        this.volume = data.value;
        break;
      case 'crossfader':
        this.crossfader = data.value;
        break;
      case 'feedAudio':
        // Receive PCM data from main thread
        this.deck1Buffer.push(data.deck1);
        this.deck2Buffer.push(data.deck2);
        break;
    }
  }
  
  /**
   * Real-time audio processing callback
   * Called ~48 times per second (for 256-sample buffer at 48kHz)
   * MUST return true to keep running, false to stop
   */
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean {
    const output = outputs[0];
    
    // Get fresh audio chunks from buffers
    const chunk1 = this.deck1Buffer.read(256);
    const chunk2 = this.deck2Buffer.read(256);
    
    // Process through Wasm phase vocoder
    const processed1 = wasmModule.process_frame(
      chunk1,
      this.tempo,
      this.pitch
    );
    const processed2 = wasmModule.process_frame(
      chunk2,
      this.tempo,
      this.pitch
    );
    
    // Mix via crossfader
    const mix = (cf: f32) => cf * processed2 + (1 - cf) * processed1;
    
    // Apply gain
    for (let i = 0; i < 256; i++) {
      output[0][i] = mix(this.crossfader) * this.volume;
    }
    
    return true;  // Keep running
  }
}

// Register the processor
registerProcessor('audio-worklet-processor', AudioWorkletProcessor);
```

### Step 2: Load AudioWorklet in AudioService

**File: `src/frontend/src/app/services/audio.service.ts`**

```typescript
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode;
  private deck1Buffer: ArrayBuffer = new ArrayBuffer(2 * 48000 * 4);  // 2 sec @ 48kHz stereo
  private deck2Buffer: ArrayBuffer = new ArrayBuffer(2 * 48000 * 4);
  
  constructor() {}
  
  /**
   * Initialize audio system
   * Call once on app startup
   */
  async initialize(): Promise<void> {
    // Create audio context
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 48000,
    });
    
    // Resume audio context (required by modern browsers)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    // Load AudioWorklet processor script
    await this.audioContext.audioWorklet.addModule(
      'assets/audio-worklet-processor.js'  // Compiled from TypeScript
    );
    
    // Create AudioWorkletNode
    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      'audio-worklet-processor'
    );
    
    // Set up audio graph: WorkletNode → GainNode → AnalyserNode → Speakers
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 0.8;
    
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 2048;
    
    this.workletNode.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(this.audioContext.destination);
    
    // Ready for audio!
    console.log('Audio system initialized');
  }
  
  /**
   * Send control message to AudioWorklet
   * Non-blocking, applies on next audio callback
   */
  setTempo(tempo: number): void {
    this.workletNode.port.postMessage({
      type: 'tempo',
      value: tempo,
    });
  }
  
  setPitch(semitones: number): void {
    this.workletNode.port.postMessage({
      type: 'pitch',
      value: semitones,
    });
  }
  
  setVolume(gain: number): void {
    this.workletNode.port.postMessage({
      type: 'volume',
      value: gain,
    });
  }
  
  setCrossfader(position: number): void {
    this.workletNode.port.postMessage({
      type: 'crossfader',
      value: position,  // 0 = deck1 only, 1 = deck2 only
    });
  }
  
  /**
   * Feed decoded audio to AudioWorklet
   * Called after decoding each chunk
   */
  feedAudio(deck1: Float32Array, deck2: Float32Array): void {
    this.workletNode.port.postMessage({
      type: 'feedAudio',
      deck1: deck1,
      deck2: deck2,
    }, [deck1.buffer, deck2.buffer]);  // Transfer ownership (zero-copy)
  }
}
```

## Audio Graph Details

### Node Connections

```
Input Sources:
├─ Deck 1 (AudioWorkletNode)
└─ Deck 2 (AudioWorkletNode)
  ↓
Crossfader/Mixer (in AudioWorkletProcessor)
  ↓
GainNode (volume control)
  ↓
AnalyserNode (frequency analysis for visualization)
  ↓
AudioDestinationNode (speakers)
```

### Real-Time Control Flow

```
1. User moves Tempo slider → Angular component
2. Component emits change → Service.setTempo()
3. Service.setTempo() calls workletNode.port.postMessage()
4. Message travels to AudioWorklet (non-blocking)
5. AudioWorklet's onmessage handler receives it
6. Next audio callback uses new tempo value
7. Wasm processes with new tempo
8. Output updated automatically
```

**Latency**: ~5-10ms from slider change to audio output change

## Buffer Management

### Ring Buffer Implementation (Rust side of AudioWorklet)

```rust
pub struct RingBuffer {
    data: Vec<f32>,
    capacity: usize,
    write_pos: usize,
    read_pos: usize,
    size: usize,
}

impl RingBuffer {
    pub fn new(capacity: usize) -> Self {
        RingBuffer {
            data: vec![0.0; capacity],
            capacity,
            write_pos: 0,
            read_pos: 0,
            size: 0,
        }
    }
    
    pub fn write(&mut self, samples: &[f32]) {
        for sample in samples {
            self.data[self.write_pos] = *sample;
            self.write_pos = (self.write_pos + 1) % self.capacity;
            self.size = self.size.min(self.capacity);
        }
    }
    
    pub fn read(&mut self, count: usize) -> Vec<f32> {
        let mut result = Vec::with_capacity(count);
        
        for _ in 0..count {
            if self.size > 0 {
                result.push(self.data[self.read_pos]);
                self.read_pos = (self.read_pos + 1) % self.capacity;
                self.size -= 1;
            } else {
                result.push(0.0);  // Output silence if buffer empty
            }
        }
        
        result
    }
    
    pub fn level(&self) -> f32 {
        self.size as f32 / self.capacity as f32
    }
}
```

### Buffer Underrun Detection

```typescript
// In AudioWorklet
if (this.deck1Buffer.level() < 0.2) {  // Less than 20% full
  console.warn('Buffer underrun risk on deck 1');
  
  // Send warning to main thread
  this.port.postMessage({
    type: 'bufferWarning',
    deck: 1,
    level: this.deck1Buffer.level(),
  });
}
```

## Synchronization Between Threads

### MessagePort Communication

```typescript
// Main Thread (Angular)
workletNode.port.postMessage(
  { type: 'tempo', value: 1.05 },
  []  // No transferable objects (or transfer ownership)
);

// AudioWorklet Thread
this.port.onmessage = (event) => {
  // Receives message asynchronously
  // Processes it immediately or on next callback
};
```

### Key Principles

1. **No Shared Memory** (unless using SharedArrayBuffer, not recommended)
2. **Non-Blocking**: Posting a message never waits
3. **FIFO Order**: Messages processed in order received
4. **Async**: Main thread doesn't wait for worklet response

### Anti-Patterns

```typescript
// ❌ BAD: Trying to sync with worklet (won't work)
workletNode.port.postMessage({ type: 'getTempo' });
const tempo = await getResponseSomehow();  // Impossible!

// ✅ GOOD: Fire and forget, apply on next callback
workletNode.port.postMessage({ type: 'setTempo', value });
```

## AnalyserNode for Visualization

The AnalyserNode provides real-time frequency analysis (FFT) for waveform display:

```typescript
export class VisualizationService {
  private analyser: AnalyserNode;
  private dataArray: Uint8Array;
  
  constructor(audioContext: AudioContext) {
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 2048;  // FFT size for visualization
    
    // Connect to audio graph somewhere before destination
    // e.g., gainNode.connect(this.analyser);
    
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
  }
  
  /**
   * Get frequency data for drawing waveform
   * Call from AnimationFrame loop
   */
  getFrequencyData(): Uint8Array {
    this.analyser.getByteFrequencyData(this.dataArray);
    return this.dataArray;
  }
  
  /**
   * Get time-domain waveform
   */
  getWaveformData(): Uint8Array {
    const waveform = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(waveform);
    return waveform;
  }
}

// Usage in Angular component
@Component({
  selector: 'app-waveform',
  template: `<canvas #waveformCanvas></canvas>`
})
export class WaveformComponent {
  @ViewChild('waveformCanvas') canvas: ElementRef<HTMLCanvasElement>;
  
  constructor(private viz: VisualizationService) {}
  
  ngAfterViewInit() {
    const ctx = this.canvas.nativeElement.getContext('2d');
    
    const draw = () => {
      const data = this.viz.getFrequencyData();
      
      ctx.fillStyle = 'rgb(0, 0, 0)';
      ctx.fillRect(0, 0, this.canvas.nativeElement.width, this.canvas.nativeElement.height);
      
      ctx.fillStyle = 'rgb(0, 255, 0)';
      const barWidth = this.canvas.nativeElement.width / data.length;
      
      for (let i = 0; i < data.length; i++) {
        const barHeight = (data[i] / 255) * this.canvas.nativeElement.height;
        ctx.fillRect(i * barWidth, this.canvas.nativeElement.height - barHeight, barWidth, barHeight);
      }
      
      requestAnimationFrame(draw);
    };
    
    draw();
  }
}
```

## Error Handling

```typescript
// Handle audio context errors
if (this.audioContext.state === 'suspended') {
  this.audioContext.resume().catch(err => {
    console.error('Failed to resume audio context', err);
    // Alert user: "Click to start audio"
  });
}

// Monitor worklet health
this.workletNode.port.onmessage = (event) => {
  if (event.data.type === 'error') {
    console.error('AudioWorklet error:', event.data.error);
    // Fallback or recovery logic
  } else if (event.data.type === 'bufferWarning') {
    console.warn('Buffer underrun:', event.data);
    // Increase buffer size or reduce quality
  }
};
```

## Performance Tips

1. **Use Float32Array** for audio data (native browser type)
2. **Transfer ownership** of buffers (zero-copy) when possible
3. **Batch messages** to worklet (don't send 60 messages per second)
4. **Monitor buffer levels** to prevent glitches
5. **Avoid allocations** in AudioWorklet's process() method

---

**Last Updated**: December 2025

**Related Documents**:
- [Architecture Overview](./02-ARCHITECTURE.md) - System-level design
- [Audio Engine Design](./03-AUDIO-ENGINE.md) - Wasm algorithms
- [IMPLEMENTATION/04-AUDIOWORKLET-PROCESSOR.md](./IMPLEMENTATION/04-AUDIOWORKLET-PROCESSOR.md) - Detailed processor guide
