/**
 * Main Jamber3 Application Controller
 * Coordinates all components and handles application-level logic
 */
class Jamber3App {
    constructor() {
        this.currentTheme = 'light';
        this.shortcuts = new Map();
        this.isScanning = false;
        
        this.initializeApp();
    }

    /**
     * Initialize the application
     */
    async initializeApp() {
        try {
            // Load configuration and check if first launch
            await this.loadConfiguration();
            
            // Initialize keyboard shortcuts
            this.initializeKeyboardShortcuts();
            
            // Load existing songs and show progress
            await this.loadSongsWithProgress();
            
            // Initialize event listeners
            this.initializeEventListeners();
            
            console.log('Jamber3 initialized successfully');
        } catch (error) {
            console.error('Error initializing Jamber3:', error);
            this.showError('Failed to initialize application');
        }
    }

    /**
     * Load application configuration
     */
    async loadConfiguration() {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                this.config = await response.json();
                this.currentTheme = this.config.ui_preferences?.theme || 'light';
                this.applyTheme(this.currentTheme);
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
        }
    }

    /**
     * Load songs from database
     */
    async loadSongs() {
        try {
            const response = await fetch('/api/songs');
            if (response.ok) {
                const songs = await response.json();
                window.songExplorer.loadSongs(songs);
            }
        } catch (error) {
            console.error('Error loading songs:', error);
        }
    }

    /**
     * Load songs with progress indication
     */
    async loadSongsWithProgress() {
        try {
            // Show loading indicator
            window.progressIndicator.show('loading-songs', {
                message: 'Loading music library...',
                progress: 0
            });

            const response = await fetch('/api/songs');
            if (response.ok) {
                window.progressIndicator.update('loading-songs', {
                    message: 'Processing songs...',
                    progress: 50
                });

                const songs = await response.json();
                window.songExplorer.loadSongs(songs);

                window.progressIndicator.update('loading-songs', {
                    message: `Loaded ${songs.length} songs`,
                    progress: 100
                });

                // Hide progress after a brief moment
                setTimeout(() => {
                    window.progressIndicator.hide('loading-songs');
                }, 1000);
            }
        } catch (error) {
            console.error('Error loading songs:', error);
            window.progressIndicator.hide('loading-songs');
            this.showError('Failed to load music library');
        }
    }


    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        // Scan button
        const scanBtn = document.getElementById('scanBtn');
        if (scanBtn) {
            scanBtn.addEventListener('click', () => this.startMusicScan());
        }

        // Settings button
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openSettings());
        }

        // Listen for song events
        document.addEventListener('editSong', (e) => {
            this.editSong(e.detail.song);
        });

        document.addEventListener('deleteSong', (e) => {
            this.deleteSong(e.detail.song);
        });

        // Theme toggle is handled by keyboard shortcuts
    }

    /**
     * Start music scanning process
     */
    async startMusicScan() {
        console.log('startMusicScan called');
        
        // Check if we're already scanning
        if (this.isScanning) {
            console.warn('Scan already in progress, ignoring duplicate request');
            return;
        }
        
        this.isScanning = true;
        
        const progressId = window.progressIndicator.show('music-scan', {
            title: 'Scanning for Music',
            message: 'Discovering music directories...',
            showProgress: true,
            phases: ['Discover', 'Analyze', 'Process', 'Complete'],
            cancellable: true,
            onCancel: () => {
                // Could implement scan cancellation here
                window.progressIndicator.hide('music-scan');
            }
        });

        try {
            // Phase 1: Discover directories
            window.progressIndicator.update('music-scan', {
                phase: 0,
                message: 'Discovering music directories...',
                progress: 10
            });

            const discoverResponse = await fetch('/api/scan/discover', {
                method: 'POST'
            });

            if (!discoverResponse.ok) {
                let errorMessage = 'Failed to discover music directories';
                try {
                    const errorData = await discoverResponse.json();
                    if (errorData.details) {
                        errorMessage = errorData.details;
                    } else if (errorData.error) {
                        errorMessage = errorData.error;
                    }
                } catch (parseError) {
                    // Fall back to default message
                }
                throw new Error(errorMessage);
            }

            const discoveryResults = await discoverResponse.json();

            // Phase 2: Show results and get user selection
            window.progressIndicator.update('music-scan', {
                phase: 1,
                message: `Found ${discoveryResults.standard_directories.length + discoveryResults.discovered_directories.length} directories`,
                progress: 30
            });

            // For now, auto-select all found directories
            // In a full implementation, you'd show a selection dialog
            const allDirectories = [
                ...discoveryResults.standard_directories,
                ...discoveryResults.discovered_directories
            ];

            if (allDirectories.length === 0) {
                window.progressIndicator.hide('music-scan');
                alert('No music directories found. You can add songs manually or configure custom directories in Settings.');
                return;
            }

            // Phase 3: Process selected directories
            window.progressIndicator.update('music-scan', {
                phase: 2,
                message: `Processing ${allDirectories.length} directories...`,
                progress: 50
            });

            const processResponse = await fetch('/api/scan/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ directories: allDirectories })
            });

            if (!processResponse.ok) {
                throw new Error('Failed to process music files');
            }

            const processResults = await processResponse.json();

            // Phase 4: Complete
            window.progressIndicator.update('music-scan', {
                phase: 3,
                message: `Scan complete: Found ${processResults.new} new songs`,
                progress: 100
            });

            // Reload songs in the explorer
            await this.loadSongs();

            setTimeout(() => {
                window.progressIndicator.hide('music-scan');
                
                let message = '';
                if (processResults.new > 0) {
                    message = `Scan complete!\n\nDiscovered: ${processResults.discovered} files\nProcessed: ${processResults.processed || processResults.discovered} files\nNew songs: ${processResults.new}\nAlready in library: ${processResults.existing}`;
                } else {
                    message = `Scan complete!\n\nDiscovered: ${processResults.discovered} files\nProcessed: ${processResults.processed || processResults.discovered} files\nNo new songs found. ${processResults.existing} songs were already in your library.`;
                }
                
                if (processResults.truncated) {
                    message += `\n\n⚠️ Large collection detected!\nOnly the first 1000 files were processed.\nRun scan again to process more files.`;
                }
                
                alert(message);
            }, 1500);

        } catch (error) {
            console.error('Error during music scan:', error);
            window.progressIndicator.hide('music-scan');
            
            // Extract detailed error information if available
            let errorMessage = 'Music scan failed: ' + error.message;
            
            // If we have a detailed response from the server
            if (error.response) {
                try {
                    const errorData = await error.response.json();
                    if (errorData.details) {
                        errorMessage = `Music scan failed: ${errorData.details}`;
                    }
                } catch (parseError) {
                    // Fall back to the original error message
                }
            }
            
            this.showError(errorMessage);
        } finally {
            this.isScanning = false;
        }
    }

    /**
     * Open settings dialog
     */
    openSettings() {
        this.showSettingsModal();
    }

    /**
     * Edit a song
     */
    editSong(song) {
        // Trigger the existing edit modal
        if (window.app && window.app.editSong) {
            window.app.editSong(song.id);
        }
    }

    /**
     * Delete a song
     */
    async deleteSong(song) {
        try {
            const response = await fetch(`/api/songs/${song.id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // Reload songs
                await this.loadSongs();
                
                // Clear details if this song was selected
                if (window.songDetails.getCurrentSong()?.id === song.id) {
                    window.songDetails.clear();
                }
            } else {
                const error = await response.json();
                this.showError('Failed to delete song: ' + error.error);
            }
        } catch (error) {
            console.error('Error deleting song:', error);
            this.showError('Failed to delete song');
        }
    }

    /**
     * Initialize keyboard shortcuts
     */
    initializeKeyboardShortcuts() {
        const shortcuts = {
            'F1': () => this.showHelp(),
            'F5': () => this.loadSongs(),
            'F9': () => this.toggleTheme(),
            'Ctrl+S': () => this.startMusicScan(),
            'Ctrl+,': () => this.openSettings(),
            'Ctrl+B': () => this.downloadBackup(),
            'Delete': () => {
                const selected = window.songExplorer.getSelectedSong();
                if (selected) this.deleteSong(selected);
            },
            'F2': () => {
                const selected = window.songExplorer.getSelectedSong();
                if (selected) this.editSong(selected);
            }
        };

        document.addEventListener('keydown', (e) => {
            const key = this.getKeyString(e);
            const handler = shortcuts[key];
            
            if (handler) {
                e.preventDefault();
                handler();
            }
        });

        this.shortcuts = new Map(Object.entries(shortcuts));
    }

    /**
     * Get key string from keyboard event
     */
    getKeyString(e) {
        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        parts.push(e.key);
        return parts.join('+');
    }

    /**
     * Toggle theme between light and dark
     */
    async toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
        
        // Save preference
        try {
            await fetch('/api/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    section: 'ui_preferences',
                    updates: { theme: newTheme }
                })
            });
            this.currentTheme = newTheme;
        } catch (error) {
            console.error('Error saving theme preference:', error);
        }
    }

    /**
     * Apply theme to the application
     */
    applyTheme(theme) {
        document.body.classList.toggle('dark-theme', theme === 'dark');
    }

    /**
     * Show settings modal
     */
    async showSettingsModal() {
        try {
            // Get current configuration
            const response = await fetch('/api/config');
            if (!response.ok) {
                throw new Error('Failed to load configuration');
            }
            
            const config = await response.json();
            this.createSettingsModal(config);
        } catch (error) {
            console.error('Error loading settings:', error);
            this.showError('Failed to load settings');
        }
    }

    /**
     * Create and display the settings modal
     */
    createSettingsModal(config) {
        // Remove existing modal if present
        const existingModal = document.getElementById('settingsModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create modal HTML
        const modal = document.createElement('div');
        modal.id = 'settingsModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content settings-modal">
                <div class="modal-header">
                    <h2>Settings</h2>
                    <button class="modal-close" id="settingsModalClose">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="settings-section">
                        <h3>Enabled Scan Paths</h3>
                        <p class="settings-description">Directories that will be scanned for music files:</p>
                        <div class="path-list" id="enabledPathsList">
                            ${this.renderPathList(config.scan_directories?.enabled_paths || [], 'enabled')}
                        </div>
                        <button class="btn secondary" id="addEnabledPath">Add Enabled Path</button>
                    </div>
                    
                    <div class="settings-section">
                        <h3>Excluded Paths</h3>
                        <p class="settings-description">Directories that will be skipped during scanning:</p>
                        <div class="path-list" id="excludedPathsList">
                            ${this.renderPathList(config.scan_directories?.excluded_paths || [], 'excluded')}
                        </div>
                        <button class="btn secondary" id="addExcludedPath">Add Excluded Path</button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn primary" id="saveSettings">Save Changes</button>
                    <button class="btn secondary" id="cancelSettings">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.attachSettingsEventListeners(config);

        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
    }

    /**
     * Render a list of paths with remove buttons
     */
    renderPathList(paths, type) {
        if (!paths || paths.length === 0) {
            return '<div class="empty-state">No paths configured</div>';
        }

        return paths.map((path, index) => `
            <div class="path-item" data-type="${type}" data-index="${index}">
                <span class="path-text">${this.escapeHtml(path)}</span>
                <button class="btn-icon remove-path" title="Remove path">
                    <span>🗑️</span>
                </button>
            </div>
        `).join('');
    }

    /**
     * Attach event listeners to settings modal
     */
    attachSettingsEventListeners(config) {
        const modal = document.getElementById('settingsModal');
        
        // Close modal events
        const closeBtn = document.getElementById('settingsModalClose');
        const cancelBtn = document.getElementById('cancelSettings');
        
        [closeBtn, cancelBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => this.closeSettingsModal());
            }
        });

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeSettingsModal();
            }
        });

        // Add path buttons
        document.getElementById('addEnabledPath')?.addEventListener('click', () => {
            this.showAddPathDialog('enabled', config);
        });
        
        document.getElementById('addExcludedPath')?.addEventListener('click', () => {
            this.showAddPathDialog('excluded', config);
        });

        // Remove path buttons
        modal.querySelectorAll('.remove-path').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pathItem = e.target.closest('.path-item');
                if (pathItem) {
                    this.removePath(pathItem, config);
                }
            });
        });

        // Save settings
        document.getElementById('saveSettings')?.addEventListener('click', () => {
            this.saveSettingsChanges(config);
        });
    }

    /**
     * Close settings modal
     */
    closeSettingsModal() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    }

    /**
     * Show dialog to add a new path
     */
    showAddPathDialog(type, config) {
        const path = prompt(`Enter a new ${type} path:`);
        if (path && path.trim()) {
            this.addPath(type, path.trim(), config);
        }
    }

    /**
     * Add a new path to the configuration
     */
    addPath(type, newPath, config) {
        // Update the config object
        if (type === 'enabled') {
            if (!config.scan_directories.enabled_paths.includes(newPath)) {
                config.scan_directories.enabled_paths.push(newPath);
            }
        } else if (type === 'excluded') {
            if (!config.scan_directories.excluded_paths.includes(newPath)) {
                config.scan_directories.excluded_paths.push(newPath);
            }
        }

        // Re-render the path list
        this.refreshPathLists(config);
    }

    /**
     * Remove a path from the configuration
     */
    removePath(pathItem, config) {
        const type = pathItem.dataset.type;
        const index = parseInt(pathItem.dataset.index);

        if (type === 'enabled') {
            config.scan_directories.enabled_paths.splice(index, 1);
        } else if (type === 'excluded') {
            config.scan_directories.excluded_paths.splice(index, 1);
        }

        // Re-render the path lists
        this.refreshPathLists(config);
    }

    /**
     * Refresh all path lists in the modal
     */
    refreshPathLists(config) {
        document.getElementById('enabledPathsList').innerHTML = 
            this.renderPathList(config.scan_directories?.enabled_paths || [], 'enabled');
        document.getElementById('excludedPathsList').innerHTML = 
            this.renderPathList(config.scan_directories?.excluded_paths || [], 'excluded');
        
        // Re-attach event listeners for the new remove buttons
        this.attachRemoveListeners(config);
    }

    /**
     * Attach event listeners to remove buttons
     */
    attachRemoveListeners(config) {
        const modal = document.getElementById('settingsModal');
        modal.querySelectorAll('.remove-path').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pathItem = e.target.closest('.path-item');
                if (pathItem) {
                    this.removePath(pathItem, config);
                }
            });
        });
    }

    /**
     * Save settings changes
     */
    async saveSettingsChanges(config) {
        try {
            const response = await fetch('/api/config/paths', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    enabled_paths: config.scan_directories.enabled_paths,
                    excluded_paths: config.scan_directories.excluded_paths
                })
            });

            if (response.ok) {
                this.closeSettingsModal();
                this.showMessage('Settings saved successfully!', 'success');
            } else {
                throw new Error('Failed to save settings');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showError('Failed to save settings');
        }
    }

    /**
     * Escape HTML entities
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Show a message to the user
     */
    showMessage(message, type = 'info') {
        // Simple message display - could be enhanced with a proper toast system
        alert(message);
    }

    /**
     * Show help information
     */
    showHelp() {
        const helpText = `
Jamber3 - Guitar Song Library Help

KEYBOARD SHORTCUTS:
F1 - Show this help
F5 - Refresh song list
F9 - Toggle dark/light theme
Ctrl+S - Scan for music files
Ctrl+, - Open settings
Ctrl+B - Download backup
Delete - Delete selected song
F2 - Edit selected song

USING JAMBER3:
1. Click "Scan for Music" to automatically discover music files
2. Browse songs in the left pane by Artist, Album, or Folder
3. Click a song to see details in the right pane
4. Use "Find Resources" to automatically discover guitar tabs and lyrics
5. Use the search box to filter songs
6. Check "Show only songs with resources" to filter by available tabs/lyrics

FINDING RESOURCES:
- Click any "Find" button in the song details to search for tabs or lyrics
- Review and accept the best matches from multiple sources
- Resources are automatically verified once accepted
- Manual URL entry is available as a fallback option

For more information, visit the Jamber3 documentation.
        `;
        
        alert(helpText);
    }

    /**
     * Download backup
     */
    async downloadBackup() {
        try {
            const response = await fetch('/api/backup');
            if (response.ok) {
                // The server sets the appropriate headers for download
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `jamber3-backup-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                window.progressIndicator.showNotification('Backup downloaded successfully');
            } else {
                throw new Error('Failed to create backup');
            }
        } catch (error) {
            console.error('Error downloading backup:', error);
            this.showError('Failed to download backup');
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        alert('Error: ' + message);
    }

    /**
     * Get application statistics
     */
    getStats() {
        const explorerStats = window.songExplorer.getStats();
        return {
            ...explorerStats,
            theme: this.currentTheme,
            shortcuts: Array.from(this.shortcuts.keys())
        };
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.jamber3App = new Jamber3App();
});