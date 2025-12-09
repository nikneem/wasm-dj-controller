import { Injectable } from '@angular/core';

/**
 * Service for analyzing audio files
 * Interfaces with the WebAssembly audio engine for BPM and key detection
 */
@Injectable({
    providedIn: 'root'
})
export class AudioAnalysisService {
    private audioContext: AudioContext | null = null;
    private decoder: AudioDecoder | null = null;

    constructor() {
        this.initializeAudioContext();
    }

    private initializeAudioContext(): void {
        if (typeof window !== 'undefined' && window.AudioContext) {
            this.audioContext = new window.AudioContext();
        }
    }

    /**
     * Analyze an audio file to extract BPM
     * @param file - The audio file to analyze
     * @returns Promise resolving to BPM as number
     */
    async analyzeBPM(file: File): Promise<number> {
        try {
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            const audioBuffer = await this.decodeAudioFile(arrayBuffer);

            if (!audioBuffer) {
                return 120; // Default
            }

            const samples = this.getMonoSamples(audioBuffer);
            return this.detectBPM(samples, audioBuffer.sampleRate);
        } catch (error) {
            console.error('BPM analysis error:', error);
            return 120;
        }
    }

    /**
     * Analyze an audio file to extract key
     * @param file - The audio file to analyze
     * @returns Promise resolving to key as string
     */
    async analyzeKey(file: File): Promise<string> {
        try {
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            const audioBuffer = await this.decodeAudioFile(arrayBuffer);

            if (!audioBuffer) {
                return 'A Minor'; // Default
            }

            const samples = this.getMonoSamples(audioBuffer);
            return this.detectKey(samples, audioBuffer.sampleRate);
        } catch (error) {
            console.error('Key analysis error:', error);
            return 'A Minor';
        }
    }

