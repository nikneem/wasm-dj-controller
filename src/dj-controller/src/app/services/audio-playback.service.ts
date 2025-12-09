import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Audio playback service for controlling deck audio
 * Manages AudioContext, audio buffers, and playback state
 * NOTE: Not provided at root - each DeckComponent gets its own instance
 */
@Injectable()
export class AudioPlaybackService {
    private audioContext: AudioContext | null = null;
    private audioBuffer: AudioBuffer | null = null;
    private sourceNode: AudioBufferSourceNode | null = null;
    private gainNode: GainNode | null = null;
    private startTime: number = 0;
    private pauseTime: number = 0;
    private isPlayingFlag: boolean = false;
    private currentPlaybackPosition: number = 0; // Track position explicitly
    private playbackRate: number = 1.0; // Tempo/playback rate (1.0 = normal speed)

    // Observable for playback time updates
    private playbackTimeSubject = new Subject<number>();
    public playbackTime$ = this.playbackTimeSubject.asObservable();

    // Observable for playback ended
    private playbackEndedSubject = new Subject<void>();
    public playbackEnded$ = this.playbackEndedSubject.asObservable();

    constructor() {
        this.initializeAudioContext();
        this.startTimeUpdateLoop();
    }

    private initializeAudioContext(): void {
        if (typeof window !== 'undefined' && window.AudioContext) {
            this.audioContext = new window.AudioContext();
        }
    }

    /**
     * Load an audio file for playback
     * @param file - The audio file to load
     * @returns Promise resolving to the audio buffer
     */
    async loadTrack(file: File): Promise<AudioBuffer | null> {
        try {
            if (!this.audioContext) {
                return null;
            }

            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            // Reset playback state for new track
            this.currentPlaybackPosition = 0;
            this.pauseTime = 0;
            this.isPlayingFlag = false;
            if (this.sourceNode) {
                try {
                    this.sourceNode.stop();
                } catch (e) {
                    // Source may already be stopped
                }
            }
            this.sourceNode = null;

            // Initialize gain node
            if (!this.gainNode) {
                this.gainNode = this.audioContext.createGain();
                this.gainNode.connect(this.audioContext.destination);
                this.gainNode.gain.value = 0.8; // Default volume
            }

            console.log('[AudioPlayback] Track loaded successfully - duration:', this.audioBuffer.duration);

            return this.audioBuffer;
        } catch (error) {
            console.error('Error loading audio track:', error);
            return null;
        }
    }

    /**
     * Start playing the loaded track
     * @param fromTime - Optional time in seconds to start from (default: current pause time or 0)
     */
    play(fromTime?: number): void {
        if (!this.audioContext || !this.audioBuffer || !this.gainNode) {
            console.warn('Audio not ready for playback');
            return;
        }

        // Stop existing source if playing
        if (this.isPlayingFlag && this.sourceNode) {
            try {
                this.sourceNode.stop();
            } catch (e) {
                // Source may already be stopped
            }
        }

        // Determine start position
        let startPosition: number;
        if (fromTime !== undefined) {
            startPosition = fromTime;
            console.log('[AudioPlayback] play() called with explicit fromTime:', fromTime);
        } else {
            // Resume from stored position
            // Use currentPlaybackPosition, or fallback to pauseTime if current is 0
            startPosition = this.currentPlaybackPosition || this.pauseTime;
            console.log('[AudioPlayback] play() called without params, currentPlaybackPosition is:', this.currentPlaybackPosition, ', pauseTime is:', this.pauseTime, ', using startPosition:', startPosition);
        }

        console.log('[AudioPlayback] play() BEGINNING - startPosition:', startPosition, 'currentPlaybackPosition:', this.currentPlaybackPosition, 'pauseTime:', this.pauseTime, 'playbackRate:', this.playbackRate);

        // Create new source node
        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.connect(this.gainNode);

        // Apply playback rate (tempo)
        this.sourceNode.playbackRate.value = this.playbackRate;

        // Calculate startTime for accurate position tracking
        // We need: getCurrentTime() = (audioContext.currentTime - startTime) * playbackRate = startPosition
        // So: startTime = audioContext.currentTime - (startPosition / playbackRate)
        this.startTime = this.audioContext.currentTime - (startPosition / this.playbackRate);
        this.isPlayingFlag = true;

        // Start playback from the calculated position
        this.sourceNode.start(0, startPosition);
        console.log('[AudioPlayback] Playback started from:', startPosition, 'seconds, startTime calc:', this.startTime, 'audioContext.currentTime:', this.audioContext.currentTime, 'playbackRate:', this.playbackRate);

        // Handle end of track
        this.sourceNode.onended = () => {
            // Only reset if we're not in the middle of a pause/play cycle
            if (this.isPlayingFlag) {
                this.isPlayingFlag = false;
                this.currentPlaybackPosition = 0;
                this.playbackEndedSubject.next();
            }
        };
    }

