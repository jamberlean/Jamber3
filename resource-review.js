/**
 * Resource Review Component for Jamber3
 * Handles user review and acceptance of found resources
 */
class ResourceReview {
    constructor() {
        this.currentSong = null;
        this.currentResults = null;
        this.currentResourceType = null;
        this.reviewModal = null;
        
        this.createReviewModal();
        this.initializeEventListeners();
    }

    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        // Listen for resource finding events
        document.addEventListener('findResource', (e) => {
            this.handleFindResource(e.detail.song, e.detail.resourceType);
        });

        document.addEventListener('findAllResources', (e) => {
            this.handleFindAllResources(e.detail.song);
        });
    }

    /**
     * Create the review modal
     */
    createReviewModal() {
        const modal = document.createElement('div');
        modal.className = 'modal resource-review-modal';
        modal.id = 'resourceReviewModal';
        
        modal.innerHTML = `
            <div class="modal-content resource-review-content">
                <div class="modal-header">
                    <h2 id="reviewModalTitle">Review Found Resources</h2>
                    <span class="close" id="reviewModalClose">&times;</span>
                </div>
                <div class="review-body">
                    <div class="song-info">
                        <h3 id="reviewSongTitle"></h3>
                        <p id="reviewSongArtist"></p>
                    </div>
                    <div class="resource-type-selector">
                        <button class="resource-type-btn active" data-type="guitar_tabs">Guitar Tabs</button>
                        <button class="resource-type-btn" data-type="bass_tabs">Bass Tabs</button>
                        <button class="resource-type-btn" data-type="lyrics">Lyrics</button>
                    </div>
                    <div class="search-progress" id="searchProgress" style="display: none;">
                        <div class="progress-bar-container">
                            <div class="progress-bar" id="searchProgressBar"></div>
                        </div>
                        <p id="searchProgressText">Searching...</p>
                    </div>
                    <div class="results-container" id="resultsContainer">
                        <div class="empty-state">
                            <p>Click "Search" to find resources for this song</p>
                        </div>
                    </div>
                </div>
                <div class="review-actions">
                    <button class="btn-secondary" id="searchBtn">Search</button>
                    <button class="btn-secondary" id="manualEntryBtn">Enter Manually</button>
                    <button class="btn-secondary" id="reviewCancelBtn">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.reviewModal = modal;

        // Attach event listeners to modal elements
        this.attachModalEventListeners();
    }

    /**
     * Attach event listeners to modal elements
     */
    attachModalEventListeners() {
        const modal = this.reviewModal;

        // Close modal
        modal.querySelector('#reviewModalClose').addEventListener('click', () => {
            this.closeReviewModal();
        });

        modal.querySelector('#reviewCancelBtn').addEventListener('click', () => {
            this.closeReviewModal();
        });

        // Resource type selector
        const typeButtons = modal.querySelectorAll('.resource-type-btn');
        typeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchResourceType(btn.dataset.type);
            });
        });

        // Search button
        modal.querySelector('#searchBtn').addEventListener('click', () => {
            this.searchCurrentResourceType();
        });

        // Manual entry button
        modal.querySelector('#manualEntryBtn').addEventListener('click', () => {
            this.showManualEntry();
        });

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeReviewModal();
            }
        });
    }

    /**
     * Handle single resource finding
     * @param {Object} song - Song object
     * @param {string} resourceType - Type of resource to find
     */
    async handleFindResource(song, resourceType) {
        this.currentSong = song;
        this.currentResourceType = resourceType;
        this.currentResults = null;

        this.openReviewModal();
        this.switchResourceType(resourceType);
        await this.searchCurrentResourceType();
    }

    /**
     * Handle finding all resources
     * @param {Object} song - Song object
     */
    async handleFindAllResources(song) {
        this.currentSong = song;
        this.currentResourceType = 'guitar_tabs';
        this.currentResults = null;

        this.openReviewModal();
        
        // Show progress and search all resource types
        await this.searchAllResourceTypes();
    }

    /**
     * Open the review modal
     */
    openReviewModal() {
        if (!this.currentSong) return;

        // Update song info
        document.getElementById('reviewSongTitle').textContent = this.currentSong.title || 'Unknown Title';
        document.getElementById('reviewSongArtist').textContent = 
            (this.currentSong.artist || this.currentSong.extracted_artist || 'Unknown Artist');

        this.reviewModal.style.display = 'block';
    }

    /**
     * Close the review modal
     */
    closeReviewModal() {
        this.reviewModal.style.display = 'none';
        this.currentSong = null;
        this.currentResults = null;
        this.currentResourceType = null;
    }

    /**
     * Switch resource type
     * @param {string} resourceType - Resource type to switch to
     */
    switchResourceType(resourceType) {
        this.currentResourceType = resourceType;

        // Update active button
        const typeButtons = this.reviewModal.querySelectorAll('.resource-type-btn');
        typeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === resourceType);
        });

        // Display results for this type if available
        this.displayResults();
    }

    /**
     * Search for current resource type
     */
    async searchCurrentResourceType() {
        if (!this.currentSong || !this.currentResourceType) return;

        this.showSearchProgress(true);
        
        try {
            // Make API call to find resources
            const response = await fetch(`/api/songs/${this.currentSong.id}/find-resources`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    resourceType: this.currentResourceType
                })
            });

            if (response.ok) {
                const results = await response.json();
                
                if (!this.currentResults) {
                    this.currentResults = {};
                }
                this.currentResults[this.currentResourceType] = results;

                this.displayResults();
            } else {
                const error = await response.json();
                this.showError('Failed to search for resources: ' + error.error);
            }
        } catch (error) {
            console.error('Error searching for resources:', error);
            this.showError('Failed to search for resources. Please try again.');
        } finally {
            this.showSearchProgress(false);
        }
    }

    /**
     * Search all resource types
     */
    async searchAllResourceTypes() {
        if (!this.currentSong) return;

        this.showSearchProgress(true);
        
        try {
            // Make API call to find all resources
            const response = await fetch(`/api/songs/${this.currentSong.id}/find-resources`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({})
            });

            if (response.ok) {
                this.currentResults = await response.json();
                this.displayResults();
            } else {
                const error = await response.json();
                this.showError('Failed to search for resources: ' + error.error);
            }
        } catch (error) {
            console.error('Error searching for all resources:', error);
            this.showError('Failed to search for resources. Please try again.');
        } finally {
            this.showSearchProgress(false);
        }
    }

    /**
     * Display search results
     */
    displayResults() {
        const container = document.getElementById('resultsContainer');
        
        if (!this.currentResults || !this.currentResults[this.currentResourceType]) {
            container.innerHTML = '<div class="empty-state"><p>No results found. Try a different search or enter manually.</p></div>';
            return;
        }

        const results = this.currentResults[this.currentResourceType];
        
        if (results.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No results found. Try entering the URL manually.</p></div>';
            return;
        }

        let html = '<div class="results-list">';
        
        results.forEach((result, index) => {
            const confidencePercentage = Math.round(result.confidence * 100);
            const confidenceClass = result.confidence > 0.7 ? 'high' : result.confidence > 0.4 ? 'medium' : 'low';
            const isManualSearch = result.isManualSearch || false;
            
            html += `
                <div class="result-item ${isManualSearch ? 'manual-search' : ''}" data-index="${index}">
                    <div class="result-header">
                        <h4>${this.escapeHtml(result.title)}</h4>
                        ${result.artist ? `<p class="result-artist">${this.escapeHtml(result.artist)}</p>` : ''}
                        ${!isManualSearch ? `<div class="result-confidence confidence-${confidenceClass}">
                            ${confidencePercentage}% match
                        </div>` : ''}
                    </div>
                    <div class="result-details">
                        <span class="result-source">${result.source}</span>
                        ${result.tabType ? `<span class="result-type">${result.tabType}</span>` : ''}
                        ${result.rating ? `<span class="result-rating">★ ${result.rating}</span>` : ''}
                    </div>
                    <div class="result-url">
                        <input type="text" value="${result.url}" readonly>
                        <button class="btn-copy" onclick="navigator.clipboard.writeText('${result.url}')">Copy</button>
                    </div>
                    <div class="result-actions">
                        ${!isManualSearch ? `<button class="btn-primary accept-btn" data-index="${index}">Accept This</button>` : ''}
                        <button class="btn-secondary preview-btn" data-url="${result.url}">
                            ${isManualSearch ? 'View Website' : 'Preview'}
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;

        // Attach result event listeners
        this.attachResultEventListeners();
    }

    /**
     * Attach event listeners to result items
     */
    attachResultEventListeners() {
        const container = document.getElementById('resultsContainer');

        // Accept buttons
        const acceptButtons = container.querySelectorAll('.accept-btn');
        acceptButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index);
                this.acceptResource(index);
            });
        });

        // Preview buttons
        const previewButtons = container.querySelectorAll('.preview-btn');
        previewButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.dataset.url;
                this.previewResource(url);
            });
        });
    }

    /**
     * Accept a resource
     * @param {number} index - Index of the result to accept
     */
    async acceptResource(index) {
        if (!this.currentResults || !this.currentResults[this.currentResourceType]) return;

        const result = this.currentResults[this.currentResourceType][index];
        if (!result) return;

        try {
            // Update the song with the accepted resource
            const updateData = {};
            updateData[`${this.currentResourceType.slice(0, -1)}_url`] = result.url;
            updateData[`${this.currentResourceType.slice(0, -1)}_verified`] = true;

            // Make API call to update song
            const response = await fetch(`/api/songs/${this.currentSong.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updateData)
            });

            if (response.ok) {
                // Show success message
                this.showSuccess(`${this.getResourceTypeLabel(this.currentResourceType)} added successfully!`);
                
                // Refresh song details if visible
                if (window.songDetails && window.songDetails.getCurrentSong()?.id === this.currentSong.id) {
                    const updatedSong = await response.json();
                    window.songDetails.displaySong(updatedSong);
                }

                // Close modal after short delay
                setTimeout(() => {
                    this.closeReviewModal();
                }, 1500);
            } else {
                const error = await response.json();
                this.showError('Failed to save resource: ' + error.error);
            }
        } catch (error) {
            console.error('Error accepting resource:', error);
            this.showError('Failed to save resource. Please try again.');
        }
    }

    /**
     * Preview a resource URL
     * @param {string} url - URL to preview
     */
    previewResource(url) {
        // Open in new window/tab
        window.open(url, '_blank');
    }


    /**
     * Show manual entry form
     */
    showManualEntry() {
        const resourceLabel = this.getResourceTypeLabel(this.currentResourceType);
        const url = prompt(`Enter ${resourceLabel} URL manually:`);
        
        if (url && url.trim()) {
            this.acceptManualResource(url.trim());
        }
    }

    /**
     * Accept manually entered resource
     * @param {string} url - Manually entered URL
     */
    async acceptManualResource(url) {
        try {
            const updateData = {};
            updateData[`${this.currentResourceType.slice(0, -1)}_url`] = url;
            updateData[`${this.currentResourceType.slice(0, -1)}_verified`] = true;

            const response = await fetch(`/api/songs/${this.currentSong.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updateData)
            });

            if (response.ok) {
                this.showSuccess(`${this.getResourceTypeLabel(this.currentResourceType)} added successfully!`);
                
                // Refresh song details
                if (window.songDetails && window.songDetails.getCurrentSong()?.id === this.currentSong.id) {
                    const updatedSong = await response.json();
                    window.songDetails.displaySong(updatedSong);
                }

                setTimeout(() => {
                    this.closeReviewModal();
                }, 1500);
            } else {
                const error = await response.json();
                this.showError('Failed to save resource: ' + error.error);
            }
        } catch (error) {
            console.error('Error saving manual resource:', error);
            this.showError('Failed to save resource. Please try again.');
        }
    }

    /**
     * Show search progress
     * @param {boolean} show - Whether to show progress
     */
    showSearchProgress(show) {
        const progressDiv = document.getElementById('searchProgress');
        progressDiv.style.display = show ? 'block' : 'none';
        
        if (!show) {
            const progressBar = document.getElementById('searchProgressBar');
            const progressText = document.getElementById('searchProgressText');
            progressBar.style.width = '0%';
            progressText.textContent = 'Searching...';
        }
    }

    /**
     * Update search progress
     * @param {Object} progress - Progress information
     */
    updateSearchProgress(progress) {
        const progressBar = document.getElementById('searchProgressBar');
        const progressText = document.getElementById('searchProgressText');
        
        if (progress.progress !== undefined) {
            progressBar.style.width = `${progress.progress}%`;
        }
        
        if (progress.message) {
            progressText.textContent = progress.message;
        }
    }

    /**
     * Show success message
     * @param {string} message - Success message
     */
    showSuccess(message) {
        // Could use a toast notification system
        alert(message);
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        alert(message);
    }

    /**
     * Get resource type label
     * @param {string} resourceType - Resource type
     * @returns {string} Human-readable label
     */
    getResourceTypeLabel(resourceType) {
        const labels = {
            'guitar_tabs': 'Guitar Tabs',
            'bass_tabs': 'Bass Tabs',
            'lyrics': 'Lyrics'
        };
        return labels[resourceType] || resourceType;
    }

    /**
     * Escape HTML entities
     * @param {string} text - Text to escape
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }
}

// Create global instance
window.resourceReview = new ResourceReview();