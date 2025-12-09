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
     * Detect BPM from audio samples using energy-based onset detection
     * Client-side implementation
     */
    private detectBPM(samples: Float32Array, sampleRate: number): number {
        if (samples.length < sampleRate) {
            return 120;
        }

        // Calculate energy frames
        const frameSize = 2048;
        const hopSize = frameSize / 2;
        const numFrames = Math.floor((samples.length - frameSize) / hopSize);

        if (numFrames < 2) {
            return 120;
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

        // Detect onsets
        const threshold = this.calculateEnergyThreshold(energyFrames);
        const onsets: number[] = [];

        for (let i = 1; i < energyFrames.length; i++) {
            const delta = energyFrames[i] - energyFrames[i - 1];
            if (delta > threshold) {
                onsets.push(i);
            }
        }

        if (onsets.length < 2) {
            return 120;
        }

        // Calculate average onset spacing
        let totalSpacing = 0;
        const maxOnsets = Math.min(10, onsets.length);

        for (let i = 1; i < maxOnsets; i++) {
            totalSpacing += onsets[i] - onsets[i - 1];
        }

        const avgSpacing = Math.floor(totalSpacing / (maxOnsets - 1));
        const onsetSampleSpacing = avgSpacing * hopSize;

        // Convert to BPM
        let bpm = (60.0 * sampleRate) / onsetSampleSpacing;

        // Clamp and round
        bpm = Math.max(80, Math.min(180, bpm));
        bpm = Math.round((bpm / 2) * 2); // Round to nearest multiple of 2

        return Math.floor(bpm);
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
}
