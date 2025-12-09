import { Component, Input, OnChanges, SimpleChanges, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-beat-grid',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './beat-grid.component.html',
    styleUrls: ['./beat-grid.component.scss']
})
export class BeatGridComponent implements AfterViewInit, OnChanges {
    @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

    @Input() beatGrid: number[] = []; // Beat positions in seconds
    @Input() duration: number = 0; // Track duration in seconds
    @Input() playbackPosition: number = 0; // Current playback position in seconds
    @Input() waveformData: number[] = []; // Waveform amplitude data

    private canvas!: HTMLCanvasElement;
    private ctx!: CanvasRenderingContext2D;
    private animationFrameId: number | null = null;

    // Zoom level: seconds visible on screen (smaller = more zoom)
    private zoomLevel: number = 10; // Show 10 seconds by default
    private readonly MIN_ZOOM = 2; // Maximum zoom in (2 seconds visible)
    private readonly MAX_ZOOM = 30; // Maximum zoom out (30 seconds visible)

    ngAfterViewInit(): void {
        this.canvas = this.canvasRef.nativeElement;
        const context = this.canvas.getContext('2d');
        if (context) {
            this.ctx = context;
            this.resizeCanvas();
            this.setupMouseWheelZoom();
            this.drawBeatGrid();
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (!this.ctx) return;

        if (changes['beatGrid'] || changes['duration']) {
            this.drawBeatGrid();
        }

        if (changes['playbackPosition']) {
            this.updatePlayhead();
        }
    }

    private resizeCanvas(): void {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    private drawBeatGrid(): void {
        if (!this.ctx || !this.canvas) return;

        const width = this.canvas.width;
        const height = this.canvas.height;
        const centerX = width / 2;

        // Clear canvas
        this.ctx.clearRect(0, 0, width, height);

        // Draw background
        this.ctx.fillStyle = '#0a0a0a';
        this.ctx.fillRect(0, 0, width, height);

        if (this.duration === 0 || this.beatGrid.length === 0) {
            return;
        }

        // Calculate visible time window (centered on playback position)
        const startTime = this.playbackPosition - (this.zoomLevel / 2);
        const endTime = this.playbackPosition + (this.zoomLevel / 2);
        const pixelsPerSecond = width / this.zoomLevel;

        // Draw waveform if available
        if (this.waveformData && this.waveformData.length > 0) {
            this.drawWaveform(startTime, endTime, pixelsPerSecond, centerX, width, height);
        }

        // Draw beat lines within visible window
        this.beatGrid.forEach((beatTime, index) => {
            // Only draw beats within visible time window
            if (beatTime < startTime || beatTime > endTime) {
                return;
            }

            // Calculate position relative to playback position (center)
            const timeOffset = beatTime - this.playbackPosition;
            const x = centerX + (timeOffset * pixelsPerSecond);


            // Every 4th beat is a downbeat (stronger emphasis)
            const isDownbeat = index % 4 === 0;

            if (isDownbeat) {
                this.ctx.strokeStyle = '#00ff00';
                this.ctx.lineWidth = 3;
            } else {
                this.ctx.strokeStyle = '#666666';
                this.ctx.lineWidth = 1;
            }

            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        });

        // Draw center playhead line (always at center)
        this.ctx.strokeStyle = '#ff0000';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, 0);
        this.ctx.lineTo(centerX, height);
        this.ctx.stroke();

        // Draw playhead triangle at top
        this.ctx.fillStyle = '#ff0000';
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, 0);
        this.ctx.lineTo(centerX - 6, 10);
        this.ctx.lineTo(centerX + 6, 10);
        this.ctx.closePath();
        this.ctx.fill();

        // Draw time scale at bottom
        this.drawTimeScale(startTime, endTime, pixelsPerSecond);
    }

    private drawWaveform(startTime: number, endTime: number, pixelsPerSecond: number, centerX: number, width: number, height: number): void {
        if (!this.waveformData || this.waveformData.length === 0) return;

        const centerY = height / 2;
        const waveformHeight = height * 0.4; // Use 40% of canvas height

        // Map time range to waveform data indices
        const startIdx = Math.max(0, Math.floor((startTime / this.duration) * this.waveformData.length));
        const endIdx = Math.min(this.waveformData.length, Math.ceil((endTime / this.duration) * this.waveformData.length));

        this.ctx.fillStyle = 'rgba(0, 200, 100, 0.2)';
        this.ctx.strokeStyle = 'rgba(0, 200, 100, 0.5)';
        this.ctx.lineWidth = 1;

        // Draw waveform as filled area
        this.ctx.beginPath();

        // Draw top half of waveform
        for (let i = startIdx; i < endIdx; i++) {
            const timeAtIndex = (i / this.waveformData.length) * this.duration;
            const x = centerX + (timeAtIndex - this.playbackPosition) * pixelsPerSecond;
            const amplitude = this.waveformData[i];
            const y = centerY - (amplitude * waveformHeight);

            if (i === startIdx) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }

        // Draw bottom half of waveform (mirror)
        for (let i = endIdx - 1; i >= startIdx; i--) {
            const timeAtIndex = (i / this.waveformData.length) * this.duration;
            const x = centerX + (timeAtIndex - this.playbackPosition) * pixelsPerSecond;
            const amplitude = this.waveformData[i];
            const y = centerY + (amplitude * waveformHeight);
            this.ctx.lineTo(x, y);
        }

        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
    }

    private updatePlayhead(): void {
        if (!this.ctx || !this.canvas || this.duration === 0) return;

        // Simply redraw the entire beat grid
        // The playhead stays centered and beats move
        this.drawBeatGrid();
    }

    private setupMouseWheelZoom(): void {
        this.canvas.addEventListener('wheel', (event: WheelEvent) => {
            event.preventDefault();

            // Zoom in/out based on wheel direction
            const zoomDelta = event.deltaY > 0 ? 1 : -1;
            const newZoomLevel = this.zoomLevel + zoomDelta;

            // Clamp zoom level
            this.zoomLevel = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, newZoomLevel));

            // Redraw with new zoom level
            this.drawBeatGrid();
        });
    }

    private drawTimeScale(startTime: number, endTime: number, pixelsPerSecond: number): void {
        if (!this.ctx || !this.canvas) return;

        const width = this.canvas.width;
        const height = this.canvas.height;
        const centerX = width / 2;

        // Draw time markers every second
        this.ctx.font = '10px monospace';
        this.ctx.fillStyle = '#00ff41';
        this.ctx.textAlign = 'center';

        const startSecond = Math.floor(startTime);
        const endSecond = Math.ceil(endTime);

        for (let time = startSecond; time <= endSecond; time++) {
            if (time < 0 || time > this.duration) continue;

            const timeOffset = time - this.playbackPosition;
            const x = centerX + (timeOffset * pixelsPerSecond);

            // Draw small tick mark
            this.ctx.strokeStyle = '#00ff41';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(x, height - 15);
            this.ctx.lineTo(x, height - 10);
            this.ctx.stroke();

            // Draw time label every 2 seconds
            if (time % 2 === 0) {
                const minutes = Math.floor(time / 60);
                const seconds = time % 60;
                const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                this.ctx.fillText(timeLabel, x, height - 3);
            }
        }
    }
}

