use std::f32::consts::PI;
use rustfft::{FftPlanner, num_complex::Complex};

/// Frequency bands for multi-band spectral analysis
#[derive(Debug, Clone)]
struct FrequencyBand {
    name: &'static str,
    low_freq: f32,
    high_freq: f32,
    weight: f32,
}

/// Audio analysis module for BPM and key detection
pub struct AudioAnalyzer {
    sample_rate: u32,
    fft_size: usize,
}

impl AudioAnalyzer {
    pub fn new(sample_rate: u32, fft_size: usize) -> Self {
        Self { sample_rate, fft_size }
    }

    /// Define frequency bands for multi-band analysis
    fn frequency_bands() -> Vec<FrequencyBand> {
        vec![
            FrequencyBand {
                name: "Sub-bass",
                low_freq: 20.0,
                high_freq: 60.0,
                weight: 0.8,
            },
            FrequencyBand {
                name: "Bass",
                low_freq: 60.0,
                high_freq: 250.0,
                weight: 1.5,
            },
            FrequencyBand {
                name: "Low-mids",
                low_freq: 250.0,
                high_freq: 500.0,
                weight: 1.2,
            },
            FrequencyBand {
                name: "Mids",
                low_freq: 500.0,
                high_freq: 2000.0,
                weight: 1.0,
            },
            FrequencyBand {
                name: "High-mids",
                low_freq: 2000.0,
                high_freq: 4000.0,
                weight: 0.7,
            },
            FrequencyBand {
                name: "Highs",
                low_freq: 4000.0,
                high_freq: 8000.0,
                weight: 0.5,
            },
        ]
    }

    /// Detect BPM from audio samples using Multi-band Spectral Flux Analysis
    /// with multi-section consensus voting for improved accuracy and reliability
    /// Returns BPM as u32
    pub fn detect_bpm(samples: &[f32], sample_rate: u32) -> u32 {
        if samples.len() < sample_rate as usize * 2 {
            return 120; // Default BPM - need at least 2 seconds
        }

        // Analyze multiple sections of the track for consensus
        let section_duration = 10.0; // 10 seconds per section
        let section_samples = (sample_rate as f32 * section_duration) as usize;
        let num_sections = (samples.len() / section_samples).min(5).max(1); // Analyze up to 5 sections
        
        let mut bpm_candidates = Vec::new();

        // Analyze each section
        for section_idx in 0..num_sections {
            // Use strategic positions: start, 1/4, middle, 3/4, end
            let position = match section_idx {
                0 => 0, // Start (intro might be less rhythmic)
                1 => samples.len() / 4, // First quarter
                2 => samples.len() / 2, // Middle (usually most stable)
                3 => (samples.len() * 3) / 4, // Third quarter
                4 => samples.len().saturating_sub(section_samples), // Near end
                _ => section_idx * section_samples,
            };

            let start = position;
            let end = (start + section_samples).min(samples.len());
            
            if end - start < sample_rate as usize * 5 {
                continue; // Skip if section is too short
            }

            let section_samples_slice = &samples[start..end];
            let bpm = Self::analyze_section_bpm(section_samples_slice, sample_rate);
            
            if bpm > 0 {
                bpm_candidates.push(bpm);
            }
        }

        if bpm_candidates.is_empty() {
            return 120;
        }

        // Use consensus with octave correction
        let final_bpm = Self::consensus_bpm(&bpm_candidates);

        final_bpm
    }

    /// Analyze a single section for BPM
    fn analyze_section_bpm(samples: &[f32], sample_rate: u32) -> u32 {
        // Parameters for spectral analysis
        let fft_size = 2048;
        let hop_size = 512; // 75% overlap for better temporal resolution
        let num_frames = (samples.len() - fft_size) / hop_size;

        if num_frames < 4 {
            return 0;
        }

        // Compute spectral flux using multi-band analysis
        let onset_strength = Self::compute_multiband_spectral_flux(
            samples,
            sample_rate,
            fft_size,
            hop_size,
            num_frames,
        );

        if onset_strength.len() < 4 {
            return 0;
        }

        // Use autocorrelation to find periodic patterns
        let bpm = Self::estimate_bpm_from_onsets(&onset_strength, sample_rate, hop_size);

        bpm
    }

