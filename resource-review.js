/**
 * Resource Review Component for Jamber3
 * Three separate dialogs for Guitar Tabs, Bass Tabs, and Lyrics
 */
class ResourceReview {
    constructor() {
        this.currentSong = null;
        this.currentResults = {};
        
        // Create three separate dialog instances
        this.guitarTabModal = null;
        this.bassTabModal = null;
        this.lyricsModal = null;
        this.lyricsPopup = null;
        
        this.createDialogs();
        this.initializeEventListeners();
    }

    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        // Listen for individual resource finding events
        document.addEventListener('findGuitarTabs', (e) => {
            this.handleFindResource('guitar_tabs', e.detail.song);
        });

        document.addEventListener('findBassTabs', (e) => {
            this.handleFindResource('bass_tabs', e.detail.song);
        });

        document.addEventListener('findLyrics', (e) => {
            this.handleFindResource('lyrics', e.detail.song);
        });

        // Listen for lyrics display event
        document.addEventListener('showLyrics', (e) => {
            this.showLyricsPopup(e.detail.song);
        });
    }

    /**
     * Create all three resource dialogs
     */
    createDialogs() {
        this.guitarTabModal = this.createResourceModal('guitarTab', 'Guitar Tabs', 'guitar_tabs');
        this.bassTabModal = this.createResourceModal('bassTab', 'Bass Tabs', 'bass_tabs');
        this.lyricsModal = this.createResourceModal('lyrics', 'Lyrics', 'lyrics');
        this.lyricsPopup = this.createLyricsPopup();
    }

    /**
     * Create a resource modal for a specific type
     */
    createResourceModal(modalId, title, resourceType) {
        const modal = document.createElement('div');
        modal.className = 'modal resource-review-modal';
        modal.id = `${modalId}ReviewModal`;
        
        modal.innerHTML = `
            <div class="modal-content resource-review-content">
                <div class="modal-header">
                    <h2>${title} for <span class="song-title"></span></h2>
                    <span class="close" data-modal="${modalId}">&times;</span>
                </div>
                <div class="review-body">
                    <div class="search-progress" style="display: none;">
                        <div class="progress-bar-container">
                            <div class="progress-bar"></div>
                        </div>
                        <p class="progress-text">Searching...</p>
                    </div>
                    <div class="results-container">
                        <div class="empty-state">
                            <p>Searching for ${title.toLowerCase()}...</p>
                        </div>
                    </div>
                    <div class="manual-entry">
                        <input type="text" class="manual-url-input" placeholder="Found a favorite source? Paste it here!" />
                        <button class="save-manual-btn">Save</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.attachModalEventListeners(modal, modalId, resourceType);
        return modal;
    }

    /**
     * Create lyrics display popup
     */
    createLyricsPopup() {
        const popup = document.createElement('div');
        popup.className = 'modal lyrics-popup-modal';
        popup.id = 'lyricsPopup';
        
        popup.innerHTML = `
            <div class="modal-content lyrics-popup-content">
                <div class="modal-header">
                    <h2>Lyrics - <span class="song-title"></span></h2>
                    <span class="close" data-modal="lyrics-popup">&times;</span>
                </div>
                <div class="lyrics-body">
                    <div class="lyrics-content"></div>
                </div>
            </div>
        `;

        document.body.appendChild(popup);
        this.attachLyricsPopupListeners(popup);
        return popup;
    }

    /**
     * Attach event listeners to a resource modal
     */
    attachModalEventListeners(modal, modalId, resourceType) {
        // Close button
        const closeBtn = modal.querySelector('.close');
        closeBtn.addEventListener('click', () => {
            this.closeModal(modal);
        });

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        });

        // Manual entry save button
        const saveBtn = modal.querySelector('.save-manual-btn');
        const urlInput = modal.querySelector('.manual-url-input');
        
        saveBtn.addEventListener('click', async () => {
            const url = urlInput.value.trim();
            if (url) {
                await this.saveManualResource(resourceType, url);
                this.closeModal(modal);
            }
        });

        // Enter key in input field
        urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveBtn.click();
            }
        });

    }

    /**
     * Attach event listeners to lyrics popup
     */
    attachLyricsPopupListeners(popup) {
        // Close button
        const closeBtn = popup.querySelector('.close');
        closeBtn.addEventListener('click', () => {
            popup.style.display = 'none';
        });

        // Click outside to close
        popup.addEventListener('click', (e) => {
            if (e.target === popup) {
                popup.style.display = 'none';
            }
        });
    }

    /**
     * Handle resource finding for a specific type
     */
    async handleFindResource(resourceType, song) {
        this.currentSong = song;
        
        const modal = this.getModalForResourceType(resourceType);
        this.openModal(modal, song);
        await this.searchResourceType(resourceType);
    }

    /**
     * Show lyrics popup with text content
     */
    showLyricsPopup(song) {
        if (!song.lyrics_content) {
            return;
        }

        const popup = this.lyricsPopup;
        const songTitle = popup.querySelector('.song-title');
        const lyricsContent = popup.querySelector('.lyrics-content');

        // Set song title
        const artist = song.artist || song.extracted_artist || '';
        songTitle.textContent = artist ? `${song.title} - ${artist}` : song.title;

        // Set lyrics content with preserved line breaks
        lyricsContent.textContent = song.lyrics_content;
        lyricsContent.style.whiteSpace = 'pre-wrap';

        // Show popup
        popup.style.display = 'block';

        // Dynamic sizing
        this.resizeLyricsPopup(popup);
    }

    /**
     * Resize lyrics popup to fit content
     */
    resizeLyricsPopup(popup) {
        const content = popup.querySelector('.modal-content');
        const lyricsBody = popup.querySelector('.lyrics-body');
        
        // Reset size
        content.style.width = 'auto';
        content.style.height = 'auto';
        
        // Get content dimensions
        const textHeight = lyricsBody.scrollHeight + 100; // Add padding for header
        const textWidth = Math.max(600, Math.min(1200, lyricsBody.scrollWidth + 100));
        
        // Set size with limits
        const maxHeight = window.innerHeight * 0.8;
        const maxWidth = window.innerWidth * 0.8;
        
        content.style.width = Math.min(textWidth, maxWidth) + 'px';
        content.style.height = Math.min(textHeight, maxHeight) + 'px';
        
        // Enable scrolling if needed
        lyricsBody.style.overflow = textHeight > maxHeight ? 'auto' : 'visible';
    }

    /**
     * Get modal for resource type
     */
    getModalForResourceType(resourceType) {
        switch (resourceType) {
            case 'guitar_tabs': return this.guitarTabModal;
            case 'bass_tabs': return this.bassTabModal;
            case 'lyrics': return this.lyricsModal;
            default: return this.guitarTabModal;
        }
    }

    /**
     * Open a modal
     */
    openModal(modal, song) {
        const songTitle = modal.querySelector('.song-title');
        const artist = song.artist || song.extracted_artist || '';
        songTitle.textContent = artist ? `${song.title} - ${artist}` : song.title;
        
        // Clear previous results
        const resultsContainer = modal.querySelector('.results-container');
        resultsContainer.innerHTML = '<div class="empty-state"><p>Searching...</p></div>';
        
        // Clear manual input
        const urlInput = modal.querySelector('.manual-url-input');
        urlInput.value = '';
        
        modal.style.display = 'block';
    }

    /**
     * Close a modal
     */
    closeModal(modal) {
        modal.style.display = 'none';
    }

    /**
     * Search for resources of a specific type
     */
    async searchResourceType(resourceType) {
        if (!this.currentSong) return;

        const modal = this.getModalForResourceType(resourceType);
        this.showSearchProgress(modal, true);
        
        try {
            // Make API call to find resources
            const response = await fetch(`/api/songs/${this.currentSong.id}/find-resources`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    resourceType: resourceType
                })
            });

            if (response.ok) {
                const results = await response.json();
                this.currentResults[resourceType] = results;
                this.displayResults(modal, resourceType, results);
            } else {
                const error = await response.json();
                this.showError(modal, 'Failed to search for resources: ' + error.error);
            }
        } catch (error) {
            console.error('Error searching for resources:', error);
            this.showError(modal, 'Failed to search for resources. Please try again.');
        } finally {
            this.showSearchProgress(modal, false);
        }
    }

    /**
     * Display search results in modal
     */
    displayResults(modal, resourceType, results) {
        const container = modal.querySelector('.results-container');
        
        if (!results || results.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No results found. Try entering the URL manually below.</p></div>';
            return;
        }

        let html = '<div class="results-list">';
        
        results.forEach((result, index) => {
            const confidencePercentage = Math.round(result.confidence * 100);
            const confidenceClass = result.confidence > 0.7 ? 'high' : result.confidence > 0.4 ? 'medium' : 'low';
            
            html += `
                <div class="result-item" data-index="${index}">
                    <div class="result-header">
                        <h4>${this.escapeHtml(result.title)}</h4>
                        ${result.artist ? `<p class="result-artist">${this.escapeHtml(result.artist)}</p>` : ''}
                        <div class="result-confidence confidence-${confidenceClass}">
                            ${confidencePercentage}% match
                        </div>
                    </div>
                    <div class="result-details">
                        <span class="result-source">${result.source}</span>
                        ${result.tabType ? `<span class="result-type">${result.tabType}</span>` : ''}
                        ${result.rating ? `<span class="result-rating">★ ${result.rating}</span>` : ''}
                    </div>
                    <div class="result-url">
                        <input type="text" value="${result.url}" readonly>
                        <span class="url-display">${result.url}</span>
                    </div>
                    <div class="result-actions">
                        <button class="btn-secondary preview-btn" data-url="${result.url}">View Website</button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;

        // Attach result event listeners
        this.attachResultEventListeners(modal, resourceType);
    }

    /**
     * Attach event listeners to result items
     */
    attachResultEventListeners(modal, resourceType) {
        const container = modal.querySelector('.results-container');

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
     * Save manual resource URL
     */
    async saveManualResource(resourceType, url) {
        const fieldName = resourceType === 'guitar_tabs' ? 'guitar_tab_url' :
                         resourceType === 'bass_tabs' ? 'bass_tab_url' : 'lyrics_url';
        
        await this.saveResourceUrl(fieldName, url);
    }

    /**
     * Save resource URL to database
     */
    async saveResourceUrl(fieldName, url) {
        try {
            if (!this.currentSong) {
                throw new Error('No current song available');
            }

            console.log('Saving resource URL:', {
                songId: this.currentSong.id,
                fieldName,
                url,
                currentSong: this.currentSong
            });

            // First, try to fetch the complete song data from the server
            const songResponse = await fetch(`/api/songs/${this.currentSong.id}`);
            let fullSong = null;
            let isNewSong = false;
            
            if (songResponse.ok) {
                // Song exists, we'll update it
                fullSong = await songResponse.json();
                console.log('Song exists in database, will update:', fullSong);
            } else {
                // Song doesn't exist, we'll create it
                isNewSong = true;
                console.log('Song not found in database, will create new entry for ID:', this.currentSong.id);
            }

            // Build the song data
            const songData = {
                id: isNewSong ? undefined : this.currentSong.id, // Include ID for PUT, exclude for POST
                title: fullSong?.title || this.currentSong.title || 'Unknown Title',
                artist: fullSong?.artist || this.currentSong.artist || '',
                album: fullSong?.album || this.currentSong.album || '',
                lyrics_content: fullSong?.lyrics_content || '',
                tablature_url: fullSong?.tablature_url || '',
                guitar_tab_url: fullSong?.guitar_tab_url || '',
                bass_tab_url: fullSong?.bass_tab_url || '',
                lyrics_url: fullSong?.lyrics_url || '',
                youtube_url: fullSong?.youtube_url || '',
                // Add any other fields from currentSong that might be needed
                file_path: fullSong?.file_path || this.currentSong.file_path || '',
                file_name: fullSong?.file_name || this.currentSong.file_name || ''
            };
            
            // Update the specific field
            songData[fieldName] = url;
            songData[fieldName.replace('_url', '_verified')] = true;

            console.log('Song data being sent:', songData);

            // Use POST for new songs, PUT for existing ones
            const response = await fetch(
                isNewSong ? '/api/songs' : `/api/songs/${this.currentSong.id}`,
                {
                    method: isNewSong ? 'POST' : 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(songData)
                }
            );

            if (response.ok) {
                this.showSuccess('Resource added successfully!');
                
                // Refresh song details if visible
                if (window.songDetails && window.songDetails.getCurrentSong()?.id === this.currentSong.id) {
                    const updatedSong = await response.json();
                    window.songDetails.displaySong(updatedSong);
                }
                
                // Refresh the song list in case the resource status changed
                if (window.jamber3App) {
                    window.jamber3App.loadSongs();
                }
            } else {
                const error = await response.json();
                this.showError(null, 'Failed to save resource: ' + error.error);
            }
        } catch (error) {
            console.error('Error saving resource:', error);
            this.showError(null, 'Failed to save resource. Please try again.');
        }
    }

    /**
     * Preview a resource URL in default browser
     */
    previewResource(url) {
        // For Electron app, use shell.openExternal to open in default browser
        if (typeof require !== 'undefined') {
            try {
                const { shell } = require('electron');
                shell.openExternal(url);
            } catch (e) {
                // Fallback to window.open if Electron not available
                window.open(url, '_blank');
            }
        } else {
            // Regular browser environment
            window.open(url, '_blank');
        }
    }

    /**
     * Show/hide search progress
     */
    showSearchProgress(modal, show) {
        const progressDiv = modal.querySelector('.search-progress');
        progressDiv.style.display = show ? 'block' : 'none';
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        // Simple alert for now - could be replaced with toast notification
        alert(message);
    }

    /**
     * Show error message
     */
    showError(modal, message) {
        if (modal) {
            const container = modal.querySelector('.results-container');
            container.innerHTML = `<div class="error-state"><p class="error">${message}</p></div>`;
        } else {
            alert(message);
        }
    }

    /**
     * Escape HTML entities
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }
}

// Create global instance
window.resourceReview = new ResourceReview();