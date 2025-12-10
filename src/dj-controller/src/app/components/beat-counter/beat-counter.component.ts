import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-beat-counter',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './beat-counter.component.html',
    styleUrls: ['./beat-counter.component.scss']
})
export class BeatCounterComponent implements OnDestroy {
    bpm: number | null = null;
    clickCount: number = 0;
    private timestamps: number[] = [];
    private resetTimeout: number | null = null;
    private readonly RESET_DELAY_MS = 2000;
    private readonly MIN_CLICKS_FOR_BPM = 4;

    ngOnDestroy(): void {
        this.clearResetTimeout();
    }

    onMouseDown(): void {
        const now = Date.now();
        
        // Clear previous timeout
        this.clearResetTimeout();

        // Add timestamp to our collection
        this.timestamps.push(now);
        this.clickCount++;

        // Calculate BPM after minimum clicks reached
        if (this.clickCount >= this.MIN_CLICKS_FOR_BPM) {
            this.calculateBPM();
        }

        // Set timeout to reset after inactivity
        this.resetTimeout = window.setTimeout(() => {
            this.reset();
        }, this.RESET_DELAY_MS);
    }

    private calculateBPM(): void {
        if (this.timestamps.length < 2) {
            return;
        }

        // Calculate intervals between all consecutive clicks
        const intervals: number[] = [];
        for (let i = 1; i < this.timestamps.length; i++) {
            intervals.push(this.timestamps[i] - this.timestamps[i - 1]);
        }

        // Calculate average interval in milliseconds
        const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;

        // Convert to BPM: 60,000 ms per minute / average interval in ms
        const calculatedBpm = 60000 / avgInterval;

        // Round to 1 decimal place
        this.bpm = Math.round(calculatedBpm * 10) / 10;
    }

    private reset(): void {
        this.bpm = null;
        this.clickCount = 0;
        this.timestamps = [];
        this.clearResetTimeout();
    }

    private clearResetTimeout(): void {
        if (this.resetTimeout !== null) {
            clearTimeout(this.resetTimeout);
            this.resetTimeout = null;
        }
    }
}