    /**
     * Extract beat grid from an audio file
     * @param file - The audio file to analyze
     * @returns Promise resolving to array of beat positions in seconds
     */
    async extractBeatGrid(file: File): Promise<number[]> {
        try {
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            const audioBuffer = await this.decodeAudioFile(arrayBuffer);

            if (!audioBuffer) {
                return [];
            }

            const samples = this.getMonoSamples(audioBuffer);
            return this.detectBeats(samples, audioBuffer.sampleRate);
        } catch (error) {
            console.error('Beat grid extraction error:', error);
            return [];
        }
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

    private async decodeAudioFile(arrayBuffer: ArrayBuffer): Promise<AudioBuffer | null> {
        if (!this.audioContext) {
            return null;
        }

        try {
            return await this.audioContext.decodeAudioData(arrayBuffer);
        } catch (error) {
            console.error('Audio decode error:', error);
            return null;
        }
    }

    private getMonoSamples(audioBuffer: AudioBuffer): Float32Array {
        const numberOfChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const length = audioBuffer.length;
        const samples = new Float32Array(length);

        if (numberOfChannels === 1) {
            // Already mono
            return audioBuffer.getChannelData(0);
        } else if (numberOfChannels === 2) {
            // Mix stereo to mono
            const left = audioBuffer.getChannelData(0);
            const right = audioBuffer.getChannelData(1);

            for (let i = 0; i < length; i++) {
                samples[i] = (left[i] + right[i]) / 2;
            }
        } else {
            // Mix all channels
            for (let ch = 0; ch < numberOfChannels; ch++) {
                const channelData = audioBuffer.getChannelData(ch);
                for (let i = 0; i < length; i++) {
                    samples[i] += channelData[i];
                }
            }
            for (let i = 0; i < length; i++) {
                samples[i] /= numberOfChannels;
            }
        }

        return samples;
    }

    /**
     * Detect BPM from audio samples using improved onset detection and autocorrelation
     * Client-side implementation
     */
    private detectBPM(samples: Float32Array, sampleRate: number): number {
        if (samples.length < sampleRate) {
            return 120.0;
        }

        // Calculate energy frames with spectral flux
        const frameSize = 2048;
        const hopSize = 512; // Smaller hop for better resolution
        const numFrames = Math.floor((samples.length - frameSize) / hopSize);

        if (numFrames < 2) {
            return 120.0;
        }

        const energyFrames = new Float32Array(numFrames);

        for (let i = 0; i < numFrames; i++) {
            const start = i * hopSize;
            const end = start + frameSize;

            if (end > samples.length) {
                break;
            }

            // Calculate RMS energy
            let sum = 0;
            for (let j = start; j < end; j++) {
                sum += samples[j] * samples[j];
            }
            energyFrames[i] = Math.sqrt(sum / frameSize);
        }

        // Calculate spectral flux (onset strength)
        const onsetStrength = new Float32Array(numFrames);
        for (let i = 1; i < numFrames; i++) {
            const diff = energyFrames[i] - energyFrames[i - 1];
            onsetStrength[i] = Math.max(0, diff); // Half-wave rectification
        }

        // Detect onsets using adaptive threshold
        const threshold = this.calculateEnergyThreshold(onsetStrength);
        const onsets: number[] = [];
        const minOnsetSpacing = Math.floor((60.0 / 200.0) * sampleRate / hopSize); // Min 200 BPM

        for (let i = minOnsetSpacing; i < onsetStrength.length - minOnsetSpacing; i++) {
            if (onsetStrength[i] > threshold) {
                // Check if local maximum
                let isLocalMax = true;
                for (let j = i - 2; j <= i + 2; j++) {
                    if (j !== i && j >= 0 && j < onsetStrength.length && onsetStrength[j] >= onsetStrength[i]) {
                        isLocalMax = false;
                        break;
                    }
                }

                if (isLocalMax && (onsets.length === 0 || i - onsets[onsets.length - 1] >= minOnsetSpacing)) {
                    onsets.push(i);
                }
            }
        }

        if (onsets.length < 4) {
            return 120.0;
        }

        // Use autocorrelation on onset intervals to find tempo
        const intervals: number[] = [];
        for (let i = 1; i < onsets.length; i++) {
            intervals.push(onsets[i] - onsets[i - 1]);
        }

        // Find most common interval using histogram
        const minInterval = Math.floor((60.0 / 180.0) * sampleRate / hopSize); // Max 180 BPM
        const maxInterval = Math.floor((60.0 / 60.0) * sampleRate / hopSize);  // Min 60 BPM
        const histogram = new Float32Array(maxInterval - minInterval + 1);

        for (const interval of intervals) {
            if (interval >= minInterval && interval <= maxInterval) {
                const idx = interval - minInterval;
                histogram[idx] += 1;
            }
            // Also check half and double tempo
            const halfInterval = Math.floor(interval / 2);
            if (halfInterval >= minInterval && halfInterval <= maxInterval) {
                const idx = halfInterval - minInterval;
                histogram[idx] += 0.5;
            }
            const doubleInterval = interval * 2;
            if (doubleInterval >= minInterval && doubleInterval <= maxInterval) {
                const idx = doubleInterval - minInterval;
                histogram[idx] += 0.5;
            }
        }

        // Find peak in histogram
        let maxCount = 0;
        let bestInterval = 0;
        for (let i = 0; i < histogram.length; i++) {
            if (histogram[i] > maxCount) {
                maxCount = histogram[i];
                bestInterval = i + minInterval;
            }
        }

        if (bestInterval === 0) {
            return 120.0;
        }

        // Convert to BPM with decimal precision
        const intervalInSamples = bestInterval * hopSize;
        let bpm = (60.0 * sampleRate) / intervalInSamples;

        // Clamp to reasonable range but keep decimal precision
        bpm = Math.max(60, Math.min(200, bpm));

        // Round to one decimal place
        return Math.round(bpm * 10) / 10;
    }

    /**
     * Detect key using chromatic energy distribution
     */
    private detectKey(samples: Float32Array, sampleRate: number): string {
        if (samples.length === 0) {
            return 'A Minor';
        }

        // Analyze first 3 seconds
        const analysisSamples = Math.min(sampleRate * 3, samples.length);
        const bins = this.computeChromaticBins(
            samples.slice(0, analysisSamples),
            sampleRate
        );

        const keyNames = [
            'C',
            'C#',
            'D',
            'D#',
            'E',
            'F',
            'F#',
            'G',
            'G#',
            'A',
            'A#',
            'B',
        ];

        // Find dominant bin
        let maxBin = 0;
        let maxEnergy = bins[0];

        for (let i = 1; i < bins.length; i++) {
            if (bins[i] > maxEnergy) {
                maxEnergy = bins[i];
                maxBin = i;
            }
        }

        const key = keyNames[maxBin];

        // Determine major or minor
        const isMinor = bins[maxBin] > bins[(maxBin + 3) % 12] * 1.2;

        return `${key} ${isMinor ? 'Minor' : 'Major'}`;
    }

    private computeChromaticBins(samples: Float32Array, sampleRate: number): Float32Array {
        const NUM_CHROMATIC_BINS = 12;
        const chromaticEnergy = new Float32Array(NUM_CHROMATIC_BINS);

        // Use available samples for frequency analysis
        const fftSize = Math.min(4096, samples.length);

        // Apply Hann window
        const windowed = new Float32Array(fftSize);
        const pi = Math.PI;

        for (let i = 0; i < fftSize; i++) {
            const window = 0.5 - 0.5 * Math.cos((2.0 * pi * i) / (fftSize - 1));
            windowed[i] = samples[i] * window;
        }

        // Calculate energy in frequency bins
        const binEnergy = new Float32Array(128);
        const samplesPerBin = Math.floor(fftSize / 128);

        for (let binIdx = 0; binIdx < 128; binIdx++) {
            const start = binIdx * samplesPerBin;
            const end = Math.min(start + samplesPerBin, fftSize);
            let energy = 0;

            for (let i = start; i < end; i++) {
                energy += windowed[i] * windowed[i];
            }

            binEnergy[binIdx] = Math.sqrt(energy / samplesPerBin);
        }

        // Map to chromatic notes
        for (let binIdx = 0; binIdx < binEnergy.length; binIdx++) {
            const freq = (binIdx * sampleRate) / fftSize;

            if (freq < 80 || freq > 4000) {
                continue;
            }

            // Convert to MIDI note
            const midiNote = 12 * Math.log2(freq / 440) + 69;
            const chromaticNote = Math.round(midiNote) % 12;

            if (chromaticNote >= 0 && chromaticNote < 12) {
                chromaticEnergy[chromaticNote] += binEnergy[binIdx];
            }
        }

        // Normalize
        let maxEnergy = 0;
        for (let i = 0; i < chromaticEnergy.length; i++) {
            if (chromaticEnergy[i] > maxEnergy) {
                maxEnergy = chromaticEnergy[i];
            }
        }

        if (maxEnergy > 0) {
            for (let i = 0; i < chromaticEnergy.length; i++) {
                chromaticEnergy[i] /= maxEnergy;
            }
        }

        return chromaticEnergy;
    }

    private calculateEnergyThreshold(energyFrames: Float32Array): number {
        // Calculate mean
        let sum = 0;
        for (let i = 0; i < energyFrames.length; i++) {
            sum += energyFrames[i];
        }
        const mean = sum / energyFrames.length;

        // Calculate standard deviation
        let variance = 0;
        for (let i = 0; i < energyFrames.length; i++) {
            const diff = energyFrames[i] - mean;
            variance += diff * diff;
        }
        variance /= energyFrames.length;
        const stdDev = Math.sqrt(variance);

        // Return mean + 1.5 * stdDev
        return mean + 1.5 * stdDev;
    }

    /**
     * Detect beat positions using onset detection
     * Returns array of beat timestamps in seconds
     */
    private detectBeats(samples: Float32Array, sampleRate: number): number[] {
        if (samples.length < sampleRate) {
            return [];
        }

        // Calculate energy frames with onset detection
        const frameSize = 2048;
        const hopSize = frameSize / 2;
        const numFrames = Math.floor((samples.length - frameSize) / hopSize);

        if (numFrames < 2) {
            return [];
        }

        const energyFrames = new Float32Array(numFrames);

        // Calculate energy for each frame
        for (let i = 0; i < numFrames; i++) {
            const start = i * hopSize;
            const end = start + frameSize;
            let energy = 0;

            for (let j = start; j < end && j < samples.length; j++) {
                energy += samples[j] * samples[j];
            }

            energyFrames[i] = Math.sqrt(energy / frameSize);
        }

        // Calculate spectral flux (energy difference between frames)
        const spectralFlux = new Float32Array(numFrames);
        for (let i = 1; i < numFrames; i++) {
            const diff = energyFrames[i] - energyFrames[i - 1];
            spectralFlux[i] = Math.max(0, diff); // Only positive differences
        }

        // Find peaks in spectral flux (onset detection)
        const beats: number[] = [];
        const threshold = this.calculateAdaptiveThreshold(spectralFlux);
        const minBeatInterval = Math.floor((60 / 200) * sampleRate / hopSize); // Min 200 BPM

        for (let i = minBeatInterval; i < numFrames - minBeatInterval; i++) {
            if (spectralFlux[i] > threshold) {
                // Check if it's a local maximum
                let isLocalMax = true;
                for (let j = i - 2; j <= i + 2; j++) {
                    if (j !== i && spectralFlux[j] >= spectralFlux[i]) {
                        isLocalMax = false;
                        break;
                    }
                }

                if (isLocalMax) {
                    // Check minimum beat interval
                    if (beats.length === 0 || i - beats[beats.length - 1] >= minBeatInterval) {
                        beats.push(i);
                    }
                }
            }
        }

        // Convert frame indices to time in seconds
        const beatTimes = beats.map(frameIdx => (frameIdx * hopSize) / sampleRate);

        return beatTimes;
    }

    /**
     * Calculate adaptive threshold for onset detection
     */
    private calculateAdaptiveThreshold(spectralFlux: Float32Array): number {
        // Calculate mean and standard deviation
        let sum = 0;
        for (let i = 0; i < spectralFlux.length; i++) {
            sum += spectralFlux[i];
        }
        const mean = sum / spectralFlux.length;

        let varianceSum = 0;
        for (let i = 0; i < spectralFlux.length; i++) {
            const diff = spectralFlux[i] - mean;
            varianceSum += diff * diff;
        }
        const stdDev = Math.sqrt(varianceSum / spectralFlux.length);

        // Threshold is mean + 1.5 * standard deviation
        return mean + 1.5 * stdDev;
    }
}

