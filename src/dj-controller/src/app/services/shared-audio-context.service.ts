import { Injectable } from '@angular/core';

/**
 * Shared Audio Context Service
 * 
 * Provides a single AudioContext instance shared across all decks.
 * This prevents resource waste and improves performance by:
 * - Reducing memory usage (only one audio graph)
 * - Eliminating context switching overhead
 * - Allowing proper cross-fading between decks
 * - Preventing audio glitches when multiple decks play
 * 
 * Audio Graph:
 * Deck 1 → Volume → EQ → Crossfader → Master → Output
 * Deck 2 → Volume → EQ → Crossfader → Master → Output
 */
@Injectable({
    providedIn: 'root' // Singleton service
})
export class SharedAudioContextService {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private workletLoaded: boolean = false;
    private workletLoadPromise: Promise<void> | null = null;

    constructor() {
        this.initialize();
    }

    /**
     * Initialize the shared audio context
     */
    private async initialize(): Promise<void> {
        if (typeof window === 'undefined' || !window.AudioContext) {
            console.warn('[SharedAudioContext] AudioContext not available');
            return;
        }

        // Create audio context (lazy initialization)
        this.audioContext = new AudioContext();

        // Create master gain node
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.8;
        this.masterGain.connect(this.audioContext.destination);

        console.log('[SharedAudioContext] Initialized - Sample Rate:', this.audioContext.sampleRate);

        // Load AudioWorklet module
        await this.loadAudioWorklet();
    }

    /**
     * Load the AudioWorklet processor module
     */
    private async loadAudioWorklet(): Promise<void> {
        if (this.workletLoadPromise) {
            return this.workletLoadPromise;
        }

        if (!this.audioContext) {
            throw new Error('AudioContext not initialized');
        }

        this.workletLoadPromise = (async () => {
            try {
                // Load the worklet processor
                // Note: The path is relative to the app's base URL
                await this.audioContext!.audioWorklet.addModule(
                    '/assets/audio-worklet-processor.js'
                );
                this.workletLoaded = true;
                console.log('[SharedAudioContext] AudioWorklet loaded successfully');
            } catch (error) {
                console.error('[SharedAudioContext] Failed to load AudioWorklet:', error);
                this.workletLoaded = false;
                throw error;
            }
        })();

        return this.workletLoadPromise;
    }

    /**
     * Get the shared audio context
     */
    getContext(): AudioContext | null {
        return this.audioContext;
    }

    /**
     * Get the master gain node
     */
    getMasterGain(): GainNode | null {
        return this.masterGain;
    }

    /**
     * Check if AudioWorklet is loaded and ready
     */
    isWorkletReady(): boolean {
        return this.workletLoaded;
    }

    /**
     * Wait for AudioWorklet to be ready
     */
    async waitForWorklet(): Promise<void> {
        if (this.workletLoadPromise) {
            await this.workletLoadPromise;
        }
    }

    /**
     * Set master volume
     */
    setMasterVolume(volume: number): void {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    /**
     * Get master volume
     */
    getMasterVolume(): number {
        return this.masterGain?.gain.value || 0.8;
    }

    /**
     * Resume audio context if suspended (required by browser autoplay policies)
     */
    async resume(): Promise<void> {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
            console.log('[SharedAudioContext] Resumed from suspended state');
        }
    }

    /**
     * Get current sample rate
     */
    getSampleRate(): number {
        return this.audioContext?.sampleRate || 44100;
    }

    /**
     * Get current time
     */
    getCurrentTime(): number {
        return this.audioContext?.currentTime || 0;
    }
}
