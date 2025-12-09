# Performance Requirements

This document specifies the performance targets and constraints for the WASM DJ Controller, with emphasis on Priority 1: never hiccupping audio playback.

## Critical Performance Targets

### 🎯 Priority 1: Audio Playback Stability

**Requirement**: Zero audio glitches or hiccups during normal operation

| Metric | Target | Limit | Critical |
|---|---|---|---|
| **Buffer Underruns** | 0 per session | <1 per hour | >1 per hour = FAIL |
| **Audio Latency** | 50-100ms | <200ms | >500ms = FAIL |
| **Sample Dropout Rate** | 0% | <0.01% | >0.1% = FAIL |
| **Playback Continuity** | Seamless | No clicks/pops | Any artifact = FAIL |

### 🎯 Priority 2: Real-Time Control Response

**Requirement**: UI input (slider, button) must feel instantaneous

| Metric | Target | Acceptable | Problem |
|---|---|---|---|
| **Tempo Change Latency** | <50ms | <100ms | >200ms |
| **Pitch Change Latency** | <50ms | <100ms | >200ms |
| **Crossfader Response** | <33ms | <50ms | >100ms |

### 🎯 Priority 3: User Experience

**Requirement**: Smooth, professional-grade UI feel

| Metric | Target | Acceptable | Problem |
|---|---|---|---|
| **UI Frame Rate** | 60 FPS | >50 FPS | <30 FPS |
| **Waveform Redraw** | 30 FPS | >20 FPS | <10 FPS |
| **App Startup Time** | <3 seconds | <5 seconds | >10 seconds |
| **Track Load Time** | <2 seconds | <5 seconds | >10 seconds |

## Detailed Performance Specs

### Audio Processing Budget

**Sample Rate**: 48 kHz (standard professional audio)  
**Buffer Size**: 256 samples (varies by browser, 5.3ms at 48kHz)  
**Total Budget per Callback**: 5.3ms

**Budget Allocation**:

```
AudioWorklet Callback (5.3ms)
├─ Phase Vocoder FFT Analysis     2.0ms (target), 2.5ms (max)
├─ Phase Advance Calculation      0.8ms
├─ Pitch Shifting (if enabled)    1.0ms
├─ IFFT Synthesis                 0.8ms
├─ Overlap-Add Buffer Management  0.3ms
├─ Crossfader Mixing              0.1ms
├─ Message Port Polling           0.1ms
└─ Safety Margin                  0.2ms
───────────────────────────────────────
    TOTAL:                         5.3ms ✓
```

**Implications**:
- No task can exceed its allocated budget
- FFT is the bottleneck (~38% of budget)
- No dynamic allocation in audio callback
- No I/O operations (sync or async)
- No spinning loops or polling

### FFT Size Impact

| FFT Size | Per-Sample Latency | Quality | CPU Load | Pitch Accuracy |
|---|---|---|---|---|
| 512 | ~10ms | Fair | 60% | ±5% |
| 1024 | ~20ms | Good | 75% | ±2% |
| **2048** | **~42ms** | **Excellent** | **95%** | **±0.5%** |
| 4096 | ~85ms | Excellent+ | Exceeds budget | ±0.2% |

**Decision: Use 2048** (best quality within time budget)

### Wasm Module Performance

```
Phase Vocoder Algorithm (Rust/Wasm):
├─ FFT computation             1500-2000 µs
├─ Phase vocoder math          500-800 µs
├─ IFFT computation            1500-2000 µs
├─ Pitch shifting (if enabled) 200-400 µs
└─ Overhead                    100-200 µs
────────────────────────────────────────
  TOTAL:                        4300-5400 µs (4.3-5.4ms)
```

**Note**: Wasm execution is ~50-80x faster than equivalent JavaScript

### Memory Performance

