import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SliderModule } from 'primeng/slider';

@Component({
    selector: 'app-deck',
    standalone: true,
    imports: [CommonModule, ButtonModule, SliderModule, FormsModule],
    templateUrl: './deck.component.html',
    styleUrls: ['./deck.component.scss']
})
export class DeckComponent {
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
    isCued: boolean = false;
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

    constructor() { }

    onPlayPause(): void {
        this.isPlaying = !this.isPlaying;
    }

    onCue(): void {
        if (this.isPlaying) {
            this.isPlaying = false;
            this.isCued = true;
            // Return to cue point
        } else {
            this.isCued = !this.isCued;
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
        console.log('Load track for deck', this.deckNumber);
    }
}
