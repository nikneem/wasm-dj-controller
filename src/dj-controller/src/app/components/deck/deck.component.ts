import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SliderModule } from 'primeng/slider';
import { AudioAnalysisService } from '../../services/audio-analysis.service';
import { AudioPlaybackService } from '../../services/audio-playback.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-deck',
    standalone: true,
    imports: [CommonModule, ButtonModule, SliderModule, FormsModule],
    templateUrl: './deck.component.html',
    styleUrls: ['./deck.component.scss']
})
export class DeckComponent implements OnInit, OnDestroy {
    @Input() deckSide: 'left' | 'right' = 'left';
    @Input() deckNumber: number = 1;

    // Track information
    trackTitle: string = 'No Track Loaded';
    artist: string = '';
    bpm: number = 0;
    originalBPM: number = 0; // Store original BPM for tempo calculations
    key: string = '';
    duration: string = '00:00';
    currentTime: string = '00:00';

    // Control states
    isPlaying: boolean = false;
    isPaused: boolean = false; // Track paused state separately
    isCued: boolean = false;
    cuePoint: number = 0; // Store cue point in seconds
    isLooping: boolean = false;
    loopStart: number | null = null;
    loopEnd: number | null = null;

    // Tempo control
    tempoValue: number = 0; // -8 to +8 range
    tempoPercent: string = '0.00%';

    // Jog wheel
    jogRotation: number = 0;
    isJogTouched: boolean = false;

    // Waveform data (mock)
    waveformBars: number[] = Array.from({ length: 80 }, () => Math.random() * 100);

    // File loading
    isDragOver: boolean = false;
    dragError: string = '';
    loadedFileName: string = '';
    isAnalyzing: boolean = false;

    // Subscriptions
    private playbackTimeSubscription: Subscription | null = null;
    private playbackEndedSubscription: Subscription | null = null;

    constructor(
        private audioAnalysisService: AudioAnalysisService,
        private audioPlaybackService: AudioPlaybackService
    ) { }

    ngOnInit(): void {
        // Subscribe to playback time updates
        this.playbackTimeSubscription = this.audioPlaybackService.playbackTime$.subscribe(
            (time: number) => {
                this.currentTime = this.formatTime(time);
            }
        );

        // Subscribe to playback ended event
        this.playbackEndedSubscription = this.audioPlaybackService.playbackEnded$.subscribe(
            () => {
                this.isPlaying = false;
                this.isPaused = false;
            }
        );
    }

    ngOnDestroy(): void {
        // Unsubscribe from observables
        this.playbackTimeSubscription?.unsubscribe();
        this.playbackEndedSubscription?.unsubscribe();
    }

    onPlayPause(): void {
        if (!this.loadedFileName) {
            this.dragError = 'No track loaded';
            return;
        }

        console.log('[Deck] onPlayPause() - isPlaying:', this.isPlaying, 'isPaused:', this.isPaused);

        if (this.isPlaying) {
            // If playing, pause and start flashing
            console.log('[Deck] Pausing playback');
            this.audioPlaybackService.pause();
            this.isPlaying = false;
            this.isPaused = true;
        } else if (this.isPaused) {
            // If paused (after play), resume playing
            console.log('[Deck] Resuming from pause');
            this.audioPlaybackService.play();
            this.isPaused = false;
            this.isPlaying = true;
        } else {
            // If stopped, start playing
            console.log('[Deck] Starting playback from beginning');
            this.audioPlaybackService.play();
            this.isPlaying = true;
        }
    }

    onCue(): void {
        if (!this.loadedFileName) {
            this.dragError = 'No track loaded';
            return;
        }

        if (this.isPlaying) {
            // If track is playing, jump to cue point and stop
            const seekTime = this.cuePoint || 0;
            this.audioPlaybackService.seek(seekTime);
            this.audioPlaybackService.pause();
            this.isPlaying = false;
            this.isPaused = false;
            this.isCued = true;
        } else {
            // If paused or stopped, remember current position as cue point
            this.cuePoint = this.audioPlaybackService.getCurrentTime();
            this.isCued = true;
        }
    }

