/**
 * Embedded Audio Player Component for Jamber3
 * Song-specific audio player with speed control for guitar learning
 */
class EmbeddedAudioPlayer {
    constructor(songId, filePath) {
        this.songId = songId;
        this.filePath = filePath;
        this.howl = null;
        this.isPlaying = false;
        this.volume = 0.8;
        this.speed = 1.0;
        this.pitch = 0;
        this.loopPointA = null;
        this.loopPointB = null;
        this.isLooping = false;
        this.waveformContext = null;
        this.analyser = null;
        
        // DOM elements with song-specific IDs
        this.playBtn = document.getElementById(`playBtn-${songId}`);
        this.pauseBtn = document.getElementById(`pauseBtn-${songId}`);
        this.stopBtn = document.getElementById(`stopBtn-${songId}`);
        this.skipBackBtn = document.getElementById(`skipBackBtn-${songId}`);
        this.skipForwardBtn = document.getElementById(`skipForwardBtn-${songId}`);
        this.volumeSlider = document.getElementById(`volumeSlider-${songId}`);
        this.progressBar = document.getElementById(`progressBar-${songId}`);
        this.progressContainer = document.getElementById(`progressContainer-${songId}`);
        this.timeDisplay = document.getElementById(`timeDisplay-${songId}`);
        this.volumePercent = document.getElementById(`volumePercent-${songId}`);
        this.speedSlider = document.getElementById(`speedSlider-${songId}`);
        this.speedDisplay = document.getElementById(`speedDisplay-${songId}`);
        this.pitchSlider = document.getElementById(`pitchSlider-${songId}`);
        this.pitchDisplay = document.getElementById(`pitchDisplay-${songId}`);
        this.setABtn = document.getElementById(`setABtn-${songId}`);
        this.setBBtn = document.getElementById(`setBBtn-${songId}`);
        this.aPointTime = document.getElementById(`aPointTime-${songId}`);
        this.bPointTime = document.getElementById(`bPointTime-${songId}`);
        this.loopToggleBtn = document.getElementById(`loopToggleBtn-${songId}`);
        this.loopClearBtn = document.getElementById(`loopClearBtn-${songId}`);
        this.waveformCanvas = document.getElementById(`waveformCanvas-${songId}`);
        
        this.progressInterval = null;
        
        this.initializePlayer();
        this.attachEventListeners();
        this.initializeWaveform();
    }

    /**
     * Initialize the Howler.js player
     */
    initializePlayer() {
        if (!this.songId) {
            console.error('No song ID provided for audio player');
            this.showError('No song ID provided');
            return;
        }


        // Use local server endpoint to serve audio files
        const audioSrc = `http://localhost:8081/audio/${this.songId}`;
        

        try {
            this.howl = new Howl({
                src: [audioSrc],
                html5: true, // Use HTML5 audio for local files in Electron
                preload: true,
                volume: this.volume,
                rate: this.speed,
                format: ['mp3', 'm4a', 'wav', 'flac', 'ogg'],
                xhr: {
                    method: 'GET',
                    headers: {},
                    withCredentials: false
                },
                onload: () => {
                    this.updateControls();
                    this.updateTimeDisplay();
                },
                onloadstart: () => {
                },
                onplay: () => {
                    this.isPlaying = true;
                    this.updateControls();
                    this.startProgressUpdates();
                },
                onpause: () => {
                    this.isPlaying = false;
                    this.updateControls();
                    this.stopProgressUpdates();
                },
                onstop: () => {
                    this.isPlaying = false;
                    this.updateControls();
                    this.stopProgressUpdates();
                    this.updateProgress(0);
                },
                onend: () => {
                    this.isPlaying = false;
                    this.updateControls();
                    this.stopProgressUpdates();
                },
                onloaderror: (id, error) => {
                    console.error('Error loading audio. ID:', id, 'Error:', error, 'Source:', audioSrc);
                    this.showError(`Failed to load audio file. Server error: ${error}`);
                },
                onplayerror: (id, error) => {
                    console.error('Error playing audio. ID:', id, 'Error:', error, 'Source:', audioSrc);
                    this.showError(`Failed to play audio file: ${error}`);
                }
            });
            
            
        } catch (error) {
            console.error('Error creating Howl instance:', error);
            this.showError(`Failed to initialize audio player: ${error.message}`);
        }
    }