    /**
     * Pause the current playback
     */
    pause(): void {
        if (!this.isPlayingFlag || !this.sourceNode) {
            console.log('[AudioPlayback] pause() called but not playing or no sourceNode');
            return;
        }

        // Calculate and store the exact pause position
        // During playback: currentTime = (audioContext.currentTime - startTime) * playbackRate
        const elapsedTime = this.audioContext!.currentTime - this.startTime;
        const audioPosition = elapsedTime * this.playbackRate;
        const newPosition = Math.max(0, Math.min(audioPosition, this.audioBuffer!.duration));

        console.log('[AudioPlayback] pause() BEFORE - currentPlaybackPosition:', this.currentPlaybackPosition);

        this.currentPlaybackPosition = newPosition;
        this.pauseTime = this.currentPlaybackPosition; // Keep pauseTime in sync

        console.log('[AudioPlayback] pause() AFTER - currentPlaybackPosition set to:', this.currentPlaybackPosition, 'pauseTime:', this.pauseTime, 'elapsedTime was:', elapsedTime, 'audioPosition was:', audioPosition, 'playbackRate:', this.playbackRate, 'startTime:', this.startTime, 'audioContext.currentTime:', this.audioContext!.currentTime);

        // Stop source
        try {
            this.sourceNode.stop();
        } catch (e) {
            // Source may already be stopped
        }

        this.isPlayingFlag = false;

        // Emit the paused time to update UI
        this.playbackTimeSubject.next(this.currentPlaybackPosition);

        console.log('[AudioPlayback] pause() FINAL - currentPlaybackPosition:', this.currentPlaybackPosition);
    }

    /**
     * Stop playback and reset position
     */
    stop(): void {
        if (this.sourceNode && this.isPlayingFlag) {
            try {
                this.sourceNode.stop();
            } catch (e) {
                // Source may already be stopped
            }
        }

        this.currentPlaybackPosition = 0;
        this.pauseTime = 0;
        this.isPlayingFlag = false;
    }

    /**
     * Seek to a specific time in the track
     * @param timeInSeconds - Time to seek to
     */
    seek(timeInSeconds: number): void {
        const wasPlaying = this.isPlayingFlag;

        if (wasPlaying) {
            this.pause();
        }

        this.currentPlaybackPosition = Math.max(0, Math.min(timeInSeconds, this.audioBuffer?.duration || 0));
        this.pauseTime = this.currentPlaybackPosition;

        if (wasPlaying) {
            this.play(this.currentPlaybackPosition);
        }
    }

    /**
     * Get current playback position in seconds
     */
    getCurrentTime(): number {
        if (!this.isPlayingFlag) {
            // When not playing, return the stored position
            return this.currentPlaybackPosition;
        }

        if (!this.audioContext) {
            return 0;
        }

        // When playing, calculate position dynamically
        // Position in audio = (audioContext.currentTime - startTime) * playbackRate
        const elapsedTime = this.audioContext.currentTime - this.startTime;
        const calculatedTime = elapsedTime * this.playbackRate;
        const clampedTime = Math.max(0, Math.min(calculatedTime, this.audioBuffer?.duration || 0));
        return clampedTime;
    }

    /**
     * Get duration of loaded track
     */
    getDuration(): number {
        return this.audioBuffer?.duration || 0;
    }

    /**
     * Check if audio is currently playing
     */
    getIsPlaying(): boolean {
        return this.isPlayingFlag;
    }

    /**
     * Set playback volume (0.0 to 1.0)
     */
    setVolume(volume: number): void {
        if (this.gainNode) {
            this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    /**
     * Get current volume
     */
    getVolume(): number {
        return this.gainNode?.gain.value || 0.8;
    }

    /**
     * Set playback rate/tempo
     * @param rate - Playback rate (0.5 = half speed, 1.0 = normal, 2.0 = double speed)
     */
    setPlaybackRate(rate: number): void {
        // Clamp rate between 0.5 and 2.0 (typical DJ controller range)
        this.playbackRate = Math.max(0.5, Math.min(2.0, rate));

        // Apply to currently playing source
        if (this.sourceNode && this.isPlayingFlag) {
            this.sourceNode.playbackRate.value = this.playbackRate;
        }

        console.log('[AudioPlayback] Playback rate set to:', this.playbackRate);
    }

    /**
     * Get current playback rate
     */
    getPlaybackRate(): number {
        return this.playbackRate;
    }

    /**
     * Convert tempo percentage to playback rate
     * Tempo range: -8 to +8 (in percentage)
     * Conversion: playbackRate = 1.0 + (tempoPercent / 100)
     * @param tempoPercent - Tempo percentage (-8 to +8)
     */
    setTempoPercent(tempoPercent: number): void {
        // Clamp to -8 to +8 range
        const clamped = Math.max(-8, Math.min(8, tempoPercent));
        const playbackRate = 1.0 + (clamped / 100);
        this.setPlaybackRate(playbackRate);
    }

    /**
     * Get tempo as percentage
     */
    getTempoPercent(): number {
        return (this.playbackRate - 1.0) * 100;
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

    /**
     * Start a loop to update playback time
     */
    private startTimeUpdateLoop(): void {
        const updateInterval = setInterval(() => {
            if (this.isPlayingFlag) {
                const currentTime = this.getCurrentTime();
                this.playbackTimeSubject.next(currentTime);
            }
        }, 100); // Update every 100ms
    }
}
