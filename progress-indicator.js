/**
 * Progress Indicator Component for Jamber3
 * Handles animated progress displays for long-running operations
 */
class ProgressIndicator {
    constructor() {
        this.activeIndicators = new Map();
        this.createProgressStyles();
    }

    /**
     * Create CSS styles for progress indicators
     */
    createProgressStyles() {
        // Check if styles already exist
        if (document.getElementById('progress-indicator-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'progress-indicator-styles';
        style.textContent = `
            .progress-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                backdrop-filter: blur(2px);
            }

            .progress-container {
                background: white;
                padding: 30px;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                min-width: 400px;
                max-width: 600px;
                text-align: center;
            }

            .progress-title {
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 10px;
                color: #333;
            }

            .progress-message {
                font-size: 14px;
                color: #666;
                margin-bottom: 20px;
                min-height: 20px;
                word-wrap: break-word;
            }

            .progress-bar-container {
                background: #f0f0f0;
                border-radius: 8px;
                height: 8px;
                margin-bottom: 15px;
                overflow: hidden;
                position: relative;
            }

            .progress-bar {
                background: linear-gradient(90deg, #3498db, #2980b9);
                height: 100%;
                border-radius: 8px;
                transition: width 0.3s ease;
                position: relative;
            }

            .progress-bar.indeterminate {
                width: 30% !important;
                animation: indeterminate 2s infinite linear;
            }

            @keyframes indeterminate {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(400%); }
            }

            .progress-percentage {
                font-size: 14px;
                font-weight: 600;
                color: #333;
                margin-bottom: 10px;
            }

            .progress-details {
                font-size: 12px;
                color: #888;
                margin-top: 10px;
            }

            .progress-spinner {
                border: 3px solid #f3f3f3;
                border-top: 3px solid #3498db;
                border-radius: 50%;
                width: 30px;
                height: 30px;
                animation: spin 1s linear infinite;
                margin: 0 auto 15px;
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            .progress-cancel-btn {
                background: #e74c3c;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                margin-top: 15px;
                transition: background 0.2s;
            }

            .progress-cancel-btn:hover {
                background: #c0392b;
            }

            .progress-phase-indicator {
                display: flex;
                justify-content: space-between;
                margin-bottom: 15px;
                font-size: 12px;
            }

            .phase-step {
                padding: 4px 8px;
                border-radius: 4px;
                background: #f8f9fa;
                color: #6c757d;
                transition: all 0.3s;
            }

            .phase-step.active {
                background: #3498db;
                color: white;
            }

            .phase-step.completed {
                background: #27ae60;
                color: white;
            }

            /* Compact progress indicator for smaller operations */
            .progress-compact {
                position: fixed;
                top: 20px;
                right: 20px;
                background: white;
                padding: 15px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                min-width: 250px;
                z-index: 9999;
                border-left: 4px solid #3498db;
            }

            .progress-compact .progress-title {
                font-size: 14px;
                margin-bottom: 5px;
            }

            .progress-compact .progress-message {
                font-size: 12px;
                margin-bottom: 10px;
            }

            .progress-compact .progress-bar-container {
                height: 4px;
                margin-bottom: 5px;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Show progress indicator
     * @param {string} id - Unique identifier for this progress
     * @param {Object} options - Progress options
     */
    show(id, options = {}) {
        const defaults = {
            title: 'Processing...',
            message: 'Please wait...',
            showProgress: true,
            showPercentage: true,
            cancellable: false,
            compact: false,
            phases: null, // Array of phase names
            onCancel: null
        };

        const config = { ...defaults, ...options };
        
        // Remove existing indicator with same ID
        this.hide(id);

        const overlay = this.createProgressElement(id, config);
        document.body.appendChild(overlay);

        this.activeIndicators.set(id, {
            element: overlay,
            config: config,
            startTime: Date.now()
        });

        return id;
    }

    /**
     * Create progress DOM element
     * @param {string} id - Progress ID
     * @param {Object} config - Progress configuration
     * @returns {HTMLElement} Progress element
     */
    createProgressElement(id, config) {
        const overlay = document.createElement('div');
        overlay.className = config.compact ? 'progress-compact' : 'progress-overlay';
        overlay.id = `progress-${id}`;

        const container = document.createElement('div');
        if (!config.compact) {
            container.className = 'progress-container';
        }

        let html = `
            <div class="progress-title">${config.title}</div>
            <div class="progress-message">${config.message}</div>
        `;

        // Add phase indicator if phases are provided
        if (config.phases && config.phases.length > 0) {
            html += '<div class="progress-phase-indicator">';
            config.phases.forEach((phase, index) => {
                html += `<div class="phase-step" data-phase="${index}">${phase}</div>`;
            });
            html += '</div>';
        }

        // Add spinner for indeterminate progress
        if (!config.showProgress) {
            html += '<div class="progress-spinner"></div>';
        }

        // Add progress bar
        if (config.showProgress) {
            html += `
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: 0%"></div>
                </div>
            `;

            if (config.showPercentage) {
                html += '<div class="progress-percentage">0%</div>';
            }
        }

        html += '<div class="progress-details"></div>';

        // Add cancel button
        if (config.cancellable) {
            html += '<button class="progress-cancel-btn">Cancel</button>';
        }

        container.innerHTML = html;

        if (config.compact) {
            overlay.appendChild(container);
        } else {
            overlay.appendChild(container);
        }

        // Add event listeners
        if (config.cancellable) {
            const cancelBtn = container.querySelector('.progress-cancel-btn');
            cancelBtn.addEventListener('click', () => {
                if (config.onCancel) {
                    config.onCancel();
                }
                this.hide(id);
            });
        }

        return overlay;
    }

    /**
     * Update progress
     * @param {string} id - Progress ID
     * @param {Object} update - Update data
     */
    update(id, update = {}) {
        const indicator = this.activeIndicators.get(id);
        if (!indicator) return;

        const element = indicator.element;

        // Update message
        if (update.message !== undefined) {
            const messageEl = element.querySelector('.progress-message');
            if (messageEl) {
                messageEl.textContent = update.message;
            }
        }

        // Update progress
        if (update.progress !== undefined) {
            const progressBar = element.querySelector('.progress-bar');
            const percentageEl = element.querySelector('.progress-percentage');
            
            if (progressBar) {
                const percentage = Math.min(100, Math.max(0, update.progress));
                progressBar.style.width = `${percentage}%`;
                progressBar.classList.remove('indeterminate');
                
                if (percentageEl) {
                    percentageEl.textContent = `${Math.round(percentage)}%`;
                }
            }
        }

        // Update phase
        if (update.phase !== undefined && indicator.config.phases) {
            const phaseSteps = element.querySelectorAll('.phase-step');
            phaseSteps.forEach((step, index) => {
                step.classList.remove('active', 'completed');
                if (index < update.phase) {
                    step.classList.add('completed');
                } else if (index === update.phase) {
                    step.classList.add('active');
                }
            });
        }

        // Update details
        if (update.details !== undefined) {
            const detailsEl = element.querySelector('.progress-details');
            if (detailsEl) {
                detailsEl.textContent = update.details;
            }
        }

        // Add elapsed time if requested
        if (update.showElapsed) {
            const elapsed = Date.now() - indicator.startTime;
            const seconds = Math.floor(elapsed / 1000);
            const detailsEl = element.querySelector('.progress-details');
            if (detailsEl) {
                detailsEl.textContent = `Elapsed: ${seconds}s`;
            }
        }
    }

    /**
     * Set progress to indeterminate state
     * @param {string} id - Progress ID
     */
    setIndeterminate(id) {
        const indicator = this.activeIndicators.get(id);
        if (!indicator) return;

        const progressBar = indicator.element.querySelector('.progress-bar');
        if (progressBar) {
            progressBar.classList.add('indeterminate');
        }

        const percentageEl = indicator.element.querySelector('.progress-percentage');
        if (percentageEl) {
            percentageEl.textContent = '';
        }
    }

    /**
     * Hide progress indicator
     * @param {string} id - Progress ID
     */
    hide(id) {
        const indicator = this.activeIndicators.get(id);
        if (!indicator) return;

        const element = indicator.element;
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }

        this.activeIndicators.delete(id);
    }

    /**
     * Hide all progress indicators
     */
    hideAll() {
        for (const id of this.activeIndicators.keys()) {
            this.hide(id);
        }
    }

    /**
     * Check if a progress indicator is active
     * @param {string} id - Progress ID
     * @returns {boolean} True if active
     */
    isActive(id) {
        return this.activeIndicators.has(id);
    }

    /**
     * Get list of active progress IDs
     * @returns {string[]} Array of active progress IDs
     */
    getActiveIds() {
        return Array.from(this.activeIndicators.keys());
    }

    /**
     * Show a simple notification-style progress for quick operations
     * @param {string} message - Message to show
     * @param {number} duration - Duration in milliseconds (default: 3000)
     * @returns {string} Progress ID
     */
    showNotification(message, duration = 3000) {
        const id = `notification-${Date.now()}`;
        
        this.show(id, {
            title: '',
            message: message,
            showProgress: false,
            compact: true,
            cancellable: false
        });

        // Auto-hide after duration
        setTimeout(() => {
            this.hide(id);
        }, duration);

        return id;
    }

    /**
     * Show progress for a Promise with automatic updates
     * @param {Promise} promise - Promise to track
     * @param {Object} options - Progress options
     * @returns {Promise} Original promise
     */
    async trackPromise(promise, options = {}) {
        const id = `promise-${Date.now()}`;
        
        this.show(id, {
            title: 'Processing...',
            ...options,
            showProgress: false
        });

        try {
            const result = await promise;
            this.hide(id);
            return result;
        } catch (error) {
            this.hide(id);
            throw error;
        }
    }
}

// Create global instance
window.progressIndicator = new ProgressIndicator();