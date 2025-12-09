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

            // Initialize gain node
            if (!this.gainNode) {
                this.gainNode = this.audioContext.createGain();
                this.gainNode.connect(this.audioContext.destination);
                this.gainNode.gain.value = 0.8; // Default volume
            }

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

        // Determine start position - use fromTime if provided, otherwise resume from pauseTime
        const startPosition = fromTime !== undefined ? fromTime : this.pauseTime;

        // Create new source node
        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.connect(this.gainNode);

        // Calculate startTime so that getCurrentTime() returns the correct position
        this.startTime = this.audioContext.currentTime - startPosition;
        this.isPlayingFlag = true;

        // Start playback from the calculated position
        this.sourceNode.start(0, startPosition);

        // Handle end of track
        this.sourceNode.onended = () => {
            this.isPlayingFlag = false;
            this.pauseTime = 0;
            this.playbackEndedSubject.next();
        };
    }

    /**
     * Pause the current playback
     */
    pause(): void {
        if (!this.isPlayingFlag || !this.sourceNode) {
            return;
        }

        // Calculate and store the exact pause position
        const currentTime = this.audioContext!.currentTime - this.startTime;
        this.pauseTime = Math.max(0, Math.min(currentTime, this.audioBuffer!.duration));

        // Stop source
        try {
            this.sourceNode.stop();
        } catch (e) {
            // Source may already be stopped
        }

        this.isPlayingFlag = false;

        // Emit the paused time to update UI
        this.playbackTimeSubject.next(this.pauseTime);
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

        this.pauseTime = Math.max(0, Math.min(timeInSeconds, this.audioBuffer?.duration || 0));

        if (wasPlaying) {
            this.play(this.pauseTime);
        }
    }

    /**
     * Get current playback position in seconds
     */
    getCurrentTime(): number {
        if (!this.isPlayingFlag) {
            return this.pauseTime;
        }

        if (!this.audioContext) {
            return 0;
        }

        const currentTime = this.audioContext.currentTime - this.startTime;
        return Math.max(0, Math.min(currentTime, this.audioBuffer?.duration || 0));
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
