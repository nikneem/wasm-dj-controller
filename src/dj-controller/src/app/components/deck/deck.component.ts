import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SliderModule } from 'primeng/slider';
import { AudioAnalysisService } from '../../services/audio-analysis.service';

@Component({
    selector: 'app-deck',
    standalone: true,
    imports: [CommonModule, ButtonModule, SliderModule, FormsModule],
    templateUrl: './deck.component.html',
    styleUrls: ['./deck.component.scss']
})
export class DeckComponent implements OnInit {
    @Input() deckSide: 'left' | 'right' = 'left';
    @Input() deckNumber: number = 1;

    // Track information
    trackTitle: string = 'No Track Loaded';
    artist: string = '';
    bpm: number = 0;
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

    constructor(private audioAnalysisService: AudioAnalysisService) { }

    ngOnInit(): void {
        // Initialize component
    }

    onPlayPause(): void {
        if (this.isPlaying) {
            // If playing, pause and start flashing
            this.isPlaying = false;
            this.isPaused = true;
        } else if (this.isPaused) {
            // If paused (after play), resume playing
            this.isPaused = false;
            this.isPlaying = true;
        } else {
            // If stopped, start playing
            this.isPlaying = true;
        }
    }

    onCue(): void {
        if (this.isPlaying) {
            // If track is playing, jump to cue point and stop
            this.isPlaying = false;
            this.isPaused = false;
            this.isCued = true;
            // In real implementation, would seek to this.cuePoint
        } else {
            // If paused or stopped, remember current position as cue point
            this.cuePoint = this.parseTimeToSeconds(this.currentTime);
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
            // Analyze BPM and Key in parallel
            const [detectedBPM, detectedKey] = await Promise.all([
                this.audioAnalysisService.analyzeBPM(file),
                this.audioAnalysisService.analyzeKey(file)
            ]);

            // Update UI with detected values
            this.bpm = detectedBPM;
            this.key = detectedKey;

            console.log(`Track Analysis - BPM: ${detectedBPM}, Key: ${detectedKey}`);
        } catch (error) {
            console.error('Error analyzing audio file:', error);
            this.dragError = 'Failed to analyze audio file';
        } finally {
            this.isAnalyzing = false;
        }
    } private parseTimeToSeconds(timeStr: string): number {
        const parts = timeStr.split(':');
        const minutes = parseInt(parts[0], 10) || 0;
        const seconds = parseInt(parts[1], 10) || 0;
        return minutes * 60 + seconds;
    }
}
