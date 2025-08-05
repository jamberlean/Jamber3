/**
 * Song Explorer Component for Jamber3
 * Handles the hierarchical display and navigation of songs in the left pane
 */
class SongExplorer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentView = 'artist';
        this.songs = [];
        this.filteredSongs = [];
        this.selectedSong = null;
        this.expandedNodes = new Set();
        this.searchQuery = '';
        this.resourceFilter = false;
        
        this.initializeEventListeners();
    }

    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        // View control buttons
        const viewButtons = document.querySelectorAll('.view-btn');
        viewButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.switchView(view);
            });
        });

        // Search input (library pane) - with retry mechanism
        this.initializeSearchInput();
    }

    /**
     * Initialize search input with retry mechanism
     */
    initializeSearchInput() {
        const librarySearchInput = document.getElementById('librarySearchInput');
        if (librarySearchInput) {
            console.log('Library search input found, binding events...');
            
            let searchTimeout;
            
            // Multiple event types to ensure it works
            const handleSearchInput = (e) => {
                console.log('Search input detected:', e.target.value);
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.handleSearch(e.target.value);
                }, 300);
            };
            
            librarySearchInput.addEventListener('input', handleSearchInput);
            librarySearchInput.addEventListener('keyup', handleSearchInput);
            librarySearchInput.addEventListener('paste', (e) => {
                setTimeout(() => handleSearchInput(e), 10);
            });
            
            // Ensure the input is focusable
            librarySearchInput.setAttribute('tabindex', '0');
            
            // Test click handler
            librarySearchInput.addEventListener('click', () => {
                console.log('Search input clicked');
                librarySearchInput.focus();
            });
            
        } else {
            console.warn('Library search input not found, retrying...');
            // Retry after a short delay in case DOM isn't fully loaded
            setTimeout(() => this.initializeSearchInput(), 100);
        }

        
        // Resource filter checkbox
        const resourceFilter = document.getElementById('resourceFilter');
        if (resourceFilter) {
            resourceFilter.addEventListener('change', (e) => {
                this.handleResourceFilter(e.target.checked);
            });
        }
    }

    /**
     * Load songs data
     * @param {Array} songs - Array of song objects
     */
    loadSongs(songs) {
        this.songs = songs || [];
        this.filteredSongs = [...this.songs];
        this.render();
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
        
        this.render();
    }

    /**
     * Render the song explorer
     */
    render() {
        if (this.filteredSongs.length === 0) {
            this.renderEmptyState();
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

        this.container.innerHTML = `<ul class="song-tree">${html}</ul>`;
        this.attachTreeEventListeners();
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
            const path = require('path');
            const folder = song.file_path ? path.dirname(song.file_path) : 'Unknown Folder';
            const folderName = path.basename(folder);
            
            if (!groups.has(folderName)) {
                groups.set(folderName, []);
            }
            groups.get(folderName).push(song);
        });

        return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    }

    /**
     * Attach event listeners to tree elements
     */
    attachTreeEventListeners() {
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
        songItems.forEach(item => {
            item.addEventListener('click', () => {
                const songId = parseInt(item.dataset.songId);
                this.selectSong(songId);
            });
        });

        // Artist/Album/Folder selection (expand on click)
        const groupItems = this.container.querySelectorAll('.tree-item.artist, .tree-item.album, .tree-item.folder');
        groupItems.forEach(item => {
            item.addEventListener('click', () => {
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
        this.render();
    }

    /**
     * Select a song
     * @param {number} songId - Song ID
     */
    selectSong(songId) {
        const song = this.songs.find(s => s.id === songId);
        if (song) {
            this.selectedSong = song;
            this.render();
            
            // Emit selection event
            const event = new CustomEvent('songSelected', {
                detail: { song: song }
            });
            document.dispatchEvent(event);
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

// Create global instance
window.songExplorer = new SongExplorer('songExplorer');