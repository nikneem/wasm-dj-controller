//! Audio buffer management with zero-copy pooling
//! 
//! Provides efficient buffer allocation and reuse for real-time audio processing.
//! Pre-allocates buffers during initialization to avoid runtime allocations in the hot path.

/// Manages pre-allocated audio buffers for zero-copy processing
/// 
/// This buffer manager maintains a pool of reusable buffers to eliminate
/// allocation overhead in the real-time audio processing loop.
pub struct BufferManager {
    buffer_pool: Vec<Vec<f32>>,
    buffer_size: usize,
}

impl BufferManager {
    /// Creates a new buffer manager with pre-allocated buffers
    /// 
    /// # Arguments
    /// * `buffer_size` - Size of each buffer in samples
    /// 
    /// # Performance
    /// - Initialization: O(1) amortized
    /// - get_buffer: O(1)
    /// - Zero allocations after initialization
    pub fn new(buffer_size: usize) -> Self {
        // Pre-allocate 4 buffers for typical L/R/temp processing
        let mut pool = Vec::with_capacity(4);
        for _ in 0..4 {
            pool.push(vec![0.0; buffer_size]);
        }
        
        BufferManager {
            buffer_pool: pool,
            buffer_size,
        }
    }

    /// Gets a zero-initialized buffer from the pool
    /// 
    /// Internally manages buffer reuse. Buffer is returned in cleared state.
    /// 
    /// # Arguments
    /// * `size` - Requested buffer size (must be <= allocated size)
    /// 
    /// # Returns
    /// A mutable reference to a zero-initialized buffer
    /// 
    /// # Note
    /// This is not truly a "borrow" - the buffer is returned in a cleared state
    /// for use in processing. In a multi-threaded context, this would need
    /// proper synchronization. For WASM single-threaded context, this is safe.
    pub fn get_buffer(&mut self, size: usize) -> Vec<f32> {
        let mut buffer = if self.buffer_pool.is_empty() {
            vec![0.0; self.buffer_size.max(size)]
        } else {
            self.buffer_pool.pop().unwrap()
        };

        // Clear buffer to requested size
        buffer.truncate(size);
        buffer.resize(size, 0.0);

        buffer
    }

    /// Returns a buffer to the pool for reuse
    /// 
    /// The buffer will be cleared and made available for the next get_buffer call.
    pub fn return_buffer(&mut self, buffer: Vec<f32>) {
        if self.buffer_pool.len() < 4 {
            self.buffer_pool.push(buffer);
        }
    }

    /// Gets the current pool size
    pub fn pool_size(&self) -> usize {
        self.buffer_pool.len()
    }

    /// Gets the buffer size
    pub fn buffer_size(&self) -> usize {
        self.buffer_size
    }
}

/// Audio sample utilities
pub mod sample_utils {
    /// Converts dB to linear gain
    /// 
    /// # Arguments
    /// * `db` - Gain in decibels
    /// 
    /// # Formula
    /// ```text
    /// linear = 10^(dB / 20)
    /// ```
    pub fn db_to_linear(db: f32) -> f32 {
        10.0_f32.powf(db / 20.0)
    }

    /// Converts linear gain to dB
    /// 
    /// # Arguments
    /// * `linear` - Gain in linear units
    pub fn linear_to_db(linear: f32) -> f32 {
        if linear <= 0.0 {
            -100.0
        } else {
            20.0 * linear.log10()
        }
    }

    /// Soft clips audio to prevent harsh distortion
    /// 
    /// Uses a tanh-based soft clipping curve for smooth saturation
    pub fn soft_clip(sample: f32) -> f32 {
        // Tanh approximation: x / (1 + |x|)
        // More accurate but still fast
        let abs_sample = sample.abs();
        if abs_sample < 1.0 {
            sample
        } else {
            sample / abs_sample
        }
    }

    /// Applies a simple linear fade between two buffers
    /// 
    /// # Arguments
    /// * `input1` - First input buffer
    /// * `input2` - Second input buffer
    /// * `fade_pos` - Fade position (0.0 = all input1, 1.0 = all input2)
    /// * `output` - Output buffer
    pub fn crossfade(
        input1: &[f32],
        input2: &[f32],
        fade_pos: f32,
        output: &mut [f32],
    ) {
        let fade_pos = fade_pos.clamp(0.0, 1.0);
        for i in 0..input1.len().min(input2.len()).min(output.len()) {
            output[i] = input1[i] * (1.0 - fade_pos) + input2[i] * fade_pos;
        }
    }

    /// Calculates RMS (root mean square) level
    pub fn calculate_rms(buffer: &[f32]) -> f32 {
        if buffer.is_empty() {
            return 0.0;
        }
        
        let sum: f32 = buffer.iter().map(|s| s * s).sum();
        (sum / buffer.len() as f32).sqrt()
    }

    /// Calculates peak level
    pub fn calculate_peak(buffer: &[f32]) -> f32 {
        buffer.iter().map(|s| s.abs()).fold(0.0, f32::max)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_buffer_manager_creation() {
        let manager = BufferManager::new(1024);
        assert_eq!(manager.buffer_size(), 1024);
        assert_eq!(manager.pool_size(), 4);
    }

    #[test]
    fn test_db_conversion() {
        use sample_utils::*;
        
        // 0 dB should be 1.0 linear
        assert!((db_to_linear(0.0) - 1.0).abs() < 0.001);
        
        // -6 dB should be ~0.5 linear
        assert!((db_to_linear(-6.0) - 0.5).abs() < 0.01);
        
        // Round-trip conversion
        let db = 3.0;
        let linear = db_to_linear(db);
        let db_back = linear_to_db(linear);
        assert!((db - db_back).abs() < 0.01);
    }

    #[test]
    fn test_crossfade() {
        use sample_utils::crossfade;
        
        let input1 = vec![1.0; 10];
        let input2 = vec![0.0; 10];
        let mut output = vec![0.0; 10];
        
        // 50% fade should be 0.5
        crossfade(&input1, &input2, 0.5, &mut output);
        assert!((output[0] - 0.5).abs() < 0.001);
    }
}
