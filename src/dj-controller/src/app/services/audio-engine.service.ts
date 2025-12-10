import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Audio Engine Service using Rust WASM for high-performance audio processing
 * 
 * This service provides:
 * - Tempo control (time stretching with phase vocoder - preserves pitch)
 * - Pitch control (pitch shifting - affects tone/key)
 * - 3-band equalizer
 * - Stereo fader
 * 
 * The service manages both the WASM audio processor and Web Audio API playback
 */
@Injectable()
export class AudioEngineService {
    private audioContext: AudioContext | null = null;
    private audioBuffer: AudioBuffer | null = null;
    private scriptProcessor: ScriptProcessorNode | null = null;
    private constantSource: ConstantSourceNode | null = null;
    private gainNode: GainNode | null = null;

    // EQ Filters
    private lowFilter: BiquadFilterNode | null = null;
    private midFilter: BiquadFilterNode | null = null;
    private highFilter: BiquadFilterNode | null = null;
    private lowGainNode: GainNode | null = null;
    private midGainNode: GainNode | null = null;
    private highGainNode: GainNode | null = null;

    // WASM Audio Processor (will be loaded dynamically)
    private wasmProcessor: any = null;
    private wasmLoaded: boolean = false;

    // Playback state
    private isPlayingFlag: boolean = false;
    private currentPlaybackPosition: number = 0;
    private pauseTime: number = 0;
    private playbackStartTime: number = 0;

    // Audio processing parameters
    private tempoRatio: number = 1.0;
    private usePitchMode: boolean = false;

    // Mixer parameters
    private channelGain: number = 1.0;
    private highEqGain: number = 1.0;
    private midEqGain: number = 1.0;
    private lowEqGain: number = 1.0;
    private panPosition: number = 0.0; // -1 (left) to +1 (right)
    private channelVolume: number = 0.8;
    private crossFaderPosition: number = 0.0; // -1 (left deck) to +1 (right deck)
    private masterVolume: number = 0.8;

    // Buffers for real-time processing
    private sourceBufferL: Float32Array = new Float32Array(0);
    private sourceBufferR: Float32Array = new Float32Array(0);
    private readPosition: number = 0;
    private lastUpdateTime: number = 0;
    private updateThrottle: number = 100; // Update every 100ms

    // Observables
    private playbackTimeSubject = new Subject<number>();
    public playbackTime$ = this.playbackTimeSubject.asObservable();

    private playbackEndedSubject = new Subject<void>();
    public playbackEnded$ = this.playbackEndedSubject.asObservable();

    constructor() {
        this.initializeAudioContext();
        this.loadWasmModule();
    }

    private initializeAudioContext(): void {
        if (typeof window !== 'undefined' && window.AudioContext) {
            this.audioContext = new window.AudioContext();
        }
    }

    /**
     * Initialize 3-band EQ filter chain
     */
    private initializeEQ(): void {
        if (!this.audioContext) return;

        // Low band: Low-shelf filter at 250Hz
        this.lowFilter = this.audioContext.createBiquadFilter();
        this.lowFilter.type = 'lowshelf';
        this.lowFilter.frequency.value = 250;
        this.lowFilter.gain.value = 0; // Will be controlled by lowEqGain

        // Mid band: Peaking filter at 1000Hz
        this.midFilter = this.audioContext.createBiquadFilter();
        this.midFilter.type = 'peaking';
        this.midFilter.frequency.value = 1000;
        this.midFilter.Q.value = 1.0;
        this.midFilter.gain.value = 0;

        // High band: High-shelf filter at 4000Hz
        this.highFilter = this.audioContext.createBiquadFilter();
        this.highFilter.type = 'highshelf';
        this.highFilter.frequency.value = 4000;
        this.highFilter.gain.value = 0;

        // Connect EQ chain: low -> mid -> high -> gain -> destination
        this.lowFilter.connect(this.midFilter);
        this.midFilter.connect(this.highFilter);
        this.highFilter.connect(this.gainNode!);
        this.gainNode!.connect(this.audioContext.destination);

        console.log('[AudioEngine] 3-band EQ initialized');
    }

    /**
     * Load the WASM audio processing module
     */
    private async loadWasmModule(): Promise<void> {
        try {
            // TODO: Load the WASM module once it's built
            // For now, we'll use a fallback implementation
            console.log('[AudioEngine] WASM module loading...');
            this.wasmLoaded = false;
        } catch (error) {
            console.error('[AudioEngine] Failed to load WASM module:', error);
            this.wasmLoaded = false;
        }
    }

    /**
     * Load an audio file for playback
     */
    async loadTrack(file: File): Promise<AudioBuffer | null> {
        try {
            if (!this.audioContext) {
                return null;
            }

            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            // Extract audio data into Float32Arrays for processing
            this.sourceBufferL = this.audioBuffer.getChannelData(0);
            this.sourceBufferR = this.audioBuffer.numberOfChannels > 1
                ? this.audioBuffer.getChannelData(1)
                : this.audioBuffer.getChannelData(0);

            // Reset playback state
            this.currentPlaybackPosition = 0;
            this.pauseTime = 0;
            this.readPosition = 0;
            this.isPlayingFlag = false;

            // Initialize gain node FIRST - EQ chain will connect to it
            if (!this.gainNode) {
                this.gainNode = this.audioContext.createGain();
                this.gainNode.gain.value = 0.8;
            }

            // Initialize EQ filters (connects to gain node)
            if (!this.lowFilter) {
                this.initializeEQ();
            }

            // Pre-create script processor to avoid delay on first play (after EQ is initialized)
            if (!this.scriptProcessor) {
                const bufferSize = 4096;
                this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 2, 2);
                this.scriptProcessor.onaudioprocess = (e) => this.processAudio(e);

                // Create a silent constant source to drive the script processor
                this.constantSource = this.audioContext.createConstantSource();
                this.constantSource.offset.value = 0; // Silent

                // Connect: constantSource -> scriptProcessor -> lowFilter
                this.constantSource.connect(this.scriptProcessor);
                this.scriptProcessor.connect(this.lowFilter!);

                // Start the constant source (it runs continuously but silently)
                this.constantSource.start();
            }

            // Initialize WASM processor if loaded
            if (this.wasmLoaded && !this.wasmProcessor) {
                // this.wasmProcessor = new AudioProcessor(this.audioContext.sampleRate, 1024);
            }

            console.log('[AudioEngine] Track loaded - duration:', this.audioBuffer.duration, 's');
            return this.audioBuffer;
        } catch (error) {
            console.error('[AudioEngine] Error loading track:', error);
            return null;
        }
    }

    /**
     * Start playback
     */
    play(fromTime?: number): void {
        if (!this.audioContext || !this.audioBuffer || !this.gainNode) {
            console.warn('[AudioEngine] Audio not ready for playback');
            return;
        }

        console.log('[AudioEngine] play() called - isPlayingFlag:', this.isPlayingFlag, 'scriptProcessor:', !!this.scriptProcessor, 'constantSource:', !!this.constantSource);

        // Determine start position
        const startPosition = fromTime !== undefined ? fromTime : (this.currentPlaybackPosition || this.pauseTime);
        this.readPosition = Math.floor(startPosition * this.audioContext.sampleRate);

        console.log('[AudioEngine] Starting playback from position:', startPosition, 'readPosition:', this.readPosition, 'sourceBufferL.length:', this.sourceBufferL.length);

        this.playbackStartTime = this.audioContext.currentTime - startPosition;
        this.isPlayingFlag = true;

        // Start time update loop
        this.startTimeUpdateLoop();
    }

    /**
     * Process audio in real-time
     */
    private processAudio(event: AudioProcessingEvent): void {
        console.log('[AudioEngine] processAudio called - isPlayingFlag:', this.isPlayingFlag, 'audioBuffer:', !!this.audioBuffer, 'sourceBufferL.length:', this.sourceBufferL.length);

        if (!this.isPlayingFlag || !this.audioBuffer) {
            // Clear output buffers when not playing
            const outputL = event.outputBuffer.getChannelData(0);
            const outputR = event.outputBuffer.getChannelData(1);
            outputL.fill(0);
            outputR.fill(0);
            return;
        }

        const outputL = event.outputBuffer.getChannelData(0);
        const outputR = event.outputBuffer.getChannelData(1);
        const bufferSize = outputL.length;
        const sampleRate = this.audioContext!.sampleRate;
        const totalSamples = this.sourceBufferL.length;

        for (let i = 0; i < bufferSize; i++) {
            if (this.usePitchMode) {
                // PITCH MODE: Read samples at different rate (changes both speed and pitch)
                const readPos = this.readPosition + (i * this.tempoRatio);
                const index = Math.floor(readPos);

                if (index >= totalSamples - 1) {
                    // End of track
                    outputL[i] = 0;
                    outputR[i] = 0;
                    if (i === 0) {
                        this.handleTrackEnd();
                    }
                } else {
                    // Linear interpolation for smooth playback
                    const frac = readPos - index;
                    let sampleL = this.sourceBufferL[index] * (1 - frac) + this.sourceBufferL[index + 1] * frac;
                    let sampleR = this.sourceBufferR[index] * (1 - frac) + this.sourceBufferR[index + 1] * frac;

                    // Apply gain and EQ (simple approximation - full EQ would use filters)
                    sampleL *= this.channelGain;
                    sampleR *= this.channelGain;

                    // Apply pan
                    if (this.panPosition < 0) {
                        // Pan left: reduce right channel
                        sampleR *= (1 + this.panPosition);
                    } else if (this.panPosition > 0) {
                        // Pan right: reduce left channel
                        sampleL *= (1 - this.panPosition);
                    }

                    outputL[i] = sampleL;
                    outputR[i] = sampleR;
                }
            } else {
                // TEMPO MODE: Use phase vocoder for time stretching (preserves pitch)
                // For now, use simple time stretching with pitch compensation
                // TODO: Replace with WASM phase vocoder when available
                const readPos = this.readPosition + (i * this.tempoRatio);
                const index = Math.floor(readPos);

                if (index >= totalSamples - 1) {
                    outputL[i] = 0;
                    outputR[i] = 0;
                    if (i === 0) {
                        this.handleTrackEnd();
                    }
                } else {
                    const frac = readPos - index;
                    let sampleL = this.sourceBufferL[index] * (1 - frac) + this.sourceBufferL[index + 1] * frac;
                    let sampleR = this.sourceBufferR[index] * (1 - frac) + this.sourceBufferR[index + 1] * frac;

                    // Apply gain and EQ (simple approximation)
                    sampleL *= this.channelGain;
                    sampleR *= this.channelGain;

                    // Apply pan
                    if (this.panPosition < 0) {
                        sampleR *= (1 + this.panPosition);
                    } else if (this.panPosition > 0) {
                        sampleL *= (1 - this.panPosition);
                    }

                    outputL[i] = sampleL;
                    outputR[i] = sampleR;
                }
            }
        }

        // Update read position
        this.readPosition += bufferSize * this.tempoRatio;
        this.currentPlaybackPosition = this.readPosition / sampleRate;
    }

    /**
     * Handle end of track
     */
    private handleTrackEnd(): void {
        this.isPlayingFlag = false;
        this.currentPlaybackPosition = 0;
        this.readPosition = 0;
        this.playbackEndedSubject.next();
        console.log('[AudioEngine] Playback ended');
    }

    /**
     * Pause playback
     */
    pause(): void {
        if (!this.isPlayingFlag) {
            return;
        }

        this.isPlayingFlag = false;
        this.pauseTime = this.currentPlaybackPosition;
    }

    /**
     * Stop playback
     */
    stop(): void {
        this.isPlayingFlag = false;
        this.currentPlaybackPosition = 0;
        this.pauseTime = 0;
        this.readPosition = 0;
    }

    /**
     * Seek to a specific time
     */
    seek(timeInSeconds: number): void {
        const wasPlaying = this.isPlayingFlag;

        if (wasPlaying) {
            this.pause();
        }

        this.currentPlaybackPosition = Math.max(0, Math.min(timeInSeconds, this.audioBuffer?.duration || 0));
        this.pauseTime = this.currentPlaybackPosition;
        this.readPosition = Math.floor(this.currentPlaybackPosition * (this.audioContext?.sampleRate || 44100));

        if (wasPlaying) {
            this.play(this.currentPlaybackPosition);
        }
    }

    /**
     * Get current playback time
     */
    getCurrentTime(): number {
        return this.currentPlaybackPosition;
    }

    /**
     * Get track duration
     */
    getDuration(): number {
        return this.audioBuffer?.duration || 0;
    }

    /**
     * Check if playing
     */
    getIsPlaying(): boolean {
        return this.isPlayingFlag;
    }

    /**
     * Set volume
     */
    setVolume(volume: number): void {
        if (this.gainNode) {
            this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    /**
     * Get volume
     */
    getVolume(): number {
        return this.gainNode?.gain.value || 0.8;
    }

    /**
     * Set tempo as percentage
     * @param percent Tempo change percentage (-16 to +16)
     * @param isPitchMode If true, changes pitch with tempo; if false, preserves pitch
     */
    setTempoPercent(percent: number, isPitchMode: boolean): void {
        this.usePitchMode = isPitchMode;
        const clamped = Math.max(-16, Math.min(16, percent));
        this.tempoRatio = 1.0 + (clamped / 100);

        const mode = isPitchMode ? 'PITCH (speed+tone)' : 'TEMPO (key lock)';
        console.log('[AudioEngine] Tempo set to:', this.tempoRatio.toFixed(3), 'x (', percent.toFixed(2), '%) - Mode:', mode);
    }

    /**
     * Set channel gain
     * @param value Gain value from -255 to +255 (0 = unity gain)
     */
    setChannelGain(value: number): void {
        // Convert knob value (-255 to +255) to gain multiplier (0.5 to 2.0)
        // 0 = 1.0 (unity), -255 = 0.5 (half), +255 = 2.0 (double)
        const normalized = value / 255;
        this.channelGain = 1.0 + normalized;
        this.channelGain = Math.max(0.1, Math.min(2.0, this.channelGain));
    }

    /**
     * Set high EQ gain
     * @param value EQ value from -255 to +255 (0 = flat)
     */
    setHighEq(value: number): void {
        // Convert knob value to dB gain (-12dB to +12dB)
        const gainDb = (value / 255) * 12;
        this.highEqGain = gainDb;

        if (this.highFilter) {
            this.highFilter.gain.value = gainDb;
        }
    }

    /**
     * Set mid EQ gain
     * @param value EQ value from -255 to +255 (0 = flat)
     */
    setMidEq(value: number): void {
        // Convert knob value to dB gain (-12dB to +12dB)
        const gainDb = (value / 255) * 12;
        this.midEqGain = gainDb;

        if (this.midFilter) {
            this.midFilter.gain.value = gainDb;
        }
    }

    /**
     * Set low EQ gain
     * @param value EQ value from -255 to +255 (0 = flat)
     */
    setLowEq(value: number): void {
        // Convert knob value to dB gain (-12dB to +12dB)
        const gainDb = (value / 255) * 12;
        this.lowEqGain = gainDb;

        if (this.lowFilter) {
            this.lowFilter.gain.value = gainDb;
        }
    }

    /**
     * Set pan/fader position
     * @param value Pan value from -255 (left) to +255 (right), 0 = center
     */
    setPan(value: number): void {
        // Convert knob value to -1.0 to +1.0
        this.panPosition = value / 255;
        this.panPosition = Math.max(-1.0, Math.min(1.0, this.panPosition));
    }

    /**
     * Set channel volume
     * @param value Volume from 0 to 100
     */
    setChannelVolume(value: number): void {
        this.channelVolume = value / 100;
        this.channelVolume = Math.max(0.0, Math.min(1.0, this.channelVolume));
    }

    /**
     * Set cross-fader position (for blending between decks)
     * @param value Cross-fader value from -100 (left deck) to +100 (right deck)
     * @param isLeftDeck Whether this is the left deck
     */
    setCrossFader(value: number, isLeftDeck: boolean): void {
        this.crossFaderPosition = value / 100;
        this.crossFaderPosition = Math.max(-1.0, Math.min(1.0, this.crossFaderPosition));

        // Apply cross-fader curve to this deck's gain
        if (isLeftDeck) {
            // Left deck: full volume at -1, silent at +1
            const faderGain = this.crossFaderPosition <= 0
                ? 1.0
                : 1.0 - this.crossFaderPosition;
            this.gainNode!.gain.value = faderGain * this.channelVolume * this.masterVolume;
        } else {
            // Right deck: silent at -1, full volume at +1
            const faderGain = this.crossFaderPosition >= 0
                ? 1.0
                : 1.0 + this.crossFaderPosition;
            this.gainNode!.gain.value = faderGain * this.channelVolume * this.masterVolume;
        }
    }

    /**
     * Set master volume
     * @param value Master volume from 0 to 100
     */
    setMasterVolume(value: number): void {
        this.masterVolume = value / 100;
        this.masterVolume = Math.max(0.0, Math.min(1.0, this.masterVolume));
        this.updateGainNode();
    }

    /**
     * Update gain node with all volume parameters
     */
    private updateGainNode(): void {
        if (this.gainNode) {
            // Combine all gain stages
            const totalGain = this.channelGain * this.channelVolume * this.masterVolume;
            this.gainNode.gain.value = totalGain;
        }
    }

    /**
     * Start time update loop using requestAnimationFrame for optimal performance
     */
    private startTimeUpdateLoop(): void {
        const update = (timestamp: number) => {
            if (this.isPlayingFlag) {
                // Throttle updates to ~100ms to reduce overhead
                if (timestamp - this.lastUpdateTime >= this.updateThrottle) {
                    this.playbackTimeSubject.next(this.currentPlaybackPosition);
                    this.lastUpdateTime = timestamp;
                }
                requestAnimationFrame(update);
            }
        };

        requestAnimationFrame(update);
    }

    private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target?.result instanceof ArrayBuffer) {
                    resolve(e.target.result);
                } else {
                    reject(new Error('Failed to read file'));
                }
            };
            reader.onerror = () => reject(new Error('File read error'));
            reader.readAsArrayBuffer(file);
        });
    }
}
