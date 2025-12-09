import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SliderModule } from 'primeng/slider';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { AudioAnalysisService } from '../../services/audio-analysis.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { BeatGridComponent } from '../beat-grid/beat-grid.component';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-deck',
    standalone: true,
    imports: [CommonModule, ButtonModule, SliderModule, FormsModule, ToggleSwitchModule, BeatGridComponent],
    templateUrl: './deck.component.html',
    styleUrls: ['./deck.component.scss'],
    providers: [AudioEngineService] // Provide a separate instance for each deck
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
    tempoValue: number = 0; // Dynamic range based on tempoRange
    tempoPercent: string = '0.00%';
    isPitchMode: boolean = false; // Toggle between tempo (key lock) and pitch (speed change) modes
    isExtendedRange: boolean = false; // Toggle between ±8% and ±16% range
    tempoRange: number = 8; // Current tempo range (8 or 16)

    // Jog wheel
    jogRotation: number = 0;
    isJogTouched: boolean = false;
    private lastJogY: number = 0;
    private jogVelocity: number = 0;
    private pitchBendTimeout: number | null = null;
    private readonly JOG_SENSITIVITY = 0.5; // Pixels to degrees ratio
    private readonly PITCH_BEND_STRENGTH = 30; // Max pitch bend percentage

    // Beat grid data
    beatGrid: number[] = [];
    trackDuration: number = 0;
    currentPlaybackPosition: number = 0;
    waveformData: number[] = [];
    showWaveform: boolean = true; // Toggle between waveform+beats and beats-only

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
        private audioEngineService: AudioEngineService
    ) { }

    ngOnInit(): void {
        // Subscribe to playback time updates
        this.playbackTimeSubscription = this.audioEngineService.playbackTime$.subscribe(
            (time: number) => {
                this.currentTime = this.formatTime(time);
                this.currentPlaybackPosition = time;
            }
        );

        // Subscribe to playback ended event
        this.playbackEndedSubscription = this.audioEngineService.playbackEnded$.subscribe(
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
            this.audioEngineService.pause();
            this.isPlaying = false;
            this.isPaused = true;
        } else if (this.isPaused) {
            // If paused (after play), resume playing
            console.log('[Deck] Resuming from pause');
            this.audioEngineService.play();
            this.isPaused = false;
            this.isPlaying = true;
        } else {
            // If stopped, start playing
            console.log('[Deck] Starting playback from beginning');
            this.audioEngineService.play();
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
            this.audioEngineService.seek(seekTime);
            this.audioEngineService.pause();
            this.isPlaying = false;
            this.isPaused = false;
            this.isCued = true;
        } else {
            // If paused or stopped, remember current position as cue point
            this.cuePoint = this.audioEngineService.getCurrentTime();
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

        // Apply tempo to audio engine with mode
        // TEMPO mode (isPitchMode = false): Preserve pitch using phase vocoder
        // PITCH mode (isPitchMode = true): Natural pitch change with speed
        this.audioEngineService.setTempoPercent(value, this.isPitchMode);

        // Update BPM based on tempo (with decimal precision)
        if (this.originalBPM > 0) {
            const tempoMultiplier = 1.0 + (value / 100);
            this.bpm = this.originalBPM * tempoMultiplier;
        }

        const mode = this.isPitchMode ? 'PITCH (speed+tone)' : 'TEMPO (key lock)';
        console.log('[Deck] Tempo changed to:', value, '% - Mode:', mode, '- Range: ±' + this.tempoRange + '% - BPM now:', this.bpm);
    }

    onRangeToggle(): void {
        // Switch between ±8% and ±16% range
        this.tempoRange = this.isExtendedRange ? 16 : 8;

        // Clamp current tempo value to new range if it exceeds it
        if (Math.abs(this.tempoValue) > this.tempoRange) {
            this.tempoValue = Math.sign(this.tempoValue) * this.tempoRange;
            this.onTempoChange(this.tempoValue);
        }

        console.log('[Deck] Tempo range changed to: ±' + this.tempoRange + '%');
    }

    onJogMouseDown(event: MouseEvent): void {
        this.isJogTouched = true;
        this.lastJogY = event.clientY;
        this.jogVelocity = 0;
    }

    onJogMouseUp(): void {
        this.isJogTouched = false;

        // If playing, reset pitch bend after jog is released
        if (this.isPlaying && this.pitchBendTimeout) {
            clearTimeout(this.pitchBendTimeout);
        }

        // Return to normal tempo when jog is released while playing
        if (this.isPlaying) {
            this.pitchBendTimeout = window.setTimeout(() => {
                this.onTempoChange(this.tempoValue);
            }, 200);
        }
    }

    onJogRotate(event: MouseEvent): void {
        if (!this.isJogTouched || !this.loadedFileName) {
            return;
        }

        // Calculate rotation based on cumulative vertical mouse movement
        // Upward movement = positive rotation (clockwise)
        // Downward movement = negative rotation (counter-clockwise)
        const deltaY = event.clientY - this.lastJogY;
        const rotationDelta = -deltaY * this.JOG_SENSITIVITY; // Negative because Y increases downward

        this.jogRotation += rotationDelta;

        // Normalize rotation to 0-360 range for visual feedback
        this.jogRotation = ((this.jogRotation % 360) + 360) % 360;

        // Update last position for next iteration
        this.lastJogY = event.clientY;

        if (this.isPlaying) {
            // Pitch bend mode: brief tempo change based on rotation delta
            this.handlePitchBend(rotationDelta);
        } else if (this.isPaused || !this.isPlaying) {
            // Seek mode: move through track based on rotation delta
            this.handleSeek(rotationDelta);
        }
    }

    private handleSeek(rotationDelta: number): void {
        // Convert rotation delta to seek amount in seconds
        // Full rotation (360°) = 5 seconds
        const seekAmount = (rotationDelta / 360) * 5;
        const currentTime = this.audioEngineService.getCurrentTime();
        const newTime = Math.max(0, Math.min(this.trackDuration, currentTime + seekAmount));

        this.audioEngineService.seek(newTime);

        // Update playback position for beat grid sync
        this.currentPlaybackPosition = newTime;
    }

    private handlePitchBend(rotation: number): void {
        // Rotation converts to temporary pitch bend
        // Full rotation (360°) = ±30% pitch change
        const pitchBend = (rotation / 360) * this.PITCH_BEND_STRENGTH;
        const totalTempo = this.tempoValue + pitchBend;

        // Clamp tempo to reasonable range
        const clampedTempo = Math.max(-50, Math.min(50, totalTempo));

        // Apply pitch bend without saving to tempoValue
        this.audioEngineService.setTempoPercent(clampedTempo, this.isPitchMode);

        // Update BPM display to show bent tempo
        if (this.originalBPM > 0) {
            const tempoMultiplier = 1.0 + (clampedTempo / 100);
            this.bpm = this.originalBPM * tempoMultiplier;
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
            // Load track for audio engine first
            await this.audioEngineService.loadTrack(file);

            // Reset playback state
            this.isPlaying = false;
            this.isPaused = false;

            // Reset cue point
            this.cuePoint = 0;
            this.isCued = false;

            // Reset tempo to 0%
            this.tempoValue = 0;
            this.tempoPercent = '0.00%';
            this.audioEngineService.setTempoPercent(0, this.isPitchMode);

            // Set duration from loaded track
            const trackDuration = this.audioEngineService.getDuration();
            this.duration = this.formatTime(trackDuration);

            // Analyze BPM, Key, Waveform, and Beat Grid in parallel
            const [detectedBPM, detectedKey, waveform, beatGridData] = await Promise.all([
                this.audioAnalysisService.analyzeBPM(file),
                this.audioAnalysisService.analyzeKey(file),
                this.audioAnalysisService.extractWaveform(file),
                this.audioAnalysisService.extractBeatGrid(file)
            ]);

            // Update UI with detected values
            this.originalBPM = detectedBPM; // Store original BPM
            this.bpm = detectedBPM; // Display original BPM initially
            this.key = detectedKey;
            this.waveformData = waveform;
            this.beatGrid = beatGridData;
            this.trackDuration = trackDuration;

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
