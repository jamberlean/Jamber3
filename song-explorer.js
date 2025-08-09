/**
 * Song Explorer Component for Jamber3
 * Handles the hierarchical display and navigation of songs in the left pane
 */
class SongExplorer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        
        if (!this.container) {
            console.error('[CRITICAL] Container element not found:', containerId);
            return;
        }
        
        this.currentView = 'artist';
        this.songs = [];
        this.filteredSongs = [];
        this.selectedSong = null;
        this.expandedNodes = new Set();
        this.searchQuery = '';
        this.resourceFilter = false;
        this.isRendering = false; // Prevent render loops
        this.attachedEventListeners = new Set(); // Track attached listeners
        this.lastSearchTime = 0; // Throttle search requests
        this.searchThrottleMs = 300; // Minimum time between searches
        this.pendingSelection = null; // Track pending song selection
        
        this.initializeEventListeners();
    }

    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        // Prevent any click events from bubbling out of the song explorer container
        if (this.container) {
            this.container.addEventListener('click', (e) => {
                // Check if the click is on the container itself (not a child element)
                if (e.target === this.container) {
                    e.stopPropagation();
                }
            });
        }
        
        // View control buttons
        const viewButtons = document.querySelectorAll('.view-btn');
        viewButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent bubbling
                const view = btn.dataset.view;
                this.switchView(view);
            });
        });

        // Search input (library pane) - with retry mechanism
        this.initializeSearchInput();
    }

    /**
     * Initialize search input
     */
    initializeSearchInput() {
        const librarySearchInput = document.getElementById('librarySearchInput');
        if (!librarySearchInput) {
            // Single retry after DOM load instead of recursive calls
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.initializeSearchInput());
            }
            return;
        }
        
        // Store the debounce timeout at instance level
        if (!this.searchTimeout) {
            this.searchTimeout = null;
        }
        
        // Store event handler at instance level to prevent duplicate listeners
        if (!this.handleSearchInput) {
            this.handleSearchInput = (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.handleSearch(e.target.value);
                }, 300);
            };
        }
        
        // Remove any existing listener before adding new one
        librarySearchInput.removeEventListener('input', this.handleSearchInput);
        // Only use 'input' event - covers typing, paste, and all input changes
        librarySearchInput.addEventListener('input', this.handleSearchInput);

        
        // Resource filter checkbox
        const resourceFilter = document.getElementById('resourceFilter');
        if (resourceFilter) {
            // Store handler to prevent duplicates
            if (!this.handleResourceFilterChange) {
                this.handleResourceFilterChange = (e) => {
                    e.stopPropagation(); // Prevent bubbling
                    this.handleResourceFilter(e.target.checked);
                };
            }
            resourceFilter.removeEventListener('change', this.handleResourceFilterChange);
            resourceFilter.addEventListener('change', this.handleResourceFilterChange);
        }
    }

    /**
     * Load songs data
     * @param {Array} songs - Array of song objects
     */
    loadSongs(songs) {
        // Store current search input state before updating
        const searchInput = document.getElementById('librarySearchInput');
        const hadFocus = document.activeElement === searchInput;
        const currentValue = searchInput ? searchInput.value : '';
        const selectionStart = searchInput ? searchInput.selectionStart : 0;
        const selectionEnd = searchInput ? searchInput.selectionEnd : 0;
        
        this.songs = songs || [];
        this.filteredSongs = [...this.songs];
        
        // Apply existing filters if present (search query OR resource filter)
        if (this.searchQuery || this.resourceFilter) {
            this.applyFilters();
        } else {
            this.render();
        }
        
        // Restore focus and cursor position after render
        if (hadFocus && searchInput) {
            // Use setTimeout to ensure DOM is fully updated
            setTimeout(() => {
                const input = document.getElementById('librarySearchInput');
                if (input) {
                    input.focus();
                    input.value = currentValue;
                    input.setSelectionRange(selectionStart, selectionEnd);
                }
            }, 0);
        }
        
        // Also ensure input remains functional after load
        setTimeout(() => this.restoreSearchInput(), 50);
    }

    /**
     * Handle search query
     * @param {string} query - Search query
     */
    handleSearch(query) {
        this.searchQuery = query.toLowerCase().trim();
        this.applyFilters();
    }

    /**
     * Handle resource filter toggle
     * @param {boolean} enabled - Whether resource filter is enabled
     */
    handleResourceFilter(enabled) {
        this.resourceFilter = enabled;
        this.applyFilters();
    }

    /**
     * Apply all active filters
     */
    applyFilters() {
        // Store current search input state before filtering
        const searchInput = document.getElementById('librarySearchInput');
        const hadFocus = document.activeElement === searchInput;
        const currentValue = searchInput ? searchInput.value : '';
        const selectionStart = searchInput ? searchInput.selectionStart : 0;
        const selectionEnd = searchInput ? searchInput.selectionEnd : 0;
        
        let filtered = [...this.songs];

        // Apply search filter
        if (this.searchQuery !== '') {
            filtered = filtered.filter(song => {
                const title = (song.title || '').toLowerCase();
                const artist = (song.artist || song.extracted_artist || '').toLowerCase();
                const album = (song.album || '').toLowerCase();
                const filename = (song.file_name || '').toLowerCase();
                
                return title.includes(this.searchQuery) ||
                       artist.includes(this.searchQuery) ||
                       album.includes(this.searchQuery) ||
                       filename.includes(this.searchQuery);
            });
        }

        // Apply resource filter
        if (this.resourceFilter) {
            filtered = filtered.filter(song => {
                return song.guitar_tab_url || 
                       song.bass_tab_url || 
                       song.lyrics_url ||
                       song.tablature_url; // Legacy field support
            });
        }

        this.filteredSongs = filtered;
        this.render();
        
        // Restore focus and cursor position after render
        if (hadFocus && searchInput) {
            // Use setTimeout to ensure DOM is fully updated
            setTimeout(() => {
                const input = document.getElementById('librarySearchInput');
                if (input) {
                    input.focus();
                    input.value = currentValue;
                    input.setSelectionRange(selectionStart, selectionEnd);
                }
            }, 0);
        }
    }

    /**
     * Switch view mode
     * @param {string} view - View mode (artist, album, folder, all)
     */
    switchView(view) {
        this.currentView = view;
        
        // Update view buttons
        const viewButtons = document.querySelectorAll('.view-btn');
        viewButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        
        // Store current focus state and input value
        const searchInput = document.getElementById('librarySearchInput');
        const hadFocus = document.activeElement === searchInput;
        const currentValue = searchInput ? searchInput.value : '';
        const selectionStart = searchInput ? searchInput.selectionStart : 0;
        const selectionEnd = searchInput ? searchInput.selectionEnd : 0;
        
        this.render();
        
        // Restore focus and cursor position after render
        if (hadFocus && searchInput) {
            // Use setTimeout to ensure DOM is fully updated
            setTimeout(() => {
                const input = document.getElementById('librarySearchInput');
                if (input) {
                    input.focus();
                    input.value = currentValue;
                    input.setSelectionRange(selectionStart, selectionEnd);
                }
            }, 0);
        }
    }

    /**
     * Render the song explorer
     */
    render() {
        
        // Prevent render loops
        if (this.isRendering) {
            return;
        }
        
        this.isRendering = true;
        
        // Always preserve search input state during renders
        const searchInput = document.getElementById('librarySearchInput');
        const searchHadFocus = document.activeElement === searchInput;
        const searchValue = searchInput ? searchInput.value : '';
        const searchSelectionStart = searchInput ? searchInput.selectionStart : 0;
        const searchSelectionEnd = searchInput ? searchInput.selectionEnd : 0;
        
        // Add safety timeout to prevent infinite rendering
        setTimeout(() => {
            if (this.isRendering) {
                this.isRendering = false;
            }
        }, 5000);
        
        // Ensure container exists before proceeding
        if (!this.container) {
            this.isRendering = false;
            return;
        }
        
        if (this.filteredSongs.length === 0) {
            this.renderEmptyState();
            this.isRendering = false;
            return;
        }

        let html = '';
        
        switch (this.currentView) {
            case 'artist':
                html = this.renderArtistView();
                break;
            case 'album':
                html = this.renderAlbumView();
                break;
            case 'folder':
                html = this.renderFolderView();
                break;
        case 'all':
            html = this.renderAllView();
            break;
        default:
            html = this.renderArtistView();
        }
        
        
        // Use requestAnimationFrame to ensure DOM updates are properly batched
        requestAnimationFrame(() => {
            try {
                // Safety check - ensure container still exists
                if (!this.container) {
                    console.error('[DEBUG] Container lost during render');
                    this.isRendering = false;
                    return;
                }
                
                // Check if we're still supposed to be rendering
                if (!this.isRendering) {
                    return;
                }
                
                // Clear existing content safely
                this.container.innerHTML = '';
                
                // Add new content
                this.container.innerHTML = `<ul class="song-tree">${html}</ul>`;
                
                
                // Use another requestAnimationFrame to ensure DOM is fully updated
                requestAnimationFrame(() => {
                    try {
                        // Another safety check
                        if (!this.container) {
                            console.error('[DEBUG] Container lost before event attachment');
                            this.isRendering = false;
                            return;
                        }
                        
                        this.attachTreeEventListeners();
                        this.isRendering = false; // Reset render flag
                        
                        // Re-initialize search input to ensure it stays responsive
                        // This is necessary because the render might affect focus/input handling
                        this.initializeSearchInput();
                        
                        // Ensure the search input is not disabled or readonly
                        const searchInput = document.getElementById('librarySearchInput');
                        if (searchInput) {
                            searchInput.disabled = false;
                            searchInput.readOnly = false;
                            // Remove any attributes that might block input
                            searchInput.removeAttribute('disabled');
                            searchInput.removeAttribute('readonly');
                        }
                        
                        // Restore search input focus and state if it had focus before render
                        if (searchHadFocus) {
                            setTimeout(() => {
                                const input = document.getElementById('librarySearchInput');
                                if (input) {
                                    input.focus();
                                    input.value = searchValue;
                                    input.setSelectionRange(searchSelectionStart, searchSelectionEnd);
                                }
                            }, 10);
                        }
                        
                        // Handle any pending selection after render completes
                        if (this.pendingSelection) {
                            const pendingId = this.pendingSelection;
                            this.pendingSelection = null;
                            setTimeout(() => this.selectSong(pendingId), 50);
                        }
                    } catch (innerError) {
                        console.error('[DEBUG] Error attaching event listeners:', innerError);
                        if (window.ErrorLogger) {
                            window.ErrorLogger.logError('SongExplorer', 'attachEventListeners', innerError, {
                                additionalInfo: {
                                    filteredSongsCount: this.filteredSongs.length,
                                    currentView: this.currentView
                                }
                            });
                        }
                        this.isRendering = false;
                    }
                });
            } catch (error) {
                console.error('[DEBUG] Error during DOM update:', error);
                if (window.ErrorLogger) {
                    window.ErrorLogger.logError('SongExplorer', 'render', error, {
                        additionalInfo: {
                            htmlLength: html?.length,
                            filteredSongsCount: this.filteredSongs.length,
                            currentView: this.currentView
                        }
                    });
                }
                this.isRendering = false;
            }
        });
    }

    /**
     * Render empty state
     */
    renderEmptyState() {
        const message = this.searchQuery ? 
            `No songs found matching "${this.searchQuery}"` :
            'No music found. Click "Scan for Music" to discover songs on your computer';
            
        const icon = this.searchQuery ? '🔍' : '🎵';
        
        this.container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">${icon}</div>
                <h4>${this.searchQuery ? 'No Results' : 'No Music Found'}</h4>
                <p>${message}</p>
            </div>
        `;
        
        this.isRendering = false; // Reset render flag
    }

    /**
     * Render artist view
     */
    renderArtistView() {
        const artistGroups = this.groupByArtist(this.filteredSongs);
        let html = '';

        for (const [artist, songs] of artistGroups) {
            const artistKey = `artist-${this.sanitizeKey(artist)}`;
            const isExpanded = this.expandedNodes.has(artistKey);
            const expandIcon = isExpanded ? '▼' : '▶';
            
            html += `
                <li class="tree-node">
                    <div class="tree-item artist" data-key="${artistKey}">
                        <span class="tree-expand" data-toggle="${artistKey}">${expandIcon}</span>
                        <span class="tree-icon">👤</span>
                        <span class="tree-label">${this.escapeHtml(artist || 'Unknown Artist')} (${songs.length})</span>
                    </div>
                    <ul class="tree-children ${isExpanded ? '' : 'collapsed'}">
                        ${songs.map(song => this.renderSongItem(song)).join('')}
                    </ul>
                </li>
            `;
        }

        return html;
    }

    /**
     * Render album view
     */
    renderAlbumView() {
        const albumGroups = this.groupByAlbum(this.filteredSongs);
        let html = '';

        for (const [album, songs] of albumGroups) {
            const albumKey = `album-${this.sanitizeKey(album)}`;
            const isExpanded = this.expandedNodes.has(albumKey);
            const expandIcon = isExpanded ? '▼' : '▶';
            
            html += `
                <li class="tree-node">
                    <div class="tree-item album" data-key="${albumKey}">
                        <span class="tree-expand" data-toggle="${albumKey}">${expandIcon}</span>
                        <span class="tree-icon">💿</span>
                        <span class="tree-label">${this.escapeHtml(album || 'Unknown Album')} (${songs.length})</span>
                    </div>
                    <ul class="tree-children ${isExpanded ? '' : 'collapsed'}">
                        ${songs.map(song => this.renderSongItem(song)).join('')}
                    </ul>
                </li>
            `;
        }

        return html;
    }

    /**
     * Render folder view
     */
    renderFolderView() {
        const folderGroups = this.groupByFolder(this.filteredSongs);
        let html = '';

        for (const [folder, songs] of folderGroups) {
            const folderKey = `folder-${this.sanitizeKey(folder)}`;
            const isExpanded = this.expandedNodes.has(folderKey);
            const expandIcon = isExpanded ? '▼' : '▶';
            
            html += `
                <li class="tree-node">
                    <div class="tree-item folder" data-key="${folderKey}">
                        <span class="tree-expand" data-toggle="${folderKey}">${expandIcon}</span>
                        <span class="tree-icon">📁</span>
                        <span class="tree-label">${this.escapeHtml(folder || 'Unknown Folder')} (${songs.length})</span>
                    </div>
                    <ul class="tree-children ${isExpanded ? '' : 'collapsed'}">
                        ${songs.map(song => this.renderSongItem(song)).join('')}
                    </ul>
                </li>
            `;
        }

        return html;
    }

    /**
     * Render all view (flat list)
     */
    renderAllView() {
        return this.filteredSongs
            .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
            .map(song => `<li class="tree-node">${this.renderSongItem(song)}</li>`)
            .join('');
    }

    /**
     * Render individual song item
     * @param {Object} song - Song object
     */
    renderSongItem(song) {
        const isSelected = this.selectedSong && this.selectedSong.id === song.id;
        const artist = song.artist || song.extracted_artist || '';
        const displayText = artist ? `${song.title} - ${artist}` : song.title;
        
        return `
            <div class="tree-item song ${isSelected ? 'selected' : ''}" data-song-id="${song.id}">
                <span class="tree-icon">🎵</span>
                <span class="tree-label" title="${this.escapeHtml(displayText)}">${this.escapeHtml(displayText)}</span>
            </div>
        `;
    }

    /**
     * Group songs by artist
     * @param {Array} songs - Songs to group
     */
    groupByArtist(songs) {
        const groups = new Map();
        
        songs.forEach(song => {
            const artist = song.artist || song.extracted_artist || 'Unknown Artist';
            if (!groups.has(artist)) {
                groups.set(artist, []);
            }
            groups.get(artist).push(song);
        });

        // Sort artists alphabetically
        return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    }

    /**
     * Group songs by album
     * @param {Array} songs - Songs to group
     */
    groupByAlbum(songs) {
        const groups = new Map();
        
        songs.forEach(song => {
            const album = song.album || 'Unknown Album';
            if (!groups.has(album)) {
                groups.set(album, []);
            }
            groups.get(album).push(song);
        });

        return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    }

    /**
     * Group songs by folder
     * @param {Array} songs - Songs to group
     */
    groupByFolder(songs) {
        const groups = new Map();
        
        songs.forEach(song => {
            // Use simple string manipulation instead of Node.js path module
            // (path module not available in renderer process)
            let folder = 'Unknown Folder';
            let folderName = 'Unknown Folder';
            
            if (song.file_path) {
                // Get directory path (everything before last slash/backslash)
                const lastSlash = Math.max(
                    song.file_path.lastIndexOf('/'),
                    song.file_path.lastIndexOf('\\')
                );
                
                if (lastSlash > -1) {
                    folder = song.file_path.substring(0, lastSlash);
                    // Get folder name (last part of directory path)
                    const folderLastSlash = Math.max(
                        folder.lastIndexOf('/'),
                        folder.lastIndexOf('\\')
                    );
                    folderName = folderLastSlash > -1 ? 
                        folder.substring(folderLastSlash + 1) : folder;
                }
            }
            
            if (!groups.has(folderName)) {
                groups.set(folderName, []);
            }
            groups.get(folderName).push(song);
        });

        return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    }

    /**
     * Clean up existing event listeners to prevent memory leaks
     */
    cleanupEventListeners() {
        // Remove all existing event listeners from song items and other elements
        const existingItems = this.container.querySelectorAll('.tree-item');
        existingItems.forEach(item => {
            // Clone and replace elements to remove all event listeners
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);
        });
    }

    /**
     * Attach event listeners to tree elements
     */
    attachTreeEventListeners() {
        // Safety check - don't attach listeners if container is missing
        if (!this.container) {
            console.error('[DEBUG] Cannot attach event listeners - container missing');
            return;
        }
        
        // Expand/collapse toggles
        const toggles = this.container.querySelectorAll('[data-toggle]');
        
        toggles.forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = toggle.dataset.toggle;
                this.toggleNode(key);
            });
        });

        // Song selection
        const songItems = this.container.querySelectorAll('.tree-item.song');
        
        songItems.forEach((item, index) => {
            // Always attach event listener since DOM was recreated
            // (innerHTML replacement destroys previous elements and listeners)
            
            item.addEventListener('click', (e) => {
                
                // Prevent event from bubbling up to parent elements
                e.stopPropagation();
                e.preventDefault();
                
                const songIdStr = item.dataset.songId;
                
                if (!songIdStr) {
                    console.warn('Song item missing data-song-id:', item);
                    return;
                }
                
                const songId = parseInt(songIdStr);
                if (isNaN(songId)) {
                    console.warn('Invalid song ID:', songIdStr);
                    return;
                }
                
                
                // Add try-catch to prevent crashes
                try {
                    this.selectSong(songId);
                } catch (error) {
                    console.error('[ERROR] Failed to select song:', error);
                    if (window.ErrorLogger) {
                        window.ErrorLogger.logError('SongExplorer', 'songClick', error, {
                            songId: songId,
                            additionalInfo: {
                                isRendering: this.isRendering,
                                filteredSongsCount: this.filteredSongs?.length,
                                searchQuery: this.searchQuery
                            }
                        });
                    }
                }
            });
        });

        // Artist/Album/Folder selection (expand on click)
        const groupItems = this.container.querySelectorAll('.tree-item.artist, .tree-item.album, .tree-item.folder');
        groupItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // Prevent event from bubbling up
                e.stopPropagation();
                e.preventDefault();
                
                const key = item.dataset.key;
                if (key) {
                    this.toggleNode(key);
                }
            });
        });
    }

    /**
     * Toggle node expansion
     * @param {string} key - Node key
     */
    toggleNode(key) {
        if (this.expandedNodes.has(key)) {
            this.expandedNodes.delete(key);
        } else {
            this.expandedNodes.add(key);
        }
        // Ensure we're not already rendering to prevent loops
        if (!this.isRendering) {
            this.render();
        }
        // If rendering, the toggle will take effect on the next render
        // No need to schedule another render
    }

    /**
     * Select a song
     * @param {number} songId - Song ID
     */
    selectSong(songId) {
        
        // Safety check - don't select during rendering
        if (this.isRendering) {
            // Store the pending selection to be processed after render completes
            this.pendingSelection = songId;
            return;
        }
        
        // Don't re-select the same song
        if (this.selectedSong && this.selectedSong.id === songId) {
            // Just update visual selection
            this.updateSelectionDisplay(songId);
            return;
        }
        
        // First try to find the song in the filtered list (what's currently displayed)
        // then fall back to the full list if not found
        let song = this.filteredSongs.find(s => s.id === songId);
        if (!song) {
            song = this.songs.find(s => s.id === songId);
        }
        
        if (!song) {
            return;
        }
        
        // Update visual selection without re-rendering entire tree
        this.updateSelectionDisplay(songId);
        
        this.selectedSong = song;
        
        
        // Emit selection event
        const event = new CustomEvent('songSelected', {
            detail: { song: song }
        });
        
        document.dispatchEvent(event);
    }
    
    /**
     * Update visual selection without full re-render
     * @param {number} songId - Song ID to select
     */
    updateSelectionDisplay(songId) {
        // Remove previous selection
        const previousSelected = this.container.querySelector('.tree-item.song.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
        }
        
        // Add new selection
        const newSelected = this.container.querySelector(`.tree-item.song[data-song-id="${songId}"]`);
        if (newSelected) {
            newSelected.classList.add('selected');
        }
    }

    /**
     * Get currently selected song
     */
    getSelectedSong() {
        return this.selectedSong;
    }

    /**
     * Clear selection
     */
    clearSelection() {
        this.selectedSong = null;
        this.render();
    }

    /**
     * Expand all nodes
     */
    expandAll() {
        const allKeys = this.container.querySelectorAll('[data-toggle]');
        allKeys.forEach(toggle => {
            this.expandedNodes.add(toggle.dataset.toggle);
        });
        this.render();
    }

    /**
     * Collapse all nodes
     */
    collapseAll() {
        this.expandedNodes.clear();
        this.render();
    }

    /**
     * Sanitize key for use as element attribute
     * @param {string} str - String to sanitize
     */
    sanitizeKey(str) {
        return (str || '')
            .replace(/[^a-zA-Z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
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
     * Refresh the display
     */
    refresh() {
        this.render();
    }
    
    /**
     * Force restore search input functionality
     * Call this if the search input becomes unresponsive
     */
    restoreSearchInput() {
        const searchInput = document.getElementById('librarySearchInput');
        if (!searchInput) return;
        
        // Remove any blocking attributes
        searchInput.disabled = false;
        searchInput.readOnly = false;
        searchInput.removeAttribute('disabled');
        searchInput.removeAttribute('readonly');
        
        // Re-initialize event listeners
        this.initializeSearchInput();
        
        // Try to restore focus if nothing else has focus
        if (document.activeElement === document.body) {
            searchInput.focus();
        }
        
        console.log('[DEBUG] Search input functionality restored');
    }

    /**
     * Get statistics about current view
     */
    getStats() {
        return {
            totalSongs: this.songs.length,
            filteredSongs: this.filteredSongs.length,
            currentView: this.currentView,
            searchQuery: this.searchQuery,
            hasSelection: !!this.selectedSong
        };
    }
}

// Create global instance when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.songExplorer = new SongExplorer('songExplorer');
    });
} else {
    window.songExplorer = new SongExplorer('songExplorer');
}