```
Memory Budget (per deck):
├─ Input PCM Buffer           96 KB  (2 sec @ 48kHz, 2 bytes/sample)
├─ Output PCM Buffer          96 KB
├─ Wasm Working Buffers       64 KB  (FFT, overlap-add)
├─ Phase State Buffers        8 KB   (phase, magnitude history)
└─ Ring Buffer                64 KB  (input FIFO)
────────────────────────────────────
  Total per Deck:            ~330 KB
  Total (2 decks):           ~660 KB
  
Wasm Module (once):
├─ Code/Data section         ~200 KB
├─ Wasm linear memory        ~100 KB
└─ Runtime heap              ~50 KB
────────────────────────────────────
  Total Wasm:                ~350 KB

Grand Total:                 ~1 MB (acceptable)
```

**Note**: Modern browsers can handle 10-100MB+ for audio apps without issues

### CPU Usage Targets

| Component | One Deck | Two Decks | Headroom |
|---|---|---|---|
| **Phase Vocoder** | 45% | 90% | 10% |
| **UI Rendering** | 10% | 10% | - |
| **Other Tasks** | 10% | 5% | - |
| **Total** | **65%** | **~105%** | **⚠️** |

**Issue**: Two decks at full tempo stretching exceeds single-core budget!

**Solution**:
- Use multi-core if available (Web Workers for analysis)
- Accept lower quality when both decks are heavily processed
- Implement CPU throttling (reduce FFT size when needed)

### Browser Compatibility

| Browser | AudioWorklet | Wasm | Web Worker | Min Version |
|---|---|---|---|---|
| Chrome | ✓ | ✓ | ✓ | 66+ |
| Firefox | ✓ | ✓ | ✓ | 77+ |
| Safari | ✓ | ✓ | ✓ | 14.1+ |
| Edge | ✓ | ✓ | ✓ | 79+ |
| Mobile Safari | ✓ | ✓ | ✓ | 14.5+ |

**Requirements**: All browsers must support AudioWorklet (no fallback)

## Latency Breakdown

### End-to-End Latency (User Input → Audio Output)

```
User moves Tempo Slider (t=0)
  ↓ (~1ms) Browser event processing
Angular detects change (t=~1ms)
  ↓ (~2ms) Service debounce/throttle
AudioService.setTempo() called (t=~3ms)
  ↓ (0ms) Non-blocking message post
Message in AudioWorklet queue (t=~3ms)
  ↓ (~5-10ms) Wait for next audio callback
AudioWorklet receives message (t=~8-13ms)
  ↓ (~5.3ms) Process frame with new tempo
Output buffer written (t=~13-18ms)
  ↓ (~40-50ms) Audio hardware latency (inherent)
Sound changes at speakers (t=~55-70ms)
```

**Total Latency**: 55-70ms (acceptable for DJ use, imperceptible to user)

### Callback Timing

```
AudioWorklet Timing (48kHz, 256 samples):

Expected:  Callback every 5.33ms
┌─────────┬─────────┬─────────┬─────────┐
0ms       5.33ms   10.66ms  15.99ms  21.32ms

Worst Case (with message handling):
┌──────────┬──────────┬──────────┐
0ms        5.4ms     10.7ms

⚠️ Even 1ms overrun causes glitch!
```

## Testing Methodology

### Stress Tests

**Test 1: Sustained Operation**
- Load 10-minute track
- Run for full duration at various tempos
- Measure: buffer underruns, CPU usage, memory growth
- Success: Zero underruns, stable performance

**Test 2: Extreme Tempo Changes**
- Load track at normal tempo
- Suddenly change to -50% (half speed)
- Suddenly change to +50% (1.5x speed)
- Measure: glitches, phase artifacts, distortion
- Success: No audible glitches

**Test 3: Sustained Beat Matching**
- Load two tracks
- Constantly adjust tempo (simulate DJ work)
- Duration: 10 minutes
- Measure: quality, glitches, CPU usage
- Success: No glitches, CPU <90%

**Test 4: Low-End Hardware**
- Test on budget mobile device (2GB RAM, older CPU)
- Measure: stability, latency, user experience
- Success: Playable, acceptable quality (may reduce FFT size)

### Profiling Tools