    /**
     * Attach event listeners
     */
    attachEventListeners() {
        if (this.playBtn) {
            this.playBtn.addEventListener('click', () => this.play());
        }
        
        if (this.pauseBtn) {
            this.pauseBtn.addEventListener('click', () => this.pause());
        }
        
        if (this.stopBtn) {
            this.stopBtn.addEventListener('click', () => this.stop());
        }
        
        if (this.skipBackBtn) {
            this.skipBackBtn.addEventListener('click', () => this.skipBackward(10));
        }
        
        if (this.skipForwardBtn) {
            this.skipForwardBtn.addEventListener('click', () => this.skipForward(10));
        }
        
        if (this.volumeSlider) {
            this.volumeSlider.addEventListener('input', (e) => {
                this.setVolume(parseFloat(e.target.value));
            });
        }

        if (this.progressContainer) {
            this.progressContainer.addEventListener('click', (e) => {
                this.handleProgressBarClick(e);
            });
        }

        if (this.speedSlider) {
            this.speedSlider.addEventListener('input', (e) => {
                this.setSpeed(parseFloat(e.target.value));
            });
        }

        if (this.pitchSlider) {
            this.pitchSlider.addEventListener('input', (e) => {
                this.setPitch(parseInt(e.target.value));
            });
        }

        if (this.setABtn) {
            this.setABtn.addEventListener('click', () => this.setLoopPointA());
        }

        if (this.setBBtn) {
            this.setBBtn.addEventListener('click', () => this.setLoopPointB());
        }

        if (this.loopToggleBtn) {
            this.loopToggleBtn.addEventListener('click', () => this.toggleLoop());
        }

        if (this.loopClearBtn) {
            this.loopClearBtn.addEventListener('click', () => this.clearLoopPoints());
        }

        // Attach speed preset button listeners
        this.attachSpeedPresetListeners();
    }

