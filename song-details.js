/**
 * Song Details Component for Jamber3
 * Handles the display of detailed song information in the right pane
 */
class SongDetails {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentSong = null;
        this.isEditMode = false;
        this.originalSongData = null;
        
        this.initializeEventListeners();
    }

    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        // Listen for song selection events
        document.addEventListener('songSelected', (e) => {
            try {
                this.displaySong(e.detail.song);
            } catch (error) {
                if (window.ErrorLogger) {
                    window.ErrorLogger.logSongDetailsError('songSelected', error, {
                        songId: e.detail?.song?.id,
                        songTitle: e.detail?.song?.title,
                        songArtist: e.detail?.song?.artist
                    });
                }
                console.error('Error in song selection:', error);
                this.renderErrorState('Failed to display song details');
            }
        });
    }

    /**
     * Display song details
     * @param {Object} song - Song object to display
     */
    displaySong(song) {
        try {
            // Don't re-render if it's the same song
            if (this.currentSong && this.currentSong.id === song.id) {
                return;
            }
            
            // Reset edit mode when switching to a different song
            if (this.isEditMode) {
                this.isEditMode = false;
                this.originalSongData = null;
            }
            
            this.currentSong = song;
            
            if (!song) {
                this.renderEmptyState();
                return;
            }

            this.render(song);
        } catch (error) {
            if (window.ErrorLogger) {
                window.ErrorLogger.logSongDetailsError('displaySong', error, {
                    songId: song?.id,
                    songTitle: song?.title,
                    songArtist: song?.artist,
                    songFilePath: song?.file_path
                });
            }
            console.error('Error displaying song:', error);
            this.renderErrorState('Failed to render song details');
        }
    }

    /**
     * Render empty state
     */
    renderEmptyState() {
        this.container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📄</div>
                <h4>No Song Selected</h4>
                <p>Select a song from the library to view details</p>
            </div>
        `;
    }

    /**
     * Render error state
     * @param {string} message - Error message to display
     */
    renderErrorState(message) {
        this.container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <h4>Error Loading Song</h4>
                <p>${message}</p>
                <p><small>Error details logged to errors.log</small></p>
            </div>
        `;
    }

    /**
     * Render song details
     * @param {Object} song - Song object
     */
    render(song) {
        const html = `
            <div class="song-details-content">
                ${this.renderBasicInfo(song)}
                ${this.renderFileInfo(song)}
                ${this.renderMetadata(song)}
                ${this.renderResources(song)}
                ${this.renderSetlists(song)}
                ${this.renderActions(song)}
            </div>
        `;
        
        // Use input state preservation during DOM manipulation
        if (window.InputStateManager) {
            window.InputStateManager.preserveInputState(() => {
                this.container.innerHTML = html;
            });
        } else {
            this.container.innerHTML = html;
        }
        this.attachEventListeners();
        
        // Load setlists for this song
        this.loadSongSetlists(song);
        
        // Initialize embedded audio player with error handling
        setTimeout(async () => {
            try {
                await this.initializeEmbeddedPlayer();
            } catch (playerInitError) {
                console.error('Failed to initialize audio player after render:', playerInitError);
                if (window.ErrorLogger) {
                    window.ErrorLogger.logSongDetailsError('renderPlayerInit', playerInitError, {
                        songId: song?.id,
                        songTitle: song?.title
                    });
                }
            }
        }, 100);
    }

    /**
     * Render edit mode
     * @param {Object} song - Song object
     */
    renderEditMode(song) {
        const html = `
            <div class="song-details-content edit-form">
                ${this.renderEditBasicInfo(song)}
                ${this.renderFileInfo(song)}
                ${this.renderEditMetadata(song)}
                ${this.renderEditResources(song)}
                ${this.renderEditActions(song)}
            </div>
        `;
        
        // Use input state preservation during DOM manipulation
        if (window.InputStateManager) {
            window.InputStateManager.preserveInputState(() => {
                this.container.innerHTML = html;
            });
        } else {
            this.container.innerHTML = html;
        }
        this.attachEventListeners();
    }

    /**
     * Render basic song information
     * @param {Object} song - Song object
     */
    renderBasicInfo(song) {
        const title = song.title || 'Unknown Title';
        const artist = song.artist || song.extracted_artist || '';
        const album = song.album || '';
        
        return `
            <div class="detail-section">
                <h4>Song Information</h4>
                <div class="song-header">
                    <h2 class="song-title">${this.escapeHtml(title)}</h2>
                    ${artist ? `<p class="song-artist">by ${this.escapeHtml(artist)}</p>` : ''}
                    ${album ? `<p class="song-album">from "${this.escapeHtml(album)}"</p>` : ''}
                </div>
                
                <div class="detail-grid">
                    <span class="detail-label">Title:</span>
                    <span class="detail-value">${this.escapeHtml(title)}</span>
                    
                    <span class="detail-label">Artist:</span>
                    <span class="detail-value ${artist ? '' : 'missing'}">${this.escapeHtml(artist) || 'Not specified'}</span>
                    
                    <span class="detail-label">Album:</span>
                    <span class="detail-value ${album ? '' : 'missing'}">${this.escapeHtml(album) || 'Not specified'}</span>
                </div>
            </div>
        `;
    }

    /**
     * Render file information
     * @param {Object} song - Song object
     */
    renderFileInfo(song) {
        const fileSize = song.file_size ? this.formatFileSize(song.file_size) : 'Unknown';
        const duration = song.duration ? this.formatDuration(song.duration) : 'Unknown';
        const format = song.format || 'Unknown';
        const bitrate = song.bitrate ? `${song.bitrate} kbps` : 'Unknown';
        
        return `
            <div class="detail-section collapsible-section">
                <h4 class="collapsible-header" data-target="file-info">
                    <span class="collapse-icon">▶</span>
                    File Information
                </h4>
                <div class="collapsible-content collapsed" id="file-info">
                    <div class="detail-grid">
                        <span class="detail-label">Filename:</span>
                        <span class="detail-value" title="${this.escapeHtml(song.file_path || '')}">${this.escapeHtml(song.file_name || 'Unknown')}</span>
                        
                        <span class="detail-label">Location:</span>
                        <span class="detail-value file-path" title="${this.escapeHtml(song.file_path || '')}">${this.escapeHtml(this.getDirectoryPath(song.file_path))}</span>
                        
                        <span class="detail-label">Format:</span>
                        <span class="detail-value">${format.toUpperCase()}</span>
                        
                        <span class="detail-label">File Size:</span>
                        <span class="detail-value">${fileSize}</span>
                        
                        <span class="detail-label">Duration:</span>
                        <span class="detail-value">${duration}</span>
                        
                        <span class="detail-label">Bitrate:</span>
                        <span class="detail-value">${bitrate}</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render metadata information
     * @param {Object} song - Song object
     */
    renderMetadata(song) {
        const metadataSource = this.getMetadataSourceDescription(song.metadata_source);
        const addedDate = song.added_at ? new Date(song.added_at).toLocaleDateString() : 'Unknown';
        const lastScanned = song.last_scanned ? new Date(song.last_scanned).toLocaleDateString() : 'Never';
        
        return `
            <div class="detail-section collapsible-section">
                <h4 class="collapsible-header" data-target="metadata-info">
                    <span class="collapse-icon">▶</span>
                    Metadata
                </h4>
                <div class="collapsible-content collapsed" id="metadata-info">
                    <div class="detail-grid">
                        <span class="detail-label">Source:</span>
                        <span class="detail-value">${metadataSource}</span>
                        
                        <span class="detail-label">Extracted Title:</span>
                        <span class="detail-value ${song.extracted_title ? '' : 'missing'}">${this.escapeHtml(song.extracted_title) || 'Not extracted'}</span>
                        
                        <span class="detail-label">Extracted Artist:</span>
                        <span class="detail-value ${song.extracted_artist ? '' : 'missing'}">${this.escapeHtml(song.extracted_artist) || 'Not extracted'}</span>
                        
                        <span class="detail-label">Added:</span>
                        <span class="detail-value">${addedDate}</span>
                        
                        <span class="detail-label">Last Scanned:</span>
                        <span class="detail-value">${lastScanned}</span>
                        
                        <span class="detail-label">User Edited:</span>
                        <span class="detail-value">${song.user_edited ? 'Yes' : 'No'}</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render resource links
     * @param {Object} song - Song object
     */
    renderResources(song) {
        const resources = [
            {
                type: 'guitar_tabs',
                label: 'Guitar Tabs',
                icon: '🎸',
                url: song.guitar_tab_url,
                verified: song.guitar_tab_verified
            },
            {
                type: 'bass_tabs',
                label: 'Bass Tabs',
                icon: '🎸',
                url: song.bass_tab_url,
                verified: song.bass_tab_verified
            },
            {
                type: 'lyrics',
                label: 'Lyrics',
                icon: '📝',
                url: song.lyrics_url,
                verified: song.lyrics_verified,
                hasContent: !!song.lyrics_content
            }
        ];

        const resourcesHtml = resources.map(resource => {
            // Special handling for lyrics
            if (resource.type === 'lyrics' && resource.hasContent) {
                return `
                    <button class="resource-link verified" data-resource="${resource.type}" data-action="show">
                        <span>${resource.icon}</span>
                        <span>${resource.label}</span>
                        <span class="status">✓</span>
                    </button>
                `;
            }
            
            if (resource.url) {
                const statusClass = resource.verified ? 'verified' : 'pending';
                const statusIcon = resource.verified ? '✓' : '⏳';
                return `
                    <button class="resource-link ${statusClass}" data-resource="${resource.type}" data-action="view" data-url="${this.escapeHtml(resource.url)}">
                        <span>${resource.icon}</span>
                        <span>${resource.label}</span>
                        <span class="status">${statusIcon}</span>
                    </button>
                `;
            } else {
                return `
                    <button class="resource-link missing" data-resource="${resource.type}" data-action="find">
                        <span>${resource.icon}</span>
                        <span>Find ${resource.label}</span>
                        <span>🔍</span>
                    </button>
                `;
            }
        }).join('');

        return `
            <div class="detail-section">
                <h4>Resources</h4>
                <div class="resource-links">
                    ${resourcesHtml}
                </div>
            </div>
        `;
    }

    /**
     * Render resource status information
     * @param {Object} song - Song object
     */
    renderResourceStatus(song) {
        const hasGuitarTab = !!song.guitar_tab_url;
        const hasBassTab = !!song.bass_tab_url;
        const hasLyrics = !!song.lyrics_url;
        
        const totalResources = 3;
        const foundResources = [hasGuitarTab, hasBassTab, hasLyrics].filter(Boolean).length;
        const completionPercentage = Math.round((foundResources / totalResources) * 100);
        
        return `
            <div class="resource-status">
                <div class="status-bar">
                    <div class="status-fill" style="width: ${completionPercentage}%"></div>
                </div>
                <p class="status-text">${foundResources} of ${totalResources} resources found (${completionPercentage}%)</p>
            </div>
        `;
    }

    /**
     * Render setlist information and management
     * @param {Object} song - Song object
     */
    renderSetlists(song) {
        // This will be populated dynamically via AJAX
        return `
            <div class="detail-section">
                <h4>Setlists</h4>
                <div class="setlists-row">
                    <div class="setlist-controls-left">
                        <div class="setlist-add-control">
                            <label class="setlist-add-label">Add to Setlist:</label>
                            <div class="setlist-add-wrapper">
                                <select class="setlist-add-dropdown" id="addToSetlistDropdown">
                                    <option value="">- Select Setlist -</option>
                                </select>
                                <button class="btn-secondary add-to-setlist-btn" data-action="add-to-setlist">Add</button>
                            </div>
                        </div>
                    </div>
                    <div class="setlist-memberships-right">
                        <label class="setlist-memberships-label">In the setlists shown below:</label>
                        <div class="setlists-container" id="songSetlistsContainer">
                            <div class="loading-setlists">Loading setlists...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render action buttons
     * @param {Object} song - Song object
     */
    renderActions(song) {
        if (this.isEditMode) {
            return this.renderEditActions(song);
        }
        
        return `
            <div class="detail-section">
                <div class="action-buttons">
                    <button class="action-btn" data-action="edit">
                        <span>✏️</span> Edit
                    </button>
                    <button class="action-btn" data-action="locate">
                        <span>📁</span> Show in Folder
                    </button>
                    <button class="action-btn" data-action="delete">
                        <span>🗑️</span> Remove
                    </button>
                </div>
                ${this.renderAudioPlayer(song)}
            </div>
        `;
    }

    /**
     * Render edit mode action buttons
     * @param {Object} song - Song object
     */
    renderEditActions(song) {
        return `
            <div class="detail-section">
                <div class="action-buttons edit-actions">
                    <button class="action-btn primary" data-action="edit">
                        <span>💾</span> Save
                    </button>
                    <button class="action-btn secondary" data-action="cancel-edit">
                        <span>❌</span> Cancel
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Attach event listeners to detail elements
     */
    attachEventListeners() {
        // Remove existing event listeners by cloning and replacing elements
        this.removeExistingListeners();
        
        // Action buttons - use safe event listener management
        const actionButtons = this.container.querySelectorAll('[data-action]');
        actionButtons.forEach(btn => {
            const handler = () => {
                const action = btn.dataset.action;
                this.handleAction(action);
            };
            
            if (window.globalListenerManager) {
                window.globalListenerManager.safeAddListener(btn, 'click', handler);
            } else {
                btn.addEventListener('click', handler);
            }
        });

        // Resource find buttons - use safe event listener management
        const resourceButtons = this.container.querySelectorAll('[data-resource]');
        resourceButtons.forEach(btn => {
            const handler = (event) => {
                const resourceType = btn.dataset.resource;
                const action = btn.dataset.action;
                this.handleFindResource(resourceType, action, event);
            };
            
            if (window.globalListenerManager) {
                window.globalListenerManager.safeAddListener(btn, 'click', handler);
            } else {
                btn.addEventListener('click', handler);
            }
        });

        // File path click - use safe event listener management
        const filePaths = this.container.querySelectorAll('.file-path');
        filePaths.forEach(path => {
            const handler = () => {
                this.handleAction('locate');
            };
            
            if (window.globalListenerManager) {
                window.globalListenerManager.safeAddListener(path, 'click', handler);
            } else {
                path.addEventListener('click', handler);
            }
            path.style.cursor = 'pointer';
        });

        // Collapsible section headers - use safe event listener management
        const collapsibleHeaders = this.container.querySelectorAll('.collapsible-header');
        collapsibleHeaders.forEach(header => {
            const handler = () => {
                this.toggleCollapsibleSection(header);
            };
            
            if (window.globalListenerManager) {
                window.globalListenerManager.safeAddListener(header, 'click', handler);
            } else {
                header.addEventListener('click', handler);
            }
        });

        // Setlist removal buttons
        const setlistRemoveButtons = this.container.querySelectorAll('.remove-from-setlist');
        setlistRemoveButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const setlistId = parseInt(btn.dataset.setlistId);
                const setlistName = btn.dataset.setlistName;
                this.handleRemoveFromSetlist(setlistId, setlistName);
            });
        });

        // Add protective event handlers for edit mode text inputs to prevent conflicts
        if (this.isEditMode) {
            this.attachEditModeProtections();
        }
    }

    /**
     * Add protective event handlers for edit mode to prevent crashes during text selection
     */
    attachEditModeProtections() {
        try {
            const editInputs = this.container.querySelectorAll('input[type="text"], textarea');
            editInputs.forEach(input => {
                // Use safer event handling that doesn't interfere with native input behavior
                if (window.SafeEventHandling) {
                    // Use safe mousedown handler that only stops propagation when necessary
                    const safeMousedownHandler = window.SafeEventHandling.createSafeMousedownHandler();
                    input.addEventListener('mousedown', safeMousedownHandler);
                    
                    // Use safe focus handler that preserves native browser behavior
                    const safeFocusHandler = window.SafeEventHandling.createSafeFocusHandler();
                    input.addEventListener('focus', safeFocusHandler);
                    
                    // Only prevent dragstart to avoid conflicts, but allow normal text selection
                    input.addEventListener('dragstart', (e) => {
                        e.stopPropagation();
                    });
                    
                    // Allow selectstart for text selection - don't interfere
                    // Allow blur events to work normally - don't interfere
                } else {
                    // Fallback - minimal interference approach
                    input.addEventListener('dragstart', (e) => {
                        e.stopPropagation();
                    });
                }
            });
        } catch (error) {
            console.error('Error attaching edit mode protections:', error);
        }
    }

    /**
     * Remove existing event listeners to prevent duplicates
     */
    removeExistingListeners() {
        // Use safe event listener management instead of DOM element replacement
        if (window.globalListenerManager) {
            const elementsWithListeners = this.container.querySelectorAll('[data-action], [data-resource], .file-path, .collapsible-header');
            elementsWithListeners.forEach(element => {
                window.globalListenerManager.removeAllListeners(element);
            });
        }
        // If utility not available, skip listener removal to avoid breaking input fields
    }

    /**
     * Handle action button clicks
     * @param {string} action - Action to perform
     */
    handleAction(action) {
        if (!this.currentSong) return;

        switch (action) {
            case 'play':
                this.playSong();
                break;
            case 'edit':
                this.editSong();
                break;
            case 'cancel-edit':
                this.exitEditMode();
                break;
            case 'locate':
                this.showInFolder();
                break;
            case 'delete':
                this.deleteSong();
                break;
            case 'add-to-setlist':
                this.handleAddToSetlist();
                break;
        }
    }

    /**
     * Handle find resource requests
     * @param {string} resourceType - Type of resource to find
     */
    handleFindResource(resourceType, action = 'find', event) {
        if (!this.currentSong) return;

        let eventType;
        
        if (action === 'view') {
            // View existing resource URL in modal
            const btn = event.target.closest('[data-url]');
            if (btn && btn.dataset.url) {
                this.showUrlInModal(btn.dataset.url, resourceType);
                return;
            }
        } else if (action === 'show' && resourceType === 'lyrics') {
            // Show existing lyrics content
            eventType = 'showLyrics';
        } else {
            // Find resources via URL search
            if (resourceType === 'guitar_tabs') {
                eventType = 'findGuitarTabs';
            } else if (resourceType === 'bass_tabs') {
                eventType = 'findBassTabs';
            } else if (resourceType === 'lyrics') {
                eventType = 'findLyrics';
            } else {
                // Fallback for any unexpected resource types
                eventType = 'findResource';
            }
        }

        const customEvent = new CustomEvent(eventType, {
            detail: {
                song: this.currentSong,
                resourceType: resourceType
            }
        });
        document.dispatchEvent(customEvent);
    }

    /**
     * Render embedded audio player
     * @param {Object} song - Song object
     */
    renderAudioPlayer(song) {
        if (!song || !song.file_path) {
            return '<div class="audio-player-placeholder">No audio file available</div>';
        }

        return `
            <div class="embedded-audio-player" data-song-id="${song.id}">
                <div class="audio-player-header">
                    <h4>🎵 Audio Player</h4>
                </div>
                <div class="audio-player-container">
                    <!-- Transport Controls -->
                    <div class="audio-controls">
                        <button class="audio-btn" id="skipBackBtn-${song.id}" title="Skip Back 10s">
                            <span class="audio-icon">⏪</span>
                        </button>
                        <button class="audio-btn" id="playBtn-${song.id}" title="Play">
                            <span class="audio-icon">▶️</span>
                        </button>
                        <button class="audio-btn" id="pauseBtn-${song.id}" title="Pause" disabled>
                            <span class="audio-icon">⏸️</span>
                        </button>
                        <button class="audio-btn" id="stopBtn-${song.id}" title="Stop" disabled>
                            <span class="audio-icon">⏹️</span>
                        </button>
                        <button class="audio-btn" id="skipForwardBtn-${song.id}" title="Skip Forward 10s">
                            <span class="audio-icon">⏩</span>
                        </button>
                    </div>

                    <!-- Progress Section -->
                    <div class="audio-progress-section">
                        <div class="audio-progress-container" id="progressContainer-${song.id}" title="Click to seek">
                            <div class="audio-progress-track">
                                <div class="audio-progress-bar" id="progressBar-${song.id}"></div>
                            </div>
                        </div>
                        <div class="audio-time" id="timeDisplay-${song.id}">0:00 / 0:00</div>
                    </div>
                    
                    <!-- Waveform Visualization -->
                    <div class="audio-waveform-section">
                        <canvas id="waveformCanvas-${song.id}" class="waveform-canvas" title="Audio Waveform"></canvas>
                    </div>

                    <!-- Volume Control -->
                    <div class="audio-volume-section">
                        <span class="volume-icon" title="Volume">🔊</span>
                        <input type="range" 
                               class="audio-volume-slider" 
                               id="volumeSlider-${song.id}" 
                               min="0" 
                               max="1" 
                               step="0.01" 
                               value="0.8"
                               title="Volume Control">
                        <span class="volume-percent" id="volumePercent-${song.id}">80%</span>
                    </div>
                </div>
                
                <!-- Advanced Controls Section -->
                <div class="audio-advanced-section">
                    <div class="advanced-controls">
                        <!-- Speed Controls -->
                        <div class="control-group speed-group">
                            <label class="control-label">Speed</label>
                            <div class="speed-presets">
                                <button class="speed-preset-btn" data-speed="0.25" title="Very Slow">0.25x</button>
                                <button class="speed-preset-btn" data-speed="0.5" title="Half Speed">0.5x</button>
                                <button class="speed-preset-btn" data-speed="0.75" title="Slow">0.75x</button>
                                <button class="speed-preset-btn active" data-speed="1.0" title="Normal">1.0x</button>
                                <button class="speed-preset-btn" data-speed="1.25" title="Fast">1.25x</button>
                            </div>
                            <div class="slider-section">
                                <span class="control-icon">⚡</span>
                                <input type="range" 
                                       class="control-slider audio-speed-slider" 
                                       id="speedSlider-${song.id}" 
                                       min="0.1" 
                                       max="4.0" 
                                       step="0.05" 
                                       value="1.0"
                                       title="Speed Control (0.1x - 4.0x)">
                                <span class="control-display" id="speedDisplay-${song.id}">1.0x</span>
                            </div>
                        </div>
                        
                        <!-- Pitch Controls -->
                        <div class="control-group pitch-group">
                            <div class="experimental-label" style="font-style: italic; font-size: 0.85em; color: #6c757d; margin-bottom: 4px;">Experimental</div>
                            <label class="control-label">Pitch</label>
                            <div class="slider-section">
                                <span class="control-icon">🎼</span>
                                <input type="range" 
                                       class="control-slider audio-pitch-slider" 
                                       id="pitchSlider-${song.id}" 
                                       min="-12" 
                                       max="12" 
                                       step="1" 
                                       value="0"
                                       title="Pitch Control (-12 to +12 semitones) - UI Only">
                                <span class="control-display" id="pitchDisplay-${song.id}">0</span>
                            </div>
                        </div>
                        
                        <!-- A-B Loop Controls -->
                        <div class="control-group loop-group">
                            <label class="control-label">A-B Loop</label>
                            <div class="loop-controls-inline">
                                <button class="loop-btn-inline" id="setABtn-${song.id}" title="Set A Point">
                                    A<span class="loop-time-inline" id="aPointTime-${song.id}">--:--</span>
                                </button>
                                <button class="loop-btn-inline" id="setBBtn-${song.id}" title="Set B Point">
                                    B<span class="loop-time-inline" id="bPointTime-${song.id}">--:--</span>
                                </button>
                                <button class="loop-toggle-btn-inline" id="loopToggleBtn-${song.id}" title="Toggle A-B Loop">
                                    <span class="loop-toggle-icon">🔄</span>
                                    <span class="loop-status" id="loopStatus-${song.id}">OFF</span>
                                </button>
                                <button class="loop-clear-btn-inline" id="loopClearBtn-${song.id}" title="Clear Loop Points">❌</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Initialize embedded audio player for current song
     */
    async initializeEmbeddedPlayer() {
        try {
            if (!this.currentSong || !this.currentSong.file_path) {
                const error = 'Cannot initialize audio player: Missing song or file path';
                console.warn(error);
                if (window.ErrorLogger) {
                    window.ErrorLogger.logSongDetailsError('initializeEmbeddedPlayer', error, {
                        songId: this.currentSong?.id,
                        hasFilePath: !!this.currentSong?.file_path,
                        songTitle: this.currentSong?.title,
                        hasSong: !!this.currentSong
                    });
                }
                return;
            }

            const songId = this.currentSong.id;
            const filePath = this.currentSong.file_path;
            
            
            // Clean up any existing player more thoroughly
            try {
                if (this.audioPlayer) {
                    this.audioPlayer.destroy();
                    this.audioPlayer = null;
                }
                
                // Clean up any global audio player references that might conflict
                if (window.currentAudioPlayer && window.currentAudioPlayer !== this.audioPlayer) {
                    try {
                        window.currentAudioPlayer.destroy();
                    } catch (globalCleanupError) {
                        console.warn('Error cleaning up global audio player:', globalCleanupError);
                    }
                }
                
                // Add a small delay to ensure cleanup is complete
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (cleanupError) {
                console.error('Error cleaning up existing audio player:', cleanupError);
                if (window.ErrorLogger) {
                    window.ErrorLogger.logSongDetailsError('playerCleanup', cleanupError, {
                        songId: songId
                    });
                }
            }

            // Create new EmbeddedAudioPlayer instance with enhanced error handling
            try {
                this.audioPlayer = new EmbeddedAudioPlayer(songId, filePath);
                
                // Wait for player initialization to complete before setting global reference
                if (this.audioPlayer.initPromise) {
                    await this.audioPlayer.initPromise;
                }
                
                // Defer setting global reference to avoid potential circular reference issues
                setTimeout(() => {
                    window.currentAudioPlayer = this.audioPlayer;
                }, 10);
                
            } catch (playerError) {
                console.error('Failed to create EmbeddedAudioPlayer:', playerError);
                if (window.ErrorLogger) {
                    window.ErrorLogger.logSongDetailsError('playerCreation', playerError, {
                        songId: songId,
                        filePath: filePath,
                        songTitle: this.currentSong.title,
                        songArtist: this.currentSong.artist,
                        additionalInfo: {
                            errorMessage: playerError.message,
                            errorStack: playerError.stack,
                            timestamp: new Date().toISOString()
                        }
                    });
                }
                throw playerError; // Re-throw to be caught by outer catch
            }
            
        } catch (error) {
            console.error('Critical error initializing embedded audio player:', error);
            if (window.ErrorLogger) {
                window.ErrorLogger.logSongDetailsError('initializeEmbeddedPlayer', error, {
                    songId: this.currentSong?.id,
                    filePath: this.currentSong?.file_path,
                    songTitle: this.currentSong?.title,
                    songArtist: this.currentSong?.artist,
                    additionalInfo: {
                        errorMessage: error.message,
                        errorStack: error.stack,
                        timestamp: new Date().toISOString(),
                        userAgent: navigator.userAgent
                    }
                });
            }
            
            // Show detailed error in the audio player area
            const audioContainer = document.querySelector(`[data-song-id="${this.currentSong?.id}"] .audio-player-container`);
            if (audioContainer) {
                audioContainer.innerHTML = `
                    <div class="audio-error">
                        <p>⚠️ Audio player failed to initialize</p>
                        <p>Song: ${this.currentSong?.title || 'Unknown'}</p>
                        <p>Error: ${error.message}</p>
                        <p><small>Full error details logged to errors.log</small></p>
                        <button onclick="location.reload()" class="retry-btn">Retry (Reload Page)</button>
                    </div>
                `;
            }
        }
    }

    /**
     * Edit the current song
     */
    editSong() {
        if (!this.currentSong) return;

        if (this.isEditMode) {
            // Save changes
            this.saveSongChanges();
        } else {
            // Enter edit mode
            this.enterEditMode();
        }
    }

    /**
     * Enter edit mode
     */
    enterEditMode() {
        this.isEditMode = true;
        this.originalSongData = { ...this.currentSong };
        this.renderEditMode(this.currentSong);
    }

    /**
     * Exit edit mode without saving
     */
    exitEditMode() {
        this.isEditMode = false;
        this.originalSongData = null;
        this.render(this.currentSong);
    }

    /**
     * Save song changes
     */
    async saveSongChanges() {
        if (!this.currentSong || !this.isEditMode) return;

        try {
            // Collect values from edit form
            const updatedSong = this.collectEditFormData();
            
            // Send update to server
            const response = await fetch(`/api/songs/${this.currentSong.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify(updatedSong)
            });

            if (response.ok) {
                const savedSong = await response.json();
                this.currentSong = savedSong;
                this.isEditMode = false;
                this.originalSongData = null;
                
                // Re-render in view mode
                this.render(savedSong);
                
                // Emit update event
                const event = new CustomEvent('songUpdated', {
                    detail: { song: savedSong }
                });
                document.dispatchEvent(event);
                
                // Refresh the song list in the left pane
                if (window.jamber3App) {
                    window.jamber3App.loadSongs();
                }
                
                // Ensure the search input remains functional after DOM updates
                setTimeout(() => {
                    const searchInput = document.getElementById('librarySearchInput');
                    if (searchInput) {
                        searchInput.disabled = false;
                        searchInput.readOnly = false;
                        searchInput.removeAttribute('disabled');
                        searchInput.removeAttribute('readonly');
                        
                        // Re-initialize the search input to ensure it's fully functional
                        if (window.songExplorer && typeof window.songExplorer.initializeSearchInput === 'function') {
                            window.songExplorer.initializeSearchInput();
                        }
                    }
                }, 100);
                
                // Success - no need for message, just continue
            } else {
                throw new Error('Failed to save changes');
            }
        } catch (error) {
            console.error('Error saving song changes:', error);
            this.showMessage('Error saving changes. Please try again.', 'error');
        }
    }

    /**
     * Collect data from edit form
     */
    collectEditFormData() {
        const form = this.container.querySelector('.edit-form');
        if (!form) return this.currentSong;
        
        return {
            id: this.currentSong.id, // Include the song ID for PUT requests
            title: form.querySelector('[name="title"]').value.trim(),
            artist: form.querySelector('[name="artist"]').value.trim(),
            album: form.querySelector('[name="album"]').value.trim(),
            lyrics_content: form.querySelector('[name="lyrics_content"]').value.trim(),
            tablature_url: form.querySelector('[name="tablature_url"]').value.trim(),
            guitar_tab_url: form.querySelector('[name="guitar_tab_url"]').value.trim(),
            bass_tab_url: form.querySelector('[name="bass_tab_url"]').value.trim(),
            lyrics_url: form.querySelector('[name="lyrics_url"]').value.trim(),
            youtube_url: form.querySelector('[name="youtube_url"]').value.trim()
        };
    }

    /**
     * Show message to user
     */
    showMessage(message, type = 'info') {
        // Create or update message element
        let messageEl = this.container.querySelector('.message');
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.className = 'message';
            this.container.insertBefore(messageEl, this.container.firstChild);
        }
        
        messageEl.className = `message ${type}`;
        messageEl.textContent = message;
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.remove();
            }
        }, 3000);
    }

    /**
     * Show song in folder
     */
    async showInFolder() {
        if (!this.currentSong || !this.currentSong.file_path) return;

        try {
            if (typeof require !== 'undefined') {
                const { shell } = require('electron');
                shell.showItemInFolder(this.currentSong.file_path);
            } else {
                // Copy path to clipboard as fallback
                navigator.clipboard.writeText(this.currentSong.file_path);
                await customAlert('File path copied to clipboard: ' + this.currentSong.file_path, 'Copied');
            }
        } catch (error) {
            console.error('Error showing file in folder:', error);
            await customAlert('Could not show file in folder.', 'Error');
        }
    }

    /**
     * Find all resources for the current song
     */
    findAllResources() {
        if (!this.currentSong) return;

        // Emit event for bulk resource finding
        const event = new CustomEvent('findAllResources', {
            detail: { song: this.currentSong }
        });
        document.dispatchEvent(event);
    }

    /**
     * Show URL in modal
     */
    showUrlInModal(url, resourceType) {
        // Check if this is a known problematic domain that blocks iframe embedding
        const blockedDomains = [
            'ultimate-guitar.com',
            'songsterr.com',
            '911tabs.com',
            'tabs.ultimate-guitar.com'
        ];
        
        const urlDomain = new URL(url).hostname.toLowerCase();
        const isBlockedDomain = blockedDomains.some(domain => urlDomain.includes(domain));
        
        if (isBlockedDomain) {
            // For known blocked domains, open directly in new tab
            if (typeof require !== 'undefined') {
                try {
                    const { shell } = require('electron');
                    shell.openExternal(url);
                } catch (e) {
                    window.open(url, '_blank');
                }
            } else {
                window.open(url, '_blank');
            }
            return;
        }
        
        // Create modal overlay for other sites
        const overlay = document.createElement('div');
        overlay.className = 'modal resource-display-modal';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        // Create modal content
        const modal = document.createElement('div');
        modal.className = 'modal-content';
        modal.style.cssText = `
            background: white;
            padding: 0;
            border-radius: 8px;
            width: 95vw;
            max-width: 1600px;
            height: 90vh;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            display: flex;
            flex-direction: column;
        `;
        
        // Add dark theme support
        if (document.body.classList.contains('dark-theme')) {
            modal.style.background = '#2d3748';
            modal.style.color = '#e2e8f0';
        }
        
        // Create header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 15px 20px;
            border-bottom: 1px solid #e9ecef;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        `;
        
        const title = document.createElement('h2');
        title.textContent = `${resourceType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} - ${this.currentSong.title}`;
        title.style.margin = '0';
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
        
        // Create iframe with error handling
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            flex: 1;
        `;
        
        // Create error message container
        const errorContainer = document.createElement('div');
        errorContainer.style.cssText = `
            display: none;
            flex: 1;
            padding: 40px;
            text-align: center;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 20px;
        `;
        
        const errorMessage = document.createElement('div');
        errorMessage.innerHTML = `
            <h3>Unable to display content in frame</h3>
            <p>This website prevents embedding in frames for security reasons.</p>
            <button onclick="window.open('${url}', '_blank')" style="
                background: #007bff;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
            ">Open in New Tab</button>
        `;
        errorContainer.appendChild(errorMessage);
        
        // Handle iframe load events
        iframe.addEventListener('load', () => {
            // Iframe loaded successfully - check after a short delay if content is blocked
            setTimeout(() => {
                try {
                    // Try to detect if the iframe was redirected to about:blank or similar
                    const currentSrc = iframe.contentWindow.location.href;
                    if (currentSrc === 'about:blank' || currentSrc.includes('blocked') || currentSrc === '') {
                        iframe.style.display = 'none';
                        errorContainer.style.display = 'flex';
                    }
                } catch (e) {
                    // Cross-origin restriction - this is normal and means the site loaded
                    // Leave iframe visible as the content should be displaying
                }
            }, 1000);
        });
        
        // Only handle actual network errors, not content blocking
        iframe.addEventListener('error', () => {
            // Only show error for actual loading failures, not content policy blocks
            iframe.style.display = 'none';
            errorContainer.style.display = 'flex';
        });
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        modal.appendChild(header);
        modal.appendChild(iframe);
        modal.appendChild(errorContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Allow closing with Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(overlay);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                document.removeEventListener('keydown', handleEscape);
            }
        });
    }

    /**
     * Delete the current song
     */
    async deleteSong() {
        if (!this.currentSong) return;

        const confirmation = await customConfirm(
            `Are you sure you want to remove "${this.currentSong.title}" from your library?\n\n` +
            'If the music file still exists on your hard drive, it will be marked as removed and won\'t be re-added on future scans.\n' +
            'If the file no longer exists, the database record will be deleted entirely.\n\n' +
            'The actual music file will not be deleted from your hard drive.',
            'Remove Song from Library'
        );

        if (confirmation) {
            // Emit event for song deletion
            const event = new CustomEvent('deleteSong', {
                detail: { song: this.currentSong }
            });
            document.dispatchEvent(event);
        }
    }

    /**
     * Render editable basic song information
     * @param {Object} song - Song object
     */
    renderEditBasicInfo(song) {
        const title = song.title || '';
        const artist = song.artist || song.extracted_artist || '';
        const album = song.album || '';
        
        return `
            <div class="detail-section edit-section">
                <h4>Song Information</h4>
                <div class="edit-form-grid">
                    <label for="edit-title">Title:</label>
                    <input type="text" id="edit-title" name="title" value="${this.escapeHtml(title)}" required>
                    
                    <label for="edit-artist">Artist:</label>
                    <input type="text" id="edit-artist" name="artist" value="${this.escapeHtml(artist)}">
                    
                    <label for="edit-album">Album:</label>
                    <input type="text" id="edit-album" name="album" value="${this.escapeHtml(album)}">
                </div>
            </div>
        `;
    }

    /**
     * Render editable metadata information
     * @param {Object} song - Song object
     */
    renderEditMetadata(song) {
        const metadataSource = this.getMetadataSourceDescription(song.metadata_source);
        const addedDate = song.added_at ? new Date(song.added_at).toLocaleDateString() : 'Unknown';
        const lastScanned = song.last_scanned ? new Date(song.last_scanned).toLocaleDateString() : 'Never';
        
        return `
            <div class="detail-section">
                <h4>Metadata</h4>
                <div class="detail-grid">
                    <span class="detail-label">Source:</span>
                    <span class="detail-value">${metadataSource}</span>
                    
                    <span class="detail-label">Added:</span>
                    <span class="detail-value">${addedDate}</span>
                    
                    <span class="detail-label">Last Scanned:</span>
                    <span class="detail-value">${lastScanned}</span>
                </div>
            </div>
        `;
    }

    /**
     * Render editable resources section
     * @param {Object} song - Song object
     */
    renderEditResources(song) {
        return `
            <div class="detail-section edit-section">
                <h4>Resources</h4>
                <div class="edit-form-grid">
                    <label for="edit-guitar-tab-url">Guitar Tab URL:</label>
                    <input type="url" id="edit-guitar-tab-url" name="guitar_tab_url" value="${this.escapeHtml(song.guitar_tab_url || '')}">
                    
                    <label for="edit-bass-tab-url">Bass Tab URL:</label>
                    <input type="url" id="edit-bass-tab-url" name="bass_tab_url" value="${this.escapeHtml(song.bass_tab_url || '')}">
                    
                    <label for="edit-lyrics-url">Lyrics URL:</label>
                    <input type="url" id="edit-lyrics-url" name="lyrics_url" value="${this.escapeHtml(song.lyrics_url || '')}">
                    
                    <label for="edit-tablature-url">Tablature URL:</label>
                    <input type="url" id="edit-tablature-url" name="tablature_url" value="${this.escapeHtml(song.tablature_url || '')}">
                    
                    <label for="edit-youtube-url">YouTube URL:</label>
                    <input type="url" id="edit-youtube-url" name="youtube_url" value="${this.escapeHtml(song.youtube_url || '')}">
                </div>
                
                <div class="edit-form-grid">
                    <label for="edit-lyrics-content">Lyrics Content:</label>
                    <textarea id="edit-lyrics-content" name="lyrics_content" rows="6" placeholder="Enter song lyrics here...">${this.escapeHtml(song.lyrics_content || '')}</textarea>
                </div>
            </div>
        `;
    }

    /**
     * Get metadata source description
     * @param {string} source - Metadata source
     */
    getMetadataSourceDescription(source) {
        const descriptions = {
            'id3': 'ID3 Tags (from file)',
            'filename': 'Filename Parsing',
            'manual': 'Manually Entered',
            'fallback': 'Fallback (filename only)'
        };
        return descriptions[source] || 'Unknown';
    }

    /**
     * Format file size
     * @param {number} bytes - File size in bytes
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Format duration
     * @param {number} seconds - Duration in seconds
     */
    formatDuration(seconds) {
        if (!seconds) return 'Unknown';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Get directory path from full file path
     * @param {string} filePath - Full file path
     */
    getDirectoryPath(filePath) {
        if (!filePath) return 'Unknown';
        const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
        return lastSlash > 0 ? filePath.substring(0, lastSlash) : filePath;
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

    /**
     * Clear the current song display
     */
    clear() {
        this.currentSong = null;
        this.isEditMode = false;
        this.originalSongData = null;
        this.renderEmptyState();
    }

    /**
     * Get current song
     */
    getCurrentSong() {
        return this.currentSong;
    }

    /**
     * Toggle collapsible section
     * @param {Element} header - Collapsible header element
     */
    toggleCollapsibleSection(header) {
        const targetId = header.dataset.target;
        const content = document.getElementById(targetId);
        
        if (!content) return;
        
        const isCollapsed = content.classList.contains('collapsed');
        
        if (isCollapsed) {
            content.classList.remove('collapsed');
            content.classList.add('expanded');
            header.classList.add('expanded');
        } else {
            content.classList.remove('expanded');
            content.classList.add('collapsed');
            header.classList.remove('expanded');
        }
    }

    /**
     * Refresh the current display
     */
    refresh() {
        if (this.currentSong) {
            this.render(this.currentSong);
        }
    }

    /**
     * Force refresh with updated song data, bypassing the same-song check
     * @param {Object} updatedSong - Updated song object
     */
    forceRefresh(updatedSong) {
        if (updatedSong) {
            this.currentSong = updatedSong;
            this.render(updatedSong);
        }
    }

    /**
     * Load setlists for current song and available setlists for dropdown
     * @param {Object} song - Song object
     */
    async loadSongSetlists(song) {
        try {
            // Load song's setlists and all available setlists in parallel
            const [songSetlistsResponse, allSetlistsResponse] = await Promise.all([
                fetch(`/api/songs/${song.id}/setlists`),
                fetch('/api/setlists')
            ]);


            if (allSetlistsResponse.ok) {
                const allSetlists = await allSetlistsResponse.json();
                
                // Handle song setlists - 404 is OK if song isn't in any setlists
                let songSetlists = [];
                if (songSetlistsResponse.ok) {
                    songSetlists = await songSetlistsResponse.json();
                } else if (songSetlistsResponse.status === 404) {
                } else {
                    console.error('Unexpected error fetching song setlists:', songSetlistsResponse.status);
                }
                
                this.displaySongSetlists(songSetlists);
                this.populateSetlistDropdown(allSetlists, songSetlists);
            } else {
                console.error('Failed to fetch all setlists:', allSetlistsResponse.status);
                this.displaySetlistsError();
            }
        } catch (error) {
            console.error('Error loading setlists:', error);
            this.displaySetlistsError();
        }
    }

    /**
     * Display the setlists this song belongs to
     * @param {Array} setlists - Array of setlist objects
     */
    displaySongSetlists(setlists) {
        const container = this.container.querySelector('#songSetlistsContainer');
        const rightColumn = this.container.querySelector('.setlist-memberships-right');
        if (!container) return;

        // Always show the right column
        if (rightColumn) {
            rightColumn.style.display = 'block';
        }

        if (!setlists || setlists.length === 0) {
            container.innerHTML = '<div class="no-setlists-message">- none -</div>';
            return;
        }

        const html = setlists.map(setlist => `
            <div class="song-setlist-item">
                <span class="setlist-name">${setlist.name}</span>
                <button class="remove-from-setlist" 
                        data-setlist-id="${setlist.id}"
                        data-setlist-name="${setlist.name}"
                        title="Remove from ${setlist.name}">
                    🗑️
                </button>
            </div>
        `).join('');

        container.innerHTML = html;
        
        // Re-attach event listeners since we updated the innerHTML
        this.attachSetlistEventHandlers();
    }

    /**
     * Attach event listeners specifically for setlist buttons
     */
    attachSetlistEventHandlers() {
        // Remove from setlist buttons
        const setlistRemoveButtons = this.container.querySelectorAll('.remove-from-setlist');
        setlistRemoveButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const setlistId = parseInt(btn.dataset.setlistId);
                const setlistName = btn.dataset.setlistName;
                this.handleRemoveFromSetlist(setlistId, setlistName);
            });
        });
    }

    /**
     * Display error message for setlists loading
     */
    displaySetlistsError() {
        const container = this.container.querySelector('#songSetlistsContainer');
        const rightColumn = this.container.querySelector('.setlist-memberships-right');
        if (container) {
            // Hide the right column when there's an error
            if (rightColumn) {
                rightColumn.style.display = 'none';
            }
            container.innerHTML = '';
        }
    }

    /**
     * Populate the "Add to Setlist" dropdown
     * @param {Array} allSetlists - All available setlists
     * @param {Array} songSetlists - Setlists this song already belongs to
     */
    populateSetlistDropdown(allSetlists, songSetlists) {
        
        const dropdown = this.container.querySelector('#addToSetlistDropdown');
        if (!dropdown) return;

        // Clear existing options except first one
        dropdown.innerHTML = '<option value="">- view a setlist -</option>';

        // Get IDs of setlists this song is already in
        const songSetlistIds = new Set(songSetlists.map(sl => sl.id));

        // Add options for ALL setlists (users can add songs to any setlist)
        allSetlists.forEach(setlist => {
            const option = document.createElement('option');
            option.value = setlist.id;
            
            // Show if song is already in this setlist with visual indicator
            if (songSetlistIds.has(setlist.id)) {
                option.textContent = `${setlist.name} (${setlist.song_count || 0}) ✓`;
                option.style.fontWeight = 'bold';
            } else {
                option.textContent = `${setlist.name} (${setlist.song_count || 0})`;
            }
            
            dropdown.appendChild(option);
        });

        // Always enable dropdown if setlists are available
        dropdown.disabled = dropdown.options.length === 1;
    }

    /**
     * Handle adding song to selected setlist
     */
    async handleAddToSetlist() {
        const dropdown = this.container.querySelector('#addToSetlistDropdown');
        if (!dropdown || !dropdown.value) {
            await customAlert('Please select a setlist first.', 'Select Setlist');
            return;
        }

        const setlistId = parseInt(dropdown.value);
        const setlistName = dropdown.options[dropdown.selectedIndex].textContent.split(' (')[0].replace(' ✓', '');

        try {
            const response = await fetch(`/api/songs/${this.currentSong.id}/setlists`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ setlistId })
            });

            if (response.ok) {
                // Reload setlists to refresh the display
                await this.loadSongSetlists(this.currentSong);
                
                // Also refresh the main app's setlist dropdown to show updated song counts
                if (window.jamber3App && typeof window.jamber3App.refreshSetlistDropdown === 'function') {
                    await window.jamber3App.refreshSetlistDropdown();
                }
                
            } else {
                const error = await response.json();
                await customAlert(`Failed to add to setlist: ${error.error || 'Unknown error'}`, 'Failed to Add');
            }
        } catch (error) {
            console.error('Error adding to setlist:', error);
            await customAlert('Network error: Could not add to setlist.', 'Network Error');
        }
    }

    /**
     * Handle removing song from setlist
     * @param {number} setlistId - ID of setlist to remove from
     * @param {string} setlistName - Name of setlist for confirmation
     */
    async handleRemoveFromSetlist(setlistId, setlistName) {
        const confirmed = await customConfirm(
            `Remove "${this.currentSong.title}" from "${setlistName}"?`,
            'Remove from Setlist'
        );
        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(`/api/songs/${this.currentSong.id}/setlists/${setlistId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // this.showMessage(`Successfully removed "${this.currentSong.title}" from "${setlistName}"`); // Removed - not needed
                
                // Reload setlists to refresh the display
                await this.loadSongSetlists(this.currentSong);
                
                // Also refresh the main app's setlist dropdown to show updated song counts
                if (window.jamber3App && typeof window.jamber3App.refreshSetlistDropdown === 'function') {
                    await window.jamber3App.refreshSetlistDropdown();
                }
                
            } else {
                const error = await response.json();
                await customAlert(`Failed to remove from setlist: ${error.error || 'Unknown error'}`, 'Failed to Remove');
            }
        } catch (error) {
            console.error('Error removing from setlist:', error);
            await customAlert('Network error: Could not remove from setlist.', 'Network Error');
        }
    }

    /**
     * Show a temporary success/info message
     * @param {string} message - Message to show
     */
    showMessage(message) {
        // Use the same message system as the main app if available
        if (window.jamber3App && window.jamber3App.showMessage) {
            window.jamber3App.showMessage(message, 'success');
        } else {
            // Fallback to simple alert
        }
    }
}

// Create global instance
window.songDetails = new SongDetails('songDetails');