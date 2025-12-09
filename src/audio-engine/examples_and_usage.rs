// examples/dj_deck.rs
//! Example of using the audio engine as a complete DJ deck
//!
//! This example demonstrates how to use the AudioProcessor in a real DJ scenario
//! with tempo control, pitch shifting, and equalizer adjustments.

#[cfg(test)]
mod examples {
    use audio_engine::*;

    /// Example: Basic audio processing pipeline
    #[test]
    fn example_basic_processing() {
        let mut processor = AudioProcessor::new(48000, 1024).unwrap();
        
        // Create test audio (1 second at 48kHz)
        let sample_count = 48000;
        let left_input = vec![0.1; sample_count];
        let right_input = vec![0.1; sample_count];
        
        // Process in chunks (typical audio processing)
        let chunk_size = 256;
        let mut total_samples = 0;
        
        for chunk in 0..(sample_count / chunk_size) {
            let start = chunk * chunk_size;
            let end = start + chunk_size;
            
            let left_chunk = &left_input[start..end];
            let right_chunk = &right_input[start..end];
            
            let output = processor.process_frame(left_chunk, right_chunk);
            total_samples += output.len() / 2; // Stereo = 2 samples per sample
        }
        
        println!("Processed {} stereo samples", total_samples);
        assert_eq!(total_samples, sample_count);
    }

    /// Example: DJ-style tempo change
    #[test]
    fn example_tempo_control() {
        let mut processor = AudioProcessor::new(48000, 1024).unwrap();
        
        // Simulate a 120 BPM track
        let tempo_ratio = 120.0 / 120.0; // Normal speed
        processor.set_tempo_ratio(tempo_ratio);
        assert_eq!(processor.get_tempo_ratio(), 1.0);
        
        // Speed up to 124 BPM
        let new_tempo = 124.0 / 120.0;
        processor.set_tempo_ratio(new_tempo);
        assert!((processor.get_tempo_ratio() - 1.0333).abs() < 0.01);
        
        // Slow down to 115 BPM
        let slow_tempo = 115.0 / 120.0;
        processor.set_tempo_ratio(slow_tempo);
        assert!((processor.get_tempo_ratio() - 0.9583).abs() < 0.01);
        
        println!("Tempo control working correctly");
    }

    /// Example: Pitch shifting for key-locking
    #[test]
    fn example_pitch_control() {
        let mut processor = AudioProcessor::new(48000, 1024).unwrap();
        
        // Standard pitch shifts (in semitones)
        let pitch_shifts = vec![
            (-12, "One octave down"),
            (-7, "Perfect fifth down"),
            (-5, "Fourth down"),
            (0, "No change"),
            (2, "Major second up"),
            (5, "Perfect fourth up"),
            (7, "Perfect fifth up"),
            (12, "One octave up"),
        ];
        
        for (semitones, description) in pitch_shifts {
            processor.set_pitch_shift(semitones);
            let actual = processor.get_pitch_shift();
            assert_eq!(actual, semitones);
            println!("Pitch shift: {} semitones ({})", semitones, description);
        }
    }

    /// Example: 3-band equalizer presets
    #[test]
    fn example_eq_presets() {
        let mut processor = AudioProcessor::new(48000, 1024).unwrap();
        
        // Preset 1: Bass boost (club style)
        processor.set_low_gain(6.0);
        processor.set_mid_gain(0.0);
        processor.set_high_gain(3.0);
        println!("Preset: Bass Boost");
        println!("  Low: {}dB, Mid: {}dB, High: {}dB",
            processor.get_low_gain(),
            processor.get_mid_gain(),
            processor.get_high_gain()
        );
        
        // Preset 2: Bright/crisp
        processor.set_low_gain(-3.0);
        processor.set_mid_gain(2.0);
        processor.set_high_gain(6.0);
        println!("Preset: Bright");
        
        // Preset 3: Warm/dark
        processor.set_low_gain(3.0);
        processor.set_mid_gain(1.0);
        processor.set_high_gain(-6.0);
        println!("Preset: Warm");
        
        // Preset 4: Flat (reset)
        processor.set_low_gain(0.0);
        processor.set_mid_gain(0.0);
        processor.set_high_gain(0.0);
        println!("Preset: Flat");
    }

    /// Example: Stereo crossfading
    #[test]
    fn example_crossfader() {
        let mut processor = AudioProcessor::new(48000, 1024).unwrap();
        
        let positions = vec![
            (-1.0, "Full Left"),
            (-0.5, "3/4 Left"),
            (0.0, "Center"),
            (0.5, "3/4 Right"),
            (1.0, "Full Right"),
        ];
        
        for (position, label) in positions {
            processor.set_fader_position(position);
            assert_eq!(processor.get_fader_position(), position);
            println!("Fader: {} ({})", position, label);
        }
    }

    /// Example: Real-time parameter automation
    #[test]
    fn example_parameter_automation() {
        let mut processor = AudioProcessor::new(48000, 1024).unwrap();
        
        // Simulate a 4-beat fade-in
        let fade_steps = 4;
        for beat in 0..fade_steps {
            let fade_position = (beat as f32) / (fade_steps as f32 - 1.0);
            processor.set_master_volume(fade_position * 1.0); // 0 -> 1.0
            println!("Beat {}: Master Volume = {:.2}", beat, processor.get_master_volume());
        }
        
        // Simulate a tempo ramp-up (accelerando)
        let tempo_steps = 10;
        for step in 0..tempo_steps {
            let tempo = 1.0 + (0.2 * step as f32) / (tempo_steps as f32 - 1.0);
            processor.set_tempo_ratio(tempo);
            println!("Step {}: Tempo = {:.2}x", step, processor.get_tempo_ratio());
        }
        
        // Simulate EQ sweep (increase high end)
        let sweep_steps = 5;
        for step in 0..sweep_steps {
            let high_boost = (step as f32) / (sweep_steps as f32 - 1.0) * 12.0;
            processor.set_high_gain(high_boost);
            println!("Step {}: High Gain = {:.1}dB", step, processor.get_high_gain());
        }
    }

    /// Example: Multi-deck mixing
    #[test]
    fn example_multi_deck_mixing() {
        // Create two DJ decks
        let mut deck_1 = AudioProcessor::new(48000, 1024).unwrap();
        let mut deck_2 = AudioProcessor::new(48000, 1024).unwrap();
        
        // Deck 1: Set to 120 BPM, normal pitch, 70% left
        deck_1.set_tempo_ratio(1.0);
        deck_1.set_pitch_shift(0);
        deck_1.set_fader_position(-0.4);
        deck_1.set_master_volume(0.9);
        
        // Deck 2: Set to 124 BPM, +3 semitones (camelot +1), 30% right
        deck_2.set_tempo_ratio(124.0 / 120.0);
        deck_2.set_pitch_shift(3);
        deck_2.set_fader_position(0.4);
        deck_2.set_master_volume(0.85);
        
        println!("Deck 1: Tempo={:.1}x, Pitch={} ST, Fader={:.1}",
            deck_1.get_tempo_ratio(),
            deck_1.get_pitch_shift(),
            deck_1.get_fader_position()
        );
        
        println!("Deck 2: Tempo={:.1}x, Pitch={} ST, Fader={:.1}",
            deck_2.get_tempo_ratio(),
            deck_2.get_pitch_shift(),
            deck_2.get_fader_position()
        );
        
        // Simulate processing
        let test_audio = vec![0.1; 256];
        let output_1 = deck_1.process_frame(&test_audio, &test_audio);
        let output_2 = deck_2.process_frame(&test_audio, &test_audio);
        
        println!("Output samples: Deck1={}, Deck2={}", 
            output_1.len() / 2, output_2.len() / 2);
    }

    /// Example: Performance monitoring
    #[test]
    fn example_performance_monitoring() {
        let mut processor = AudioProcessor::new(48000, 1024).unwrap();
        
        // Process some audio
        let test_audio = vec![0.2; 256];
        for _ in 0..100 {
            processor.process_frame(&test_audio, &test_audio);
        }
        
        // Get statistics
        let stats_json = processor.get_stats();
        println!("Performance Stats: {}", stats_json);
        
        // Parse and display
        // In real usage, would parse JSON properly
        assert!(stats_json.contains("frames_processed"));
        assert!(stats_json.contains("peak_level"));
        assert!(stats_json.contains("sample_rate"));
    }