    onSetLoopPoint(point: 'A' | 'B'): void {
        if (point === 'A') {
            this.loopStart = Date.now(); // Mock timestamp
        } else {
            this.loopEnd = Date.now();
        }
    }

    onToggleLoop(): void {
        if (this.loopStart !== null && this.loopEnd !== null) {
            this.isLooping = !this.isLooping;
        }
    }

    onExitLoop(): void {
        this.isLooping = false;
    }

    onTempoChange(value: number): void {
        this.tempoValue = value;
        this.tempoPercent = value > 0
            ? `+${value.toFixed(2)}%`
            : `${value.toFixed(2)}%`;

        // Apply tempo to audio service
        this.audioPlaybackService.setTempoPercent(value);

        // Update BPM based on tempo (with decimal precision)
        if (this.originalBPM > 0) {
            const tempoMultiplier = 1.0 + (value / 100);
            this.bpm = this.originalBPM * tempoMultiplier;
        }

        console.log('[Deck] Tempo changed to:', value, '% - BPM now:', this.bpm);
    }

    onJogMouseDown(): void {
        this.isJogTouched = true;
        if (this.isPlaying) {
            // Scratch mode
        }
    }

    onJogMouseUp(): void {
        this.isJogTouched = false;
    }

    onJogRotate(event: MouseEvent): void {
        if (this.isJogTouched) {
            // Handle jog rotation
            this.jogRotation += 5; // Mock rotation
        }
    }

    onLoadTrack(): void {
        // Trigger file input or show track browser
        if (this.isPlaying) {
            this.dragError = 'Cannot load track, deck is playing';
            return;
        }
        console.log('Load track for deck', this.deckNumber);
    }

    onDragOver(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        if (!this.isPlaying) {
            this.isDragOver = true;
        }
    }

    onDragLeave(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragOver = false;
    }

    onDrop(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragOver = false;
        this.dragError = '';

        // If playing, show error message
        if (this.isPlaying) {
            this.dragError = 'Cannot load track, deck is playing';
            return;
        }

        // Get dropped files
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) {
            this.dragError = 'No files dropped';
            return;
        }

        const file = files[0];

        // Check if it's an MP3 file
        if (!file.type.includes('audio') && !file.name.toLowerCase().endsWith('.mp3')) {
            this.dragError = 'Only MP3 files are supported';
            return;
        }

        // Load the track
        this.loadedFileName = file.name;
        this.dragError = '';
        this.trackTitle = file.name.replace('.mp3', '').replace(/\.[^.]*$/, '');

        // Analyze the file
        this.analyzeAudioFile(file);

        console.log('Track loaded:', file.name);
    }

    private async analyzeAudioFile(file: File): Promise<void> {
        this.isAnalyzing = true;

        try {
            // Load track for playback service first
            await this.audioPlaybackService.loadTrack(file);

            // Reset playback state
            this.isPlaying = false;
            this.isPaused = false;

            // Reset cue point
            this.cuePoint = 0;
            this.isCued = false;

            // Reset tempo to 0%
            this.tempoValue = 0;
            this.tempoPercent = '0.00%';
            this.audioPlaybackService.setTempoPercent(0);

            // Set duration from loaded track
            const trackDuration = this.audioPlaybackService.getDuration();
            this.duration = this.formatTime(trackDuration);

            // Analyze BPM and Key in parallel
            const [detectedBPM, detectedKey] = await Promise.all([
                this.audioAnalysisService.analyzeBPM(file),
                this.audioAnalysisService.analyzeKey(file)
            ]);

            // Update UI with detected values
            this.originalBPM = detectedBPM; // Store original BPM
            this.bpm = detectedBPM; // Display original BPM initially
            this.key = detectedKey;

            console.log(`Track Analysis - BPM: ${detectedBPM}, Key: ${detectedKey}, Duration: ${this.duration}`);
        } catch (error) {
            console.error('Error analyzing audio file:', error);
            this.dragError = 'Failed to analyze audio file';
        } finally {
            this.isAnalyzing = false;
        }
    }

    private formatTime(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
}