```bash
# Chrome DevTools
1. Open DevTools (F12)
2. Performance tab
3. Record for 10 seconds
4. Look for:
   - Long tasks (>50ms)
   - Dropped frames
   - Memory spikes
   - JS execution time

# Wasm-specific profiling
1. Console: performance.mark('phase_vocoder_start')
2. Do work
3. Console: performance.mark('phase_vocoder_end')
4. Console: performance.measure('phase_vocoder', ...)
```

### Benchmarking Script

```typescript
// Measure phase vocoder performance
async function benchmarkPhaseVocoder() {
  const audioContext = new AudioContext({ sampleRate: 48000 });
  const testDuration = 10;  // seconds
  const testSamples = testDuration * 48000;
  
  const input = new Float32Array(testSamples);
  // Fill with test signal (sine wave)
  for (let i = 0; i < testSamples; i++) {
    input[i] = Math.sin(2 * Math.PI * 440 * i / 48000);
  }
  
  const t0 = performance.now();
  
  // Process in chunks (as AudioWorklet does)
  for (let i = 0; i < testSamples; i += 256) {
    const chunk = input.slice(i, i + 256);
    const output = wasmModule.process_frame(chunk, 1.0, 0);
  }
  
  const t1 = performance.now();
  const elapsed = t1 - t0;
  const realTime = testDuration * 1000;
  const ratio = elapsed / realTime;
  
  console.log(`Processing time: ${elapsed.toFixed(2)}ms`);
  console.log(`Real-time ratio: ${ratio.toFixed(2)}x`);
  console.log(`CPU utilization: ${(ratio * 100).toFixed(1)}%`);
  
  // Acceptable: <2x real-time (because it's one callback)
  // Target: <1x real-time (50% of audio frame budget)
  
  return ratio < 2.0 ? 'PASS' : 'FAIL';
}
```

## Optimization Checkpoints

### Before Committing Code

```typescript
// Checklist
[ ] No console.log() in audio callback
[ ] No setTimeout/setInterval in audio callback
[ ] No DOM access from AudioWorklet
[ ] All buffers pre-allocated
[ ] No string concatenation in hot path
[ ] No array.map/filter in hot path (use for loops)
[ ] Wasm functions called with Float32Array (not copy)
```

### Before Each Release

```bash
# 1. Run stress tests
npm run test:stress

# 2. Profile with DevTools
npm run profile

# 3. Measure on low-end hardware
npm run test:hardware:low-end

# 4. Check memory leaks
npm run test:memory-leak

# 5. Validate on all browsers
npm run test:browser-compat
```

## Fallback & Degradation

If performance targets cannot be met:

```typescript
// Graceful degradation strategy
if (cpuUsage > 85%) {
  // Reduce FFT size
  fftSize = 1024;  // Trade quality for speed
  notify('Reducing audio quality for stability');
}

if (bufferLevel < 20%) {
  // Increase buffer size
  bufferSize = 4096;  // More memory for stability
}

if (audioContext.baseLatency > 100) {
  // Reduce UI update frequency
  uiUpdateInterval = 100;  // Every 100ms instead of 30
}
```

## Hardware Recommendations

### Minimum Requirements (Mobile)
- **CPU**: Dual-core @ 1.5 GHz (e.g., Snapdragon 400)
- **RAM**: 2 GB
- **Audio Support**: 48kHz, 16-bit stereo
- **Browser**: iOS Safari 14.5+, Android Chrome 66+

### Recommended (Desktop)
- **CPU**: Quad-core @ 2.0 GHz+
- **RAM**: 8 GB+
- **Audio Support**: 48kHz or higher
- **Browser**: Latest Chrome, Firefox, or Safari

### Professional (Production DJ Use)
- **CPU**: 6+ cores @ 3.0 GHz+
- **RAM**: 16 GB+
- **Audio Interface**: Professional USB/Thunderbolt (low-latency drivers)
- **Browser**: Latest stable Chrome (most widely tested for audio)

---

**Last Updated**: December 2025

**Related Documents**:
- [Audio Engine Design](./03-AUDIO-ENGINE.md) - Algorithm details
- [Optimization Guide](./PERFORMANCE/02-OPTIMIZATION.md) - Detailed optimization techniques
- [Profiling Tools](./TESTING/03-PROFILING.md) - Advanced profiling setup