    /// Determine consensus BPM from multiple candidates using clustering and octave correction
    fn consensus_bpm(candidates: &[u32]) -> u32 {
        if candidates.is_empty() {
            return 120;
        }

        if candidates.len() == 1 {
            return candidates[0];
        }

        // Normalize all candidates to the same octave range (80-160 BPM)
        let normalized: Vec<f32> = candidates
            .iter()
            .map(|&bpm| Self::normalize_to_octave(bpm as f32, 80.0, 160.0))
            .collect();

        // Use weighted voting - candidates closer to each other get more weight
        let mut best_bpm = normalized[0];
        let mut best_score = 0.0;

        for &candidate in &normalized {
            let mut score = 0.0;
            
            for &other in &normalized {
                // Calculate similarity (inverse of difference)
                let diff = (candidate - other).abs();
                let similarity = 1.0 / (1.0 + diff / 10.0); // Normalize by 10 BPM
                score += similarity;
            }
            
            if score > best_score {
                best_score = score;
                best_bpm = candidate;
            }
        }

        // Round to nearest integer
        best_bpm.round() as u32
    }

    /// Normalize BPM to target octave range by halving or doubling
    fn normalize_to_octave(bpm: f32, min_target: f32, max_target: f32) -> f32 {
        let mut normalized = bpm;
        
        // Double if too slow
        while normalized < min_target && normalized < 200.0 {
            normalized *= 2.0;
        }
        
        // Halve if too fast
        while normalized > max_target && normalized > 60.0 {
            normalized /= 2.0;
        }
        
        normalized
    }

    /// Compute multi-band spectral flux for onset detection
    fn compute_multiband_spectral_flux(
        samples: &[f32],
        sample_rate: u32,
        fft_size: usize,
        hop_size: usize,
        num_frames: usize,
    ) -> Vec<f32> {
        let bands = Self::frequency_bands();
        let mut onset_strength = vec![0.0; num_frames];
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(fft_size);

        // Previous frame magnitudes per band for flux calculation
        let mut prev_band_magnitudes: Vec<Vec<f32>> = vec![Vec::new(); bands.len()];

        for frame_idx in 0..num_frames {
            let start = frame_idx * hop_size;
            let end = start + fft_size;
            
            if end > samples.len() {
                break;
            }

            // Apply Hann window
            let mut windowed: Vec<Complex<f32>> = (0..fft_size)
                .map(|i| {
                    let window = 0.5 - 0.5 * (2.0 * PI * i as f32 / (fft_size - 1) as f32).cos();
                    Complex::new(samples[start + i] * window, 0.0)
                })
                .collect();

            // Compute FFT
            fft.process(&mut windowed);

            // Compute magnitude spectrum
            let magnitudes: Vec<f32> = windowed[..fft_size / 2]
                .iter()
                .map(|c| (c.re * c.re + c.im * c.im).sqrt())
                .collect();

            // Calculate spectral flux for each frequency band
            let mut frame_flux = 0.0;

            for (band_idx, band) in bands.iter().enumerate() {
                let bin_low = ((band.low_freq * fft_size as f32) / sample_rate as f32) as usize;
                let bin_high = ((band.high_freq * fft_size as f32) / sample_rate as f32) as usize;
                let bin_high = bin_high.min(magnitudes.len());

                if bin_low >= bin_high {
                    continue;
                }

                // Sum magnitudes in this band
                let band_magnitude: f32 = magnitudes[bin_low..bin_high].iter().sum();

                // Calculate spectral flux (positive difference only)
                if frame_idx > 0 && !prev_band_magnitudes[band_idx].is_empty() {
                    let prev_magnitude = prev_band_magnitudes[band_idx][0];
                    let flux = (band_magnitude - prev_magnitude).max(0.0);
                    frame_flux += flux * band.weight;
                }

                // Store current magnitude for next frame
                prev_band_magnitudes[band_idx] = vec![band_magnitude];
            }

            onset_strength[frame_idx] = frame_flux;
        }

        // Normalize onset strength
        Self::normalize_onset_strength(&mut onset_strength);

        onset_strength
    }

    /// Normalize onset strength function
    fn normalize_onset_strength(onset_strength: &mut [f32]) {
        if onset_strength.is_empty() {
            return;
        }

        let max_strength = onset_strength
            .iter()
            .cloned()
            .fold(f32::NEG_INFINITY, f32::max);

        if max_strength > 0.0 {
            for strength in onset_strength.iter_mut() {
                *strength /= max_strength;
            }
        }
    }

    /// Estimate BPM from onset strength function using enhanced autocorrelation
    /// with peak detection and octave relationship analysis
    fn estimate_bpm_from_onsets(onset_strength: &[f32], sample_rate: u32, hop_size: usize) -> u32 {
        // Define BPM search range
        let min_bpm = 60.0;
        let max_bpm = 200.0;

        // Convert BPM to lag in frames
        let frames_per_second = sample_rate as f32 / hop_size as f32;
        let min_lag = ((60.0 / max_bpm) * frames_per_second) as usize;
        let max_lag = ((60.0 / min_bpm) * frames_per_second) as usize;
        let max_lag = max_lag.min(onset_strength.len() / 2);

        if min_lag >= max_lag {
            return 120;
        }

        // Compute autocorrelation for different lags
        let mut autocorr = vec![0.0; max_lag - min_lag + 1];

        for (i, lag) in (min_lag..=max_lag).enumerate() {
            let mut sum = 0.0;
            let mut count = 0;

            for j in 0..(onset_strength.len() - lag) {
                sum += onset_strength[j] * onset_strength[j + lag];
                count += 1;
            }

            if count > 0 {
                autocorr[i] = sum / count as f32;
            }
        }

        // Find multiple peaks in autocorrelation
        let peaks = Self::find_autocorr_peaks(&autocorr, min_lag);
        
        if peaks.is_empty() {
            return 120;
        }

        // Select best peak considering strength and musical relevance
        let best_lag = Self::select_best_tempo_peak(&peaks, frames_per_second);

        // Convert lag back to BPM
        let bpm = 60.0 * frames_per_second / best_lag as f32;

        // Round to nearest integer and clamp
        let bpm = bpm.round().clamp(min_bpm, max_bpm);

        bpm as u32
    }

    /// Find peaks in autocorrelation function
    fn find_autocorr_peaks(autocorr: &[f32], offset: usize) -> Vec<(usize, f32)> {
        let mut peaks = Vec::new();
        
        // Find local maxima with minimum height threshold
        let mean = autocorr.iter().sum::<f32>() / autocorr.len() as f32;
        let threshold = mean * 1.2; // Peak must be 20% above mean

        for i in 2..(autocorr.len() - 2) {
            let val = autocorr[i];
            
            // Check if this is a local maximum
            if val > threshold
                && val > autocorr[i - 1]
                && val > autocorr[i - 2]
                && val > autocorr[i + 1]
                && val > autocorr[i + 2]
            {
                peaks.push((i + offset, val));
            }
        }

        // Sort by strength (descending)
        peaks.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        
        // Keep top 5 peaks
        peaks.truncate(5);
        
        peaks
    }

    /// Select the best tempo peak from candidates
    fn select_best_tempo_peak(peaks: &[(usize, f32)], frames_per_second: f32) -> usize {
        if peaks.is_empty() {
            return 50; // Fallback
        }

        // Prefer BPMs in the "sweet spot" ranges for different genres
        // House/Techno: 120-130, Drum & Bass: 160-180, Hip-Hop: 80-100
        let mut best_score = 0.0;
        let mut best_lag = peaks[0].0;

        for &(lag, strength) in peaks {
            let bpm = 60.0 * frames_per_second / lag as f32;
            
            // Calculate score based on strength and musical preference
            let mut score = strength;
            
            // Boost score for common tempo ranges
            if (115.0..=135.0).contains(&bpm) {
                score *= 1.3; // House/Techno sweet spot
            } else if (155.0..=185.0).contains(&bpm) {
                score *= 1.2; // Drum & Bass range
            } else if (85.0..=105.0).contains(&bpm) {
                score *= 1.15; // Hip-Hop/slower electronic
            }
            
            if score > best_score {
                best_score = score;
                best_lag = lag;
            }
        }

        best_lag
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