    /**
     * Attach event listeners to speed preset buttons
     */
    attachSpeedPresetListeners() {
        const presetButtons = document.querySelectorAll(`[data-song-id="${this.songId}"] .speed-preset-btn`);
        presetButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const speed = parseFloat(e.target.dataset.speed);
                this.setSpeed(speed);
            });
        });
    }

    /**
     * Play the current song
     */
    play() {
        if (!this.howl) {
            console.warn('No audio loaded');
            return;
        }

        try {
            this.howl.play();
        } catch (error) {
            console.error('Error playing audio:', error);
            this.showError('Failed to play audio');
        }
    }

    /**
     * Pause playback
     */
    pause() {
        if (!this.howl) return;

        try {
            this.howl.pause();
        } catch (error) {
            console.error('Error pausing audio:', error);
        }
    }

    /**
     * Stop playback
     */
    stop() {
        if (!this.howl) return;

        try {
            this.howl.stop();
        } catch (error) {
            console.error('Error stopping audio:', error);
        }
    }

    /**
     * Set volume level
     * @param {number} level - Volume level (0.0 to 1.0)
     */
    setVolume(level) {
        this.volume = Math.max(0, Math.min(1, level));
        
        if (this.howl) {
            this.howl.volume(this.volume);
        }

        // Update volume slider if it exists
        if (this.volumeSlider) {
            this.volumeSlider.value = this.volume;
        }
        
        this.updateVolumeDisplay();
    }

    /**
     * Set playback speed
     * @param {number} rate - Speed multiplier (0.1 to 4.0)
     */
    setSpeed(rate) {
        this.speed = Math.max(0.1, Math.min(4.0, rate));
        
        if (this.howl) {
            this.howl.rate(this.speed);
        }

        // Update speed slider
        if (this.speedSlider) {
            this.speedSlider.value = this.speed;
        }

        // Update speed display
        this.updateSpeedDisplay();

        // Update preset button states
        this.updateSpeedPresetButtons();

    }

    /**
     * Set pitch shift
     * @param {number} semitones - Pitch shift in semitones (-12 to +12)
     */
    setPitch(semitones) {
        this.pitch = Math.max(-12, Math.min(12, semitones));
        
        // Update pitch slider
        if (this.pitchSlider) {
            this.pitchSlider.value = this.pitch;
        }

        // Update pitch display
        this.updatePitchDisplay();

        // Note: Howler.js doesn't support pitch shifting directly
        // This would require additional audio processing libraries
    }

    /**
     * Update pitch display
     */
    updatePitchDisplay() {
        if (this.pitchDisplay) {
            const sign = this.pitch > 0 ? '+' : '';
            this.pitchDisplay.textContent = `${sign}${this.pitch}`;
        }
    }

    /**
     * Update speed display
     */
    updateSpeedDisplay() {
        if (this.speedDisplay) {
            this.speedDisplay.textContent = `${this.speed.toFixed(2)}x`;
        }
    }

    /**
     * Set loop point A at current playback position
     */
    setLoopPointA() {
        if (!this.howl) return;
        
        this.loopPointA = this.howl.seek();
        this.updateLoopPointDisplay();
    }

    /**
     * Set loop point B at current playback position
     */
    setLoopPointB() {
        if (!this.howl) return;
        
        this.loopPointB = this.howl.seek();
        this.updateLoopPointDisplay();
    }

    /**
     * Toggle A-B loop on/off
     */
    toggleLoop() {
        if (this.loopPointA === null || this.loopPointB === null) {
            console.warn('Both loop points must be set before enabling loop');
            return;
        }

        this.isLooping = !this.isLooping;
        this.updateLoopDisplay();
    }

    /**
     * Clear all loop points and disable looping
     */
    clearLoopPoints() {
        this.loopPointA = null;
        this.loopPointB = null;
        this.isLooping = false;
        this.updateLoopPointDisplay();
        this.updateLoopDisplay();
    }

    /**
     * Update loop point time displays
     */
    updateLoopPointDisplay() {
        if (this.aPointTime) {
            this.aPointTime.textContent = this.loopPointA !== null ? this.formatTime(this.loopPointA) : '--:--';
        }
        if (this.bPointTime) {
            this.bPointTime.textContent = this.loopPointB !== null ? this.formatTime(this.loopPointB) : '--:--';
        }
    }

    /**
     * Update loop status display
     */
    updateLoopDisplay() {
        if (this.loopToggleBtn) {
            const statusSpan = this.loopToggleBtn.querySelector('.loop-status');
            if (statusSpan) {
                statusSpan.textContent = this.isLooping ? 'ON' : 'OFF';
            }
            this.loopToggleBtn.classList.toggle('active', this.isLooping);
        }
    }

    /**
     * Check if we need to loop back to point A
     */
    checkLoopCondition() {
        if (!this.isLooping || !this.howl || this.loopPointA === null || this.loopPointB === null) {
            return;
        }

        const currentTime = this.howl.seek();
        const loopStart = Math.min(this.loopPointA, this.loopPointB);
        const loopEnd = Math.max(this.loopPointA, this.loopPointB);

        if (currentTime >= loopEnd) {
            this.seek(loopStart);
        }
    }

    /**
     * Update speed preset button states
     */
    updateSpeedPresetButtons() {
        const presetButtons = document.querySelectorAll(`[data-song-id="${this.songId}"] .speed-preset-btn`);
        presetButtons.forEach(btn => {
            const btnSpeed = parseFloat(btn.dataset.speed);
            btn.classList.toggle('active', Math.abs(btnSpeed - this.speed) < 0.01);
        });
    }

    /**
     * Seek to position
     * @param {number} position - Position in seconds
     */
    seek(position) {
        if (!this.howl) return;

        try {
            this.howl.seek(position);
            this.updateProgress(position);
        } catch (error) {
            console.error('Error seeking audio:', error);
        }
    }

    /**
     * Handle progress bar click
     * @param {Event} e - Click event
     */
    handleProgressBarClick(e) {
        if (!this.howl || !this.progressContainer) return;

        const rect = this.progressContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;
        const duration = this.howl.duration();
        
        if (duration > 0) {
            const seekTime = duration * percentage;
            this.seek(seekTime);
        }
    }

    /**
     * Handle keyboard shortcuts
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleKeyboardShortcuts(e) {
        // Only handle shortcuts when player is active and no input is focused
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
            return;
        }

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                if (this.isPlaying) {
                    this.pause();
                } else {
                    this.play();
                }
                break;
            case 'Escape':
                this.stop();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.skipBackward(10); // Skip back 10 seconds
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.skipForward(10); // Skip forward 10 seconds
                break;
            case 'Minus':
            case 'NumpadSubtract':
                e.preventDefault();
                this.adjustSpeed(-0.1); // Decrease speed by 0.1x
                break;
            case 'Equal':
            case 'NumpadAdd':
                e.preventDefault();
                this.adjustSpeed(0.1); // Increase speed by 0.1x
                break;
            case 'Digit1':
                e.preventDefault();
                this.setSpeed(0.25); // Very slow
                break;
            case 'Digit2':
                e.preventDefault();
                this.setSpeed(0.5); // Half speed
                break;
            case 'Digit3':
                e.preventDefault();
                this.setSpeed(0.75); // Slow
                break;
            case 'Digit4':
                e.preventDefault();
                this.setSpeed(1.0); // Normal speed
                break;
            case 'Digit5':
                e.preventDefault();
                this.setSpeed(1.25); // Slightly fast
                break;
        }
    }

    /**
     * Skip forward by specified seconds
     * @param {number} seconds - Seconds to skip
     */
    skipForward(seconds) {
        if (!this.howl) return;
        
        const currentTime = this.howl.seek();
        const duration = this.howl.duration();
        const newTime = Math.min(currentTime + seconds, duration);
        
        this.seek(newTime);
    }

    /**
     * Skip backward by specified seconds
     * @param {number} seconds - Seconds to skip
     */
    skipBackward(seconds) {
        if (!this.howl) return;
        
        const currentTime = this.howl.seek();
        const newTime = Math.max(currentTime - seconds, 0);
        
        this.seek(newTime);
    }

    /**
     * Adjust speed by a relative amount
     * @param {number} delta - Amount to change speed by
     */
    adjustSpeed(delta) {
        const newSpeed = this.speed + delta;
        this.setSpeed(newSpeed);
    }

    /**
     * Update time display
     */
    updateTimeDisplay() {
        if (!this.howl) return;
        
        const duration = this.howl.duration();
        if (this.timeDisplay && duration > 0) {
            const current = this.formatTime(0);
            const total = this.formatTime(duration);
            this.timeDisplay.textContent = `${current} / ${total}`;
        }
    }

    /**
     * Update control button states
     */
    updateControls() {
        if (this.playBtn) {
            this.playBtn.disabled = !this.howl || this.isPlaying;
        }

        if (this.pauseBtn) {
            this.pauseBtn.disabled = !this.howl || !this.isPlaying;
        }

        if (this.stopBtn) {
            this.stopBtn.disabled = !this.howl;
        }
    }

    /**
     * Update volume percentage display
     */
    updateVolumeDisplay() {
        if (this.volumePercent) {
            this.volumePercent.textContent = `${Math.round(this.volume * 100)}%`;
        }
    }

    /**
     * Start progress updates
     */
    startProgressUpdates() {
        this.stopProgressUpdates(); // Clear any existing interval
        
        this.progressInterval = setInterval(() => {
            if (this.howl && this.isPlaying) {
                const currentTime = this.howl.seek();
                this.updateProgress(currentTime);
                this.checkLoopCondition();
                this.drawWaveform();
            }
        }, 100); // Update every 100ms for better loop precision
    }

    /**
     * Stop progress updates
     */
    stopProgressUpdates() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    /**
     * Update progress display
     * @param {number} currentTime - Current playback time in seconds
     */
    updateProgress(currentTime) {
        if (!this.howl) return;

        const duration = this.howl.duration();
        
        // Update progress bar
        if (this.progressBar && duration > 0) {
            const percentage = (currentTime / duration) * 100;
            this.progressBar.style.width = `${percentage}%`;
        }

        // Update time display
        if (this.timeDisplay) {
            const current = this.formatTime(currentTime);
            const total = this.formatTime(duration);
            this.timeDisplay.textContent = `${current} / ${total}`;
        }
    }

    /**
     * Format time in MM:SS format
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time string
     */
    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        console.error('Audio Player Error:', message);
        // Could integrate with a notification system later
        if (typeof alert !== 'undefined') {
            alert(`Audio Player Error: ${message}`);
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.stopProgressUpdates();
        
        if (this.howl) {
            this.howl.unload();
            this.howl = null;
        }
        
        this.isPlaying = false;
        this.updateControls();
    }

    /**
     * Destroy the player instance
     */
    destroy() {
        this.cleanup();
        this.songId = null;
        this.filePath = null;
    }

    /**
     * Initialize waveform visualization
     */
    initializeWaveform() {
        if (!this.waveformCanvas) return;
        
        this.waveformContext = this.waveformCanvas.getContext('2d');
        
        // Set canvas size
        this.waveformCanvas.width = this.waveformCanvas.offsetWidth || 400;
        this.waveformCanvas.height = 60;
        
        // Draw initial empty waveform
        this.drawEmptyWaveform();
    }

    /**
     * Draw empty waveform placeholder
     */
    drawEmptyWaveform() {
        if (!this.waveformContext) return;
        
        const canvas = this.waveformCanvas;
        const ctx = this.waveformContext;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#e9ecef';
        ctx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2);
        
        // Add centered text
        ctx.fillStyle = '#6c757d';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Waveform visualization (simplified)', canvas.width / 2, canvas.height / 2 + 15);
    }

    /**
     * Draw simple animated waveform
     */
    drawWaveform() {
        if (!this.waveformContext || !this.isPlaying) {
            return;
        }
        
        const canvas = this.waveformCanvas;
        const ctx = this.waveformContext;
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;
        
        ctx.clearRect(0, 0, width, height);
        
        // Draw background line
        ctx.fillStyle = '#e9ecef';
        ctx.fillRect(0, centerY - 1, width, 2);
        
        // Draw animated waveform bars
        ctx.fillStyle = '#667eea';
        const barWidth = 2;
        const barSpacing = 4;
        const numBars = Math.floor(width / (barWidth + barSpacing));
        
        for (let i = 0; i < numBars; i++) {
            const x = i * (barWidth + barSpacing);
            // Create pseudo-random waveform based on time and position
            const time = Date.now() / 1000;
            const wave = Math.sin(time * 2 + i * 0.5) * Math.sin(time * 0.3 + i * 0.1);
            const barHeight = Math.abs(wave) * (height / 2 - 5);
            
            ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
        }
        
        // Draw progress indicator
        if (this.howl) {
            const duration = this.howl.duration();
            const currentTime = this.howl.seek();
            if (duration > 0) {
                const progress = currentTime / duration;
                const progressX = progress * width;
                
                ctx.fillStyle = '#ff6b6b';
                ctx.fillRect(progressX - 1, 0, 2, height);
            }
        }
    }

    /**
     * Get current playback state
     * @returns {Object} Player state information
     */
    getState() {
        return {
            isLoaded: !!this.howl,
            isPlaying: this.isPlaying,
            songId: this.songId,
            currentTime: this.howl ? this.howl.seek() : 0,
            duration: this.howl ? this.howl.duration() : 0,
            volume: this.volume,
            speed: this.speed
        };
    }
}