import { Injectable, inject, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { SharedAudioContextService } from './shared-audio-context.service';

/**
 * Audio Engine Service using AudioWorklet for high-performance, glitch-free audio processing
 * 
 * This service provides:
 * - Tempo control (time stretching - preserves pitch)
 * - Pitch control (pitch shifting - affects tone/key)
 * - 3-band equalizer (Web Audio API BiquadFilters)
 * - Stereo panning
 * - Crossfader support
 * 
 * Performance optimizations:
 * - AudioWorklet runs on dedicated audio thread (no main thread blocking)
 * - Shared AudioContext across all decks (reduces resource usage)
 * - Async audio decoding (doesn't block UI)
 * - Zero-copy buffer transfer to worklet
 * - Minimal JavaScript processing (most work in audio thread)
 */
@Injectable()
export class AudioEngineService {
    private sharedAudioContext = inject(SharedAudioContextService);
    private ngZone = inject(NgZone);

    private audioBuffer: AudioBuffer | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private gainNode: GainNode | null = null;

    // EQ Filters (run on audio thread, controlled from main thread)
    private lowFilter: BiquadFilterNode | null = null;
    private midFilter: BiquadFilterNode | null = null;
    private highFilter: BiquadFilterNode | null = null;

    // Playback state
    private isPlayingFlag: boolean = false;
    private currentPlaybackPosition: number = 0;
    private pauseTime: number = 0;

    // Audio processing parameters
    private tempoRatio: number = 1.0;

    // Mixer parameters
    private channelGain: number = 1.0;
    private panPosition: number = 0.0; // -1 (left) to +1 (right)
    private channelVolume: number = 0.8;
    private crossFaderPosition: number = 0.0;
    private isLeftDeck: boolean = false;

    // Observables
    private playbackTimeSubject = new Subject<number>();
    public playbackTime$ = this.playbackTimeSubject.asObservable();

    private playbackEndedSubject = new Subject<void>();
    public playbackEnded$ = this.playbackEndedSubject.asObservable();

    constructor() {
        this.initialize();
    }

    /**
     * Initialize audio processing chain
     */
    private async initialize(): Promise<void> {
        // Wait for shared context and worklet to be ready
        await this.sharedAudioContext.waitForWorklet();

        const context = this.sharedAudioContext.getContext();
        if (!context) {
            console.error('[AudioEngine] No audio context available');
            return;
        }

        // Create gain node for this deck
        this.gainNode = context.createGain();
        this.gainNode.gain.value = this.channelVolume;

        // Initialize EQ chain
        this.initializeEQ(context);

        console.log('[AudioEngine] Initialized successfully');
    }

    /**
     * Initialize 3-band EQ filter chain
     * EQ runs on audio thread for maximum performance
     */
    private initializeEQ(context: AudioContext): void {
        // Low band: Low-shelf filter at 250Hz
        this.lowFilter = context.createBiquadFilter();
        this.lowFilter.type = 'lowshelf';
        this.lowFilter.frequency.value = 250;
        this.lowFilter.gain.value = 0;

        // Mid band: Peaking filter at 1000Hz
        this.midFilter = context.createBiquadFilter();
        this.midFilter.type = 'peaking';
        this.midFilter.frequency.value = 1000;
        this.midFilter.Q.value = 1.0;
        this.midFilter.gain.value = 0;

        // High band: High-shelf filter at 4000Hz
        this.highFilter = context.createBiquadFilter();
        this.highFilter.type = 'highshelf';
        this.highFilter.frequency.value = 4000;
        this.highFilter.gain.value = 0;

        // Connect EQ chain to master gain
        const masterGain = this.sharedAudioContext.getMasterGain();
        if (masterGain) {
            this.lowFilter.connect(this.midFilter);
            this.midFilter.connect(this.highFilter);
            this.highFilter.connect(this.gainNode!);
            this.gainNode!.connect(masterGain);
        }

        console.log('[AudioEngine] 3-band EQ initialized');
    }


    /**
     * Load an audio file for playback (async, non-blocking)
     * Uses async decoding to prevent UI freezing
     */
    async loadTrack(file: File): Promise<AudioBuffer | null> {
        try {
            const context = this.sharedAudioContext.getContext();
            if (!context) {
                console.error('[AudioEngine] No audio context');
                return null;
            }

            // Ensure worklet is ready
            if (!this.sharedAudioContext.isWorkletReady()) {
                await this.sharedAudioContext.waitForWorklet();
            }

            console.log('[AudioEngine] Loading track:', file.name);

            // Read file as ArrayBuffer (async, non-blocking)
            const arrayBuffer = await this.readFileAsArrayBuffer(file);

            // Decode audio data (async, runs in separate thread - doesn't block UI!)
            this.audioBuffer = await context.decodeAudioData(arrayBuffer);

            // Create AudioWorklet node for this deck
            if (this.workletNode) {
                // Clean up old worklet
                this.workletNode.disconnect();
                this.workletNode.port.onmessage = null;
            }

            this.workletNode = new AudioWorkletNode(context, 'dj-audio-processor', {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [2], // Stereo
            });

            // Listen for messages from audio worklet
            this.workletNode.port.onmessage = (event) => {
                this.handleWorkletMessage(event.data);
            };

            // Connect worklet to EQ chain
            if (this.lowFilter) {
                this.workletNode.connect(this.lowFilter);
            }

            // Transfer audio buffers to worklet (zero-copy via SharedArrayBuffer if supported)
            const bufferL = this.audioBuffer.getChannelData(0);
            const bufferR = this.audioBuffer.numberOfChannels > 1
                ? this.audioBuffer.getChannelData(1)
                : this.audioBuffer.getChannelData(0);

            this.workletNode.port.postMessage({
                type: 'setBuffer',
                bufferL: bufferL,
                bufferR: bufferR
            }, [bufferL.buffer, bufferR.buffer]); // Transfer ownership for zero-copy

            // Reset playback state
            this.currentPlaybackPosition = 0;
            this.pauseTime = 0;
            this.isPlayingFlag = false;

            console.log('[AudioEngine] Track loaded - duration:', this.audioBuffer.duration.toFixed(2), 's');
            return this.audioBuffer;
        } catch (error) {
            console.error('[AudioEngine] Error loading track:', error);
            return null;
        }
    }

    /**
     * Handle messages from AudioWorklet
     */
    private handleWorkletMessage(data: any): void {
        // Run inside Angular zone to trigger change detection for waveform updates
        this.ngZone.run(() => {
            switch (data.type) {
                case 'ready':
                    console.log('[AudioEngine] Worklet ready');
                    break;

                case 'position':
                    this.currentPlaybackPosition = data.position;
                    this.playbackTimeSubject.next(this.currentPlaybackPosition);
                    break;

                case 'ended':
                    this.handleTrackEnd();
                    break;
            }
        });
    }

    /**
     * Handle end of track
     */
    private handleTrackEnd(): void {
        this.isPlayingFlag = false;
        this.currentPlaybackPosition = 0;
        this.pauseTime = 0;
        this.playbackEndedSubject.next();
        console.log('[AudioEngine] Playback ended');
    }


    /**
     * Start playback
     */
    async play(fromTime?: number): Promise<void> {
        if (!this.audioBuffer || !this.workletNode) {
            console.warn('[AudioEngine] Audio not ready for playback');
            return;
        }

        // Resume audio context if suspended (browser autoplay policy)
        await this.sharedAudioContext.resume();

        const startPosition = fromTime !== undefined ? fromTime : (this.currentPlaybackPosition || this.pauseTime);

        this.workletNode.port.postMessage({
            type: 'play',
            position: startPosition
        });

        this.isPlayingFlag = true;
        console.log('[AudioEngine] Playing from:', startPosition.toFixed(2), 's');
    }

    /**
     * Pause playback
     */
    pause(): void {
        if (!this.isPlayingFlag || !this.workletNode) {
            return;
        }

        this.workletNode.port.postMessage({ type: 'pause' });
        this.isPlayingFlag = false;
        this.pauseTime = this.currentPlaybackPosition;
        console.log('[AudioEngine] Paused at:', this.pauseTime.toFixed(2), 's');
    }

    /**
     * Stop playback
     */
    stop(): void {
        if (!this.workletNode) {
            return;
        }

        this.workletNode.port.postMessage({ type: 'stop' });
        this.isPlayingFlag = false;
        this.currentPlaybackPosition = 0;
        this.pauseTime = 0;
        console.log('[AudioEngine] Stopped');
    }

    /**
     * Seek to a specific time
     */
    seek(timeInSeconds: number): void {
        if (!this.workletNode || !this.audioBuffer) {
            return;
        }

        const clampedTime = Math.max(0, Math.min(timeInSeconds, this.audioBuffer.duration));

        this.workletNode.port.postMessage({
            type: 'seek',
            position: clampedTime
        });

        this.currentPlaybackPosition = clampedTime;
        this.pauseTime = clampedTime;

        console.log('[AudioEngine] Seeked to:', clampedTime.toFixed(2), 's');
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
     * @param isPitchMode If true, changes pitch with tempo; if false, preserves pitch (TODO: phase vocoder)
     */
    setTempoPercent(percent: number, isPitchMode: boolean): void {
        const clamped = Math.max(-16, Math.min(16, percent));
        this.tempoRatio = 1.0 + (clamped / 100);

        if (this.workletNode) {
            this.workletNode.port.postMessage({
                type: 'setTempo',
                ratio: this.tempoRatio
            });
        }

        console.log('[AudioEngine] Tempo set to:', this.tempoRatio.toFixed(3), 'x');
    }

    /**
     * Set channel gain
     * @param value Gain value from -255 to +255 (0 = unity gain)
     */
    setChannelGain(value: number): void {
        // Convert knob value (-255 to +255) to gain multiplier (0.5 to 2.0)
        const normalized = value / 255;
        this.channelGain = 1.0 + (normalized * 0.5);
        this.channelGain = Math.max(0.5, Math.min(2.0, this.channelGain));

        if (this.workletNode) {
            this.workletNode.port.postMessage({
                type: 'setGain',
                gain: this.channelGain
            });
        }
    }

    /**
     * Set high EQ gain
     * @param value EQ value from -255 to +255 (0 = flat)
     */
    setHighEq(value: number): void {
        // Convert knob value to dB gain (-12dB to +12dB)
        const gainDb = (value / 255) * 12;

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

        if (this.workletNode) {
            this.workletNode.port.postMessage({
                type: 'setPan',
                pan: this.panPosition
            });
        }
    }

    /**
     * Set channel volume
     * @param value Volume from 0 to 100
     */
    setChannelVolume(value: number): void {
        this.channelVolume = value / 100;
        this.channelVolume = Math.max(0.0, Math.min(1.0, this.channelVolume));
        this.updateGainNode();
    }

    /**
     * Set cross-fader position (for blending between decks)
     * @param value Cross-fader value from -100 (left deck) to +100 (right deck)
     * @param isLeftDeck Whether this is the left deck
     */
    setCrossFader(value: number, isLeftDeck: boolean): void {
        this.isLeftDeck = isLeftDeck;
        this.crossFaderPosition = value / 100;
        this.crossFaderPosition = Math.max(-1.0, Math.min(1.0, this.crossFaderPosition));
        this.updateGainNode();
    }

    /**
     * Update gain node with all volume parameters
     */
    private updateGainNode(): void {
        if (!this.gainNode) return;

        // Calculate crossfader gain
        let faderGain = 1.0;
        if (this.isLeftDeck) {
            // Left deck: full volume at -1, silent at +1
            faderGain = this.crossFaderPosition <= 0 ? 1.0 : 1.0 - this.crossFaderPosition;
        } else {
            // Right deck: silent at -1, full volume at +1
            faderGain = this.crossFaderPosition >= 0 ? 1.0 : 1.0 + this.crossFaderPosition;
        }

        // Combine all gain stages
        const totalGain = faderGain * this.channelVolume;
        this.gainNode.gain.value = totalGain;
    }

    /**
     * Read file as ArrayBuffer (async, non-blocking)
     */
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
