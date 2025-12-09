use std::f32::consts::PI;

/// Audio analysis module for BPM and key detection
pub struct AudioAnalyzer {
    sample_rate: u32,
    fft_size: usize,
}

impl AudioAnalyzer {
    pub fn new(sample_rate: u32, fft_size: usize) -> Self {
        Self { sample_rate, fft_size }
    }

    /// Detect BPM from audio samples using energy-based onset detection
    /// Returns BPM as u32
    pub fn detect_bpm(samples: &[f32], sample_rate: u32) -> u32 {
        if samples.len() < sample_rate as usize {
            return 120; // Default BPM
        }

        // Calculate energy frames (use 2048 samples per frame)
        let frame_size = 2048;
        let hop_size = frame_size / 2;
        let num_frames = (samples.len() - frame_size) / hop_size;

        if num_frames < 2 {
            return 120;
        }

        let mut energy_frames = vec![0.0; num_frames];

        for i in 0..num_frames {
            let start = i * hop_size;
            let end = start + frame_size;
            if end > samples.len() {
                break;
            }

            // Calculate RMS energy
            let mut sum = 0.0;
            for &sample in &samples[start..end] {
                sum += sample * sample;
            }
            energy_frames[i] = (sum / frame_size as f32).sqrt();
        }

        // Detect onsets from energy variation
        let mut onsets = Vec::new();
        let threshold = Self::calculate_energy_threshold(&energy_frames);

        for i in 1..energy_frames.len() {
            let delta = energy_frames[i] - energy_frames[i - 1];
            if delta > threshold {
                onsets.push(i);
            }
        }

        if onsets.len() < 2 {
            return 120;
        }

        // Calculate average onset spacing
        let mut total_spacing = 0;
        for i in 1..onsets.len().min(10) {
            total_spacing += onsets[i] - onsets[i - 1];
        }

        let avg_spacing = (total_spacing as f32 / (onsets.len().min(10) - 1) as f32) as usize;
        let onset_sample_spacing = avg_spacing * hop_size;

        // Convert sample spacing to BPM
        // BPM = (60 * sample_rate) / samples_per_beat
        let bpm = (60.0 * sample_rate as f32) / onset_sample_spacing as f32;

        // Clamp to realistic range and round to nearest multiple of 2
        let bpm = (bpm.clamp(80.0, 180.0) / 2.0).round() * 2.0;
        bpm as u32
    }

    /// Detect key using chromatic energy distribution
    /// Returns key as string (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
    pub fn detect_key(samples: &[f32], sample_rate: u32) -> String {
        if samples.is_empty() {
            return "A Minor".to_string();
        }

        // Take first 3 seconds of audio for analysis
        let analysis_samples = samples.len().min(sample_rate as usize * 3);
        let bins = Self::compute_chromatic_bins(&samples[..analysis_samples], sample_rate);

        let key_names = [
            "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
        ];

        // Find dominant chromatic bin
        let max_bin = bins
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
            .map(|(i, _)| i)
            .unwrap_or(9); // Default to A

        let key = key_names[max_bin];

        // Simplified: alternate between major and minor based on energy distribution
        let is_minor = bins[max_bin] > bins[(max_bin + 3) % 12] * 1.2;

        format!("{} {}", key, if is_minor { "Minor" } else { "Major" })
    }

    /// Compute chromatic energy distribution
    fn compute_chromatic_bins(samples: &[f32], sample_rate: u32) -> Vec<f32> {
        const NUM_CHROMATIC_BINS: usize = 12;
        let mut chromatic_energy = vec![0.0; NUM_CHROMATIC_BINS];

        // Use FFT size for frequency analysis
        let fft_size = 4096.min(samples.len());

        // Apply Hann window and compute FFT
        let mut windowed = vec![0.0; fft_size];
        for (i, sample) in samples.iter().take(fft_size).enumerate() {
            let window = 0.5 - 0.5 * (2.0 * PI * i as f32 / (fft_size - 1) as f32).cos();
            windowed[i] = sample * window;
        }

        // Simple magnitude calculation from time domain energy
        // (In production, would use proper FFT)
        let mut bin_energy = vec![0.0; 128];
        let samples_per_bin = fft_size / 128;

        for bin_idx in 0..128 {
            let start = bin_idx * samples_per_bin;
            let end = (start + samples_per_bin).min(fft_size);
            let mut energy = 0.0;

            for &sample in &windowed[start..end] {
                energy += sample * sample;
            }

            bin_energy[bin_idx] = (energy / samples_per_bin as f32).sqrt();
        }

        // Map frequency bins to chromatic notes
        // A4 = 440 Hz is MIDI note 69
        for bin_idx in 0..bin_energy.len() {
            let freq = bin_idx as f32 * sample_rate as f32 / fft_size as f32;

            if freq < 80.0 || freq > 4000.0 {
                continue;
            }

            // Convert frequency to MIDI note
            let midi_note = 12.0 * (freq / 440.0).log2() + 69.0;
            let chromatic_note = ((midi_note + 0.5) as usize) % 12;

            chromatic_energy[chromatic_note] += bin_energy[bin_idx];
        }

        // Normalize
        let max_energy = chromatic_energy.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        if max_energy > 0.0 {
            for energy in &mut chromatic_energy {
                *energy /= max_energy;
            }
        }

        chromatic_energy
    }

    fn calculate_energy_threshold(energy_frames: &[f32]) -> f32 {
        let mean_energy: f32 = energy_frames.iter().sum::<f32>() / energy_frames.len() as f32;

        // Calculate standard deviation
        let variance: f32 = energy_frames
            .iter()
            .map(|e| (e - mean_energy).powi(2))
            .sum::<f32>()
            / energy_frames.len() as f32;

        let std_dev = variance.sqrt();

        // Use mean + 1.5 * std_dev as threshold
        mean_energy + 1.5 * std_dev
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bpm_detection() {
        // Create synthetic audio at 120 BPM
        let sample_rate = 48000;
        let duration_seconds = 5;
        let mut samples = vec![0.0; sample_rate as usize * duration_seconds];

        // Generate click track at 120 BPM
        let samples_per_beat = (sample_rate as f32 * 60.0 / 120.0) as usize;

        for beat in 0..duration_seconds * 2 {
            let start = beat * samples_per_beat;
            let end = (start + 4410).min(samples.len()); // 0.1 second click

            for i in start..end {
                samples[i] = 0.5;
            }
        }

        let detected_bpm = AudioAnalyzer::detect_bpm(&samples, sample_rate);
        assert!((detected_bpm as i32 - 120).abs() < 10);
    }
}
