/**
 * AudioWorklet Processor for DJ Controller
 * 
 * Runs on the audio rendering thread (separate from main UI thread)
 * This ensures smooth, glitch-free audio playback even when:
 * - Loading new tracks
 * - UI is busy
 * - Multiple decks are playing simultaneously
 * 
 * Benefits over ScriptProcessorNode:
 * - Runs on dedicated audio thread (no main thread blocking)
 * - Lower latency (128 samples default vs 4096)
 * - No dropouts from garbage collection
 * - Better performance for real-time audio
 */

class DJAudioProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();

        this.sourceBufferL = null;
        this.sourceBufferR = null;
        this.readPosition = 0;
        this.isPlaying = false;
        this.tempoRatio = 1.0;

        // Audio parameters
        this.gain = 1.0;
        this.panPosition = 0.0; // -1 (left) to +1 (right)

        // Performance tracking
        this.samplesProcessed = 0;
        this.lastPositionUpdate = 0;
        this.updateInterval = 0.1; // Update position every 100ms

        // Listen for messages from main thread
        this.port.onmessage = (event) => {
            this.handleMessage(event.data);
        };

        // Notify main thread that processor is ready
        this.port.postMessage({ type: 'ready' });
    }

    /**
     * Handle messages from main thread
     */
    handleMessage(data) {
        switch (data.type) {
            case 'setBuffer':
                this.sourceBufferL = data.bufferL;
                this.sourceBufferR = data.bufferR;
                this.readPosition = 0;
                break;

            case 'play':
                this.isPlaying = true;
                if (data.position !== undefined) {
                    this.readPosition = Math.floor(data.position * sampleRate);
                }
                break;

            case 'pause':
                this.isPlaying = false;
                break;

            case 'seek':
                this.readPosition = Math.floor(data.position * sampleRate);
                break;

            case 'setTempo':
                this.tempoRatio = data.ratio;
                break;

            case 'setGain':
                this.gain = data.gain;
                break;

            case 'setPan':
                this.panPosition = data.pan;
                break;

            case 'stop':
                this.isPlaying = false;
                this.readPosition = 0;
                break;
        }
    }

    /**
     * Main audio processing callback
     * Called by audio rendering thread at regular intervals (128 samples default)
     * 
     * @returns true to keep processor alive, false to destroy it
     */
    process(inputs, outputs, parameters) {
        const output = outputs[0];

        // Safety check
        if (!output || output.length < 2) {
            return true; // Keep processor alive
        }

        const outputL = output[0];
        const outputR = output[1];
        const bufferSize = outputL.length;

        // If not playing or no buffer, output silence
        if (!this.isPlaying || !this.sourceBufferL || !this.sourceBufferR) {
            outputL.fill(0);
            outputR.fill(0);
            return true;
        }

        const totalSamples = this.sourceBufferL.length;

        // Process audio samples
        for (let i = 0; i < bufferSize; i++) {
            const readPos = this.readPosition + (i * this.tempoRatio);
            const index = Math.floor(readPos);

            // Check for end of track
            if (index >= totalSamples - 1) {
                // Fill rest with silence
                for (let j = i; j < bufferSize; j++) {
                    outputL[j] = 0;
                    outputR[j] = 0;
                }

                // Notify main thread that playback ended
                this.port.postMessage({
                    type: 'ended',
                    position: this.readPosition / sampleRate
                });

                this.isPlaying = false;
                break;
            }

            // Linear interpolation for smooth playback at any tempo
            const frac = readPos - index;
            let sampleL = this.sourceBufferL[index] * (1 - frac) + this.sourceBufferL[index + 1] * frac;
            let sampleR = this.sourceBufferR[index] * (1 - frac) + this.sourceBufferR[index + 1] * frac;

            // Apply gain
            sampleL *= this.gain;
            sampleR *= this.gain;

            // Apply pan (constant power panning for better stereo image)
            if (this.panPosition !== 0) {
                const panAngle = this.panPosition * Math.PI / 4; // -π/4 to +π/4
                const leftGain = Math.cos(panAngle);
                const rightGain = Math.sin(panAngle);

                sampleL *= leftGain;
                sampleR *= rightGain;
            }

            outputL[i] = sampleL;
            outputR[i] = sampleR;
        }

        // Update read position
        this.readPosition += bufferSize * this.tempoRatio;
        this.samplesProcessed += bufferSize;

        // Periodically send position updates to main thread (throttled)
        const currentPosition = this.readPosition / sampleRate;
        if (currentPosition - this.lastPositionUpdate >= this.updateInterval) {
            this.port.postMessage({
                type: 'position',
                position: currentPosition
            });
            this.lastPositionUpdate = currentPosition;
        }

        return true; // Keep processor alive
    }

    /**
     * Static parameter descriptors for AudioParam automation
     */
    static get parameterDescriptors() {
        return [
            {
                name: 'gain',
                defaultValue: 1.0,
                minValue: 0.0,
                maxValue: 2.0,
                automationRate: 'k-rate' // Control rate (per processing block)
            },
            {
                name: 'pan',
                defaultValue: 0.0,
                minValue: -1.0,
                maxValue: 1.0,
                automationRate: 'k-rate'
            }
        ];
    }
}

// Register the processor
registerProcessor('dj-audio-processor', DJAudioProcessor);