    /// Example: Gain staging
    #[test]
    fn example_gain_staging() {
        let mut processor = AudioProcessor::new(48000, 1024).unwrap();
        
        // Proper gain staging for DJing:
        // 1. Set input gain based on source level
        // 2. Use fader for mixing
        // 3. Set master volume to prevent clipping
        
        // Source is quiet (-6dB)
        processor.set_input_gain(1.5); // Boost by ~3.5dB
        println!("Input Gain: {:.1} (source boost)", processor.get_input_gain());
        
        // Use fader for main control
        processor.set_fader_position(-0.3); // Mostly from this deck
        println!("Fader Position: {:.1}", processor.get_fader_position());
        
        // Set master to prevent clipping
        processor.set_master_volume(0.9); // Small headroom
        println!("Master Volume: {:.1}", processor.get_master_volume());
        
        // Apply gentle EQ
        processor.set_low_gain(2.0);
        processor.set_mid_gain(0.0);
        processor.set_high_gain(1.0);
        println!("EQ: Low={}dB, Mid={}dB, High={}dB",
            processor.get_low_gain(),
            processor.get_mid_gain(),
            processor.get_high_gain()
        );
        
        // Process and check levels
        let test_audio = vec![0.1; 256];
        let output = processor.process_frame(&test_audio, &test_audio);
        
        // Calculate output level
        let mut max_level = 0.0;
        for sample in &output {
            max_level = max_level.max(sample.abs());
        }
        println!("Output Peak Level: {:.4} ({:.1}dB)",
            max_level,
            if max_level > 0.0 { 20.0 * max_level.log10() } else { -100.0 }
        );
    }

    /// Example: Beat detection and sync
    #[test]
    fn example_beat_sync() {
        let mut processor = AudioProcessor::new(48000, 1024).unwrap();
        
        // Simulate beat-synced tempo adjustment
        let master_bpm = 120.0;
        let original_bpm = 118.0;
        
        // Calculate sync offset (in cents, 100 cents = 1 semitone)
        let sync_ratio = master_bpm / original_bpm;
        processor.set_tempo_ratio(sync_ratio);
        
        let current_bpm = master_bpm / processor.get_tempo_ratio();
        println!("Master BPM: {}", master_bpm);
        println!("Track Original BPM: {}", original_bpm);
        println!("Sync Ratio: {:.3}x", processor.get_tempo_ratio());
        println!("Synced to: {:.1} BPM", current_bpm);
    }

    /// Example: Camelot Wheel harmonic mixing
    #[test]
    fn example_camelot_mixing() {
        // Camelot Wheel: Harmonically compatible key mixing
        // Original key: 8A (minor)
        // Compatible keys: 7A (4 semitones down), 8B (3 semitones up), 9A (7 semitones up)
        
        let mut deck_1 = AudioProcessor::new(48000, 1024).unwrap();
        let mut deck_2 = AudioProcessor::new(48000, 1024).unwrap();
        
        // Deck 1: Key 8A (use as reference)
        deck_1.set_pitch_shift(0);
        
        // Deck 2: Key 7A (4 semitones down to match 8A)
        deck_2.set_pitch_shift(4); // Shift up 4 semitones to reach 8A
        
        println!("Deck 1: Pitch Shift = {} ST (Key 8A)", deck_1.get_pitch_shift());
        println!("Deck 2: Pitch Shift = {} ST (Key 7A shifted to 8A)", deck_2.get_pitch_shift());
        println!("These decks are harmonically compatible!");
        
        // Another example: Key 8B mixing
        let mut deck_3 = AudioProcessor::new(48000, 1024).unwrap();
        deck_3.set_pitch_shift(-3); // Shift down 3 semitones to reach 8A
        println!("Deck 3: Pitch Shift = {} ST (Key 8B shifted to 8A)", deck_3.get_pitch_shift());
    }
}

// Example usage in main (would be compiled as separate binary)
/*
fn main() {
    // Initialize audio engine
    let mut processor = AudioProcessor::new(48000, 1024).unwrap();
    
    // Configure as a DJ deck
    processor.set_input_gain(1.0);
    processor.set_master_volume(1.0);
    processor.set_fader_position(0.0);
    
    // Main processing loop
    let chunk_size = 256;
    let sample_count = 48000; // 1 second
    
    for chunk in 0..(sample_count / chunk_size) {
        // In real application:
        // let input_left = get_audio_input(0);
        // let input_right = get_audio_input(1);
        
        // For demo:
        let input_left = vec![0.1; chunk_size];
        let input_right = vec![0.1; chunk_size];
        
        // Process
        let output = processor.process_frame(&input_left, &input_right);
        
        // Output (would send to audio device)
        // send_audio_output(&output);
        
        if chunk % 100 == 0 {
            println!("Processed {} chunks", chunk);
        }
    }
    
    println!("Done! Stats: {}", processor.get_stats());
}
*/
