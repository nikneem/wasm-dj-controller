import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Audio playback service for controlling deck audio
 * Manages AudioContext, audio buffers, and playback state
 */
@Injectable({
    providedIn: 'root'
})
export class AudioPlaybackService {
    private audioContext: AudioContext | null = null;
    private audioBuffer: AudioBuffer | null = null;
    private sourceNode: AudioBufferSourceNode | null = null;
    private gainNode: GainNode | null = null;
    private startTime: number = 0;
    private pauseTime: number = 0;
    private isPlayingFlag: boolean = false;
    private currentPlaybackPosition: number = 0; // Track position explicitly

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
        } else {
            // Resume from stored position
            startPosition = this.currentPlaybackPosition;
        }

        console.log('[AudioPlayback] play() - startPosition:', startPosition, 'currentPlaybackPosition:', this.currentPlaybackPosition, 'pauseTime:', this.pauseTime);

        // Create new source node
        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.connect(this.gainNode);

        // Calculate startTime for accurate position tracking
        this.startTime = this.audioContext.currentTime - startPosition;
        this.isPlayingFlag = true;

        // Start playback from the calculated position
        this.sourceNode.start(0, startPosition);
        console.log('[AudioPlayback] Playback started from:', startPosition, 'seconds, audioContext.currentTime:', this.audioContext.currentTime);

        // Handle end of track
        this.sourceNode.onended = () => {
            this.isPlayingFlag = false;
            this.currentPlaybackPosition = 0;
            this.playbackEndedSubject.next();
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
        const currentTime = this.audioContext!.currentTime - this.startTime;
        this.currentPlaybackPosition = Math.max(0, Math.min(currentTime, this.audioBuffer!.duration));
        this.pauseTime = this.currentPlaybackPosition; // Keep pauseTime in sync

        console.log('[AudioPlayback] pause() - currentPlaybackPosition set to:', this.currentPlaybackPosition, 'calculated currentTime was:', currentTime);

        // Stop source
        try {
            this.sourceNode.stop();
        } catch (e) {
            // Source may already be stopped
        }

        this.isPlayingFlag = false;

        // Emit the paused time to update UI
        this.playbackTimeSubject.next(this.currentPlaybackPosition);
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
        const calculatedTime = this.audioContext.currentTime - this.startTime;
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
