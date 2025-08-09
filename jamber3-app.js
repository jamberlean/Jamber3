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
                
                // Also refresh setlists dropdown
                await this.loadSetlists();
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

                // Also refresh setlists dropdown
                await this.loadSetlists();

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
     * Load setlists and populate dropdown
     */
    async loadSetlists() {
        try {
            const response = await fetch('/api/setlists');
            if (response.ok) {
                const setlists = await response.json();
                this.populateSetlistDropdown(setlists);
            }
        } catch (error) {
            console.error('Error loading setlists:', error);
        }
    }

    /**
     * Refresh the setlist dropdown with updated data
     */
    async refreshSetlistDropdown() {
        await this.loadSetlists();
    }

    /**
     * Populate the setlist filter dropdown
     * @param {Array} setlists - Array of setlist objects
     */
    populateSetlistDropdown(setlists) {
        const setlistFilter = document.getElementById('setlistFilter');
        if (!setlistFilter) return;

        // Store current selection to preserve it
        const currentSelection = setlistFilter.value;

        // Clear existing options except the first one - but do it more carefully
        const existingOptions = Array.from(setlistFilter.querySelectorAll('option')).filter(option => option.value !== '');
        existingOptions.forEach(option => option.remove());

        // Ensure we have the default option
        let defaultOption = setlistFilter.querySelector('option[value=""]');
        if (!defaultOption) {
            defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '- filter by setlist -';
            setlistFilter.insertBefore(defaultOption, setlistFilter.firstChild);
        } else {
            // Update text in case it changed
            defaultOption.textContent = '- filter by setlist -';
        }

        // Add setlist options
        setlists.forEach(setlist => {
            const option = document.createElement('option');
            option.value = setlist.id;
            option.textContent = `${setlist.name} (${setlist.song_count || 0})`;
            setlistFilter.appendChild(option);
        });

        // Restore previous selection if it still exists
        if (currentSelection && setlistFilter.querySelector(`option[value="${currentSelection}"]`)) {
            setlistFilter.value = currentSelection;
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

        // Help button
        const helpBtn = document.getElementById('helpBtn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => this.openHelp());
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
                if (processResults.new > 0 || processResults.removed > 0) {
                    message = `Scan complete!\n\nDiscovered: ${processResults.discovered} files\nProcessed: ${processResults.processed || processResults.discovered} files\nNew songs: ${processResults.new}\nAlready in library: ${processResults.existing}`;
                    
                    if (processResults.removed > 0) {
                        message += `\n\nRemoved ${processResults.removed} songs:`;
                        if (processResults.removedMissing > 0) {
                            message += `\n  • ${processResults.removedMissing} deleted files`;
                        }
                        if (processResults.removedExcluded > 0) {
                            message += `\n  • ${processResults.removedExcluded} from excluded paths`;
                        }
                    }
                } else {
                    message = `Scan complete!\n\nDiscovered: ${processResults.discovered} files\nProcessed: ${processResults.processed || processResults.discovered} files\nNo new songs found. ${processResults.existing} songs were already in your library.`;
                    
                    if (processResults.removed > 0) {
                        message += `\n\nRemoved ${processResults.removed} songs:`;
                        if (processResults.removedMissing > 0) {
                            message += `\n  • ${processResults.removedMissing} deleted files`;
                        }
                        if (processResults.removedExcluded > 0) {
                            message += `\n  • ${processResults.removedExcluded} from excluded paths`;
                        }
                    }
                }
                
                if (processResults.truncated) {
                    message += `\n\n⚠️ Large collection detected!\nOnly the first 1000 files were processed.\nRun scan again to process more files.`;
                }
                
                // Use a custom modal instead of alert to avoid breaking input focus
                this.showScanResults(message);
                
                // Ensure search input remains functional
                setTimeout(() => {
                    if (window.songExplorer) {
                        window.songExplorer.restoreSearchInput();
                    }
                }, 200);
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
     * Open help modal
     */
    async openHelp() {
        try {
            // Load help content from help.html
            const response = await fetch('/help.html');
            if (!response.ok) {
                throw new Error('Failed to load help content');
            }
            const helpHtml = await response.text();
            
            // Extract the body content from the help HTML
            const parser = new DOMParser();
            const helpDoc = parser.parseFromString(helpHtml, 'text/html');
            const helpContent = helpDoc.querySelector('.help-container').outerHTML;
            
            await this.showHelpModal(helpContent);
        } catch (error) {
            console.error('Error loading help:', error);
            this.showError('Failed to load help content');
        }
    }

    /**
     * Show help modal with the provided content
     */
    async showHelpModal(helpContent) {
        // Remove existing modal if present
        const existingModal = document.getElementById('helpModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Load help CSS
        let helpStyles = '';
        try {
            const cssResponse = await fetch('/help-styles.css');
            if (cssResponse.ok) {
                helpStyles = `<style>${await cssResponse.text()}</style>`;
            }
        } catch (error) {
            console.warn('Could not load help styles:', error);
        }

        // Create modal HTML
        const modal = document.createElement('div');
        modal.id = 'helpModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content help-modal">
                <div class="modal-header">
                    <h2>Help</h2>
                    <button class="modal-close" id="helpModalClose">&times;</button>
                </div>
                <div class="modal-body">
                    ${helpStyles}
                    ${helpContent}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add event listeners
        const closeBtn = modal.querySelector('#helpModalClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('show');
                setTimeout(() => {
                    if (modal.parentNode) {
                        modal.parentNode.removeChild(modal);
                    }
                }, 300);
            });
        }

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
                setTimeout(() => {
                    if (modal.parentNode) {
                        modal.parentNode.removeChild(modal);
                    }
                }, 300);
            }
        });

        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
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
        // Show confirmation dialog
        const songDisplay = song.artist ? `"${song.title}" by ${song.artist}` : `"${song.title}"`;
        const confirmed = confirm(`Are you sure you want to delete ${songDisplay}?\n\nThis action cannot be undone.`);
        
        if (!confirmed) {
            return;
        }
        
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
            // Don't handle shortcuts when user is typing in an input field
            const activeElement = document.activeElement;
            const isTyping = activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.contentEditable === 'true'
            );
            
            // Skip shortcut handling if user is typing
            if (isTyping) {
                return;
            }
            
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
            
            // Also fetch setlists for the settings modal
            const setlistsResponse = await fetch('/api/setlists');
            const setlists = setlistsResponse.ok ? await setlistsResponse.json() : [];
            
            this.createSettingsModal(config, setlists);
        } catch (error) {
            console.error('Error loading settings:', error);
            this.showError('Failed to load settings');
        }
    }

    /**
     * Create and display the settings modal
     */
    createSettingsModal(config, setlists = []) {
        // Remove existing modal if present
        const existingModal = document.getElementById('settingsModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Also close any existing setlist input modal to prevent orphaned handlers
        const existingSetlistModal = document.getElementById('setlistInputModal');
        if (existingSetlistModal) {
            existingSetlistModal.remove();
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
                        <h3>Setlists</h3>
                        <p class="settings-description">Organize songs into custom groups and playlists:</p>
                        <div class="path-list" id="setListsList">
                            ${this.renderSetListsList(setlists)}
                        </div>
                        <button class="btn secondary" id="addNewSetList">Add New Setlist</button>
                    </div>
                    
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
        this.attachSettingsEventListeners(config, setlists);

        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
    }

    /**
     * Render setlists list with remove buttons
     */
    renderSetListsList(setlists) {
        if (!setlists || setlists.length === 0) {
            return '<div class="empty-state">No setlists created yet</div>';
        }

        return setlists.map((setlist, index) => `
            <div class="path-item" data-type="setlist" data-index="${index}" data-id="${setlist.id}">
                <span class="path-text">
                    <strong>${this.escapeHtml(setlist.name)}</strong>
                    ${setlist.description ? `<br><small>${this.escapeHtml(setlist.description)}</small>` : ''}
                    <small class="setlist-count">(${setlist.song_count || 0} songs)</small>
                </span>
                <button class="btn-icon remove-setlist" title="Remove setlist">
                    <span>🗑️</span>
                </button>
            </div>
        `).join('');
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
    attachSettingsEventListeners(config, setlists = []) {
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

        // Add setlist button - ensure DOM is ready
        setTimeout(() => {
            const addSetlistBtn = document.getElementById('addNewSetList');
            if (addSetlistBtn) {
                // Remove any existing listeners first
                addSetlistBtn.replaceWith(addSetlistBtn.cloneNode(true));
                const newAddSetlistBtn = document.getElementById('addNewSetList');
                newAddSetlistBtn.addEventListener('click', () => {
                    this.showAddSetListDialog();
                });
            }
        }, 10);

        // Add path buttons
        document.getElementById('addEnabledPath')?.addEventListener('click', () => {
            this.showAddPathDialog('enabled', config);
        });
        
        document.getElementById('addExcludedPath')?.addEventListener('click', () => {
            this.showAddPathDialog('excluded', config);
        });

        // Remove path buttons
        modal.querySelectorAll('.remove-path').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const pathItem = e.target.closest('.path-item');
                if (pathItem) {
                    await this.removePath(pathItem, config);
                }
            });
        });

        // Remove setlist buttons
        modal.querySelectorAll('.remove-setlist').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const setlistItem = e.target.closest('.path-item');
                if (setlistItem) {
                    await this.removeSetList(setlistItem);
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
        // Create modal dialog instead of using prompt
        this.createPathInputModal(type, config);
    }

    /**
     * Create path input modal dialog
     */
    createPathInputModal(type, config) {
        // Remove any existing path input modal
        const existingModal = document.getElementById('pathInputModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'pathInputModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content path-input-modal">
                <div class="modal-header">
                    <h2>Add ${type.charAt(0).toUpperCase() + type.slice(1)} Path</h2>
                    <button class="modal-close" id="pathInputModalClose">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="input-section">
                        <label for="pathInput">Directory Path:</label>
                        <input type="text" 
                               id="pathInput" 
                               placeholder="Enter full directory path (e.g., C:\\Music or /Users/username/Music)"
                               class="path-input-field">
                        <p class="input-description">
                            ${type === 'enabled' ? 
                                'Enter a directory path to scan for music files. The directory must exist on your system.' :
                                'Enter a directory path to exclude from scanning. Can be a full path or pattern.'}
                        </p>
                        <div id="pathValidationMessage" class="validation-message"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn primary" id="savePathBtn">Add Path</button>
                    <button class="btn secondary" id="cancelPathBtn">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        
        // Attach event listeners
        const closeBtn = document.getElementById('pathInputModalClose');
        const cancelBtn = document.getElementById('cancelPathBtn');
        const saveBtn = document.getElementById('savePathBtn');
        const pathInput = document.getElementById('pathInput');
        
        // Close modal handlers
        [closeBtn, cancelBtn].forEach(btn => {
            btn.addEventListener('click', () => this.closePathInputModal());
        });

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closePathInputModal();
            }
        });

        // Save path handler
        saveBtn.addEventListener('click', () => {
            const path = pathInput.value.trim();
            if (path) {
                this.addPathWithValidation(type, path, config);
            } else {
                this.showPathValidationMessage('Please enter a directory path.', 'error');
            }
        });

        // Enter key handler
        pathInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const path = pathInput.value.trim();
                if (path) {
                    this.addPathWithValidation(type, path, config);
                }
            }
        });

        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
            pathInput.focus();
        }, 10);
    }

    /**
     * Close path input modal
     */
    closePathInputModal() {
        const modal = document.getElementById('pathInputModal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    }

    /**
     * Show validation message in path input modal
     */
    showPathValidationMessage(message, type = 'info') {
        const msgElement = document.getElementById('pathValidationMessage');
        if (msgElement) {
            msgElement.textContent = message;
            msgElement.className = `validation-message ${type}`;
        }
    }

    /**
     * Add a new path with server-side validation
     */
    async addPathWithValidation(type, newPath, config) {
        try {
            // Show loading state
            this.showPathValidationMessage('Validating path...', 'info');
            
            const endpoint = type === 'enabled' ? '/api/config/add-enabled-path' : '/api/config/add-excluded-path';
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path: newPath })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Success - close modal and refresh
                this.closePathInputModal();
                this.showMessage(result.message || `Successfully added "${newPath}" to ${type} paths.`, 'success');
                
                // Refresh the settings modal with updated config
                setTimeout(() => {
                    this.createSettingsModal(result.config);
                }, 500);
            } else {
                // Show error message
                this.showPathValidationMessage(
                    result.details || result.error || 'Failed to add path', 
                    'error'
                );
            }
        } catch (error) {
            console.error('Error adding path:', error);
            this.showPathValidationMessage('Network error: Could not add path.', 'error');
        }
    }

    /**
     * Remove a path from the configuration with server-side processing
     */
    async removePath(pathItem, config) {
        const type = pathItem.dataset.type;
        const index = parseInt(pathItem.dataset.index);
        
        let pathToRemove;
        if (type === 'enabled') {
            pathToRemove = config.scan_directories.enabled_paths[index];
        } else if (type === 'excluded') {
            pathToRemove = config.scan_directories.excluded_paths[index];
        }

        if (!pathToRemove) {
            console.error('Could not determine path to remove');
            return;
        }

        // Show confirmation dialog
        const pathDisplay = pathToRemove.length > 50 ? 
            pathToRemove.substring(0, 50) + '...' : 
            pathToRemove;

        let confirmMessage = `Are you sure you want to remove this ${type} path?\n\n${pathDisplay}`;
        
        if (type === 'enabled') {
            confirmMessage += '\n\n⚠️ WARNING: All songs from this folder will be removed from your library!';
        }

        const confirmed = confirm(confirmMessage);
        if (!confirmed) {
            return;
        }

        try {
            // Call the appropriate server endpoint
            const endpoint = type === 'enabled' ? 
                '/api/config/remove-enabled-path' : 
                '/api/config/remove-excluded-path';
            
            const response = await fetch(endpoint, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path: pathToRemove })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Success - show message and refresh settings modal
                this.showMessage(result.message || `Successfully removed "${pathToRemove}" from ${type} paths.`, 'success');
                
                // Refresh the settings modal with updated config
                setTimeout(() => {
                    this.createSettingsModal(result.config);
                }, 1000);

                // Refresh the song list if songs were removed
                if (result.removedSongs && result.removedSongs > 0) {
                    setTimeout(() => {
                        if (window.jamber3App) {
                            window.jamber3App.loadSongs();
                        }
                    }, 1500);
                }
            } else {
                // Show error message
                this.showError(result.details || result.error || 'Failed to remove path');
            }
        } catch (error) {
            console.error('Error removing path:', error);
            this.showError('Network error: Could not remove path.');
        }
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
            btn.addEventListener('click', async (e) => {
                const pathItem = e.target.closest('.path-item');
                if (pathItem) {
                    await this.removePath(pathItem, config);
                }
            });
        });
    }

    /**
     * Show dialog to add a new setlist
     */
    showAddSetListDialog() {
        // Create modal dialog for setlist creation
        this.createSetListInputModal();
    }

    /**
     * Create setlist input modal dialog
     */
    createSetListInputModal() {
        // Remove any existing modal completely - force cleanup
        const existingModal = document.getElementById('setlistInputModal');
        if (existingModal) {
            // Remove all event listeners by cloning and replacing
            const cleanModal = existingModal.cloneNode(true);
            if (existingModal.parentNode) {
                existingModal.parentNode.removeChild(existingModal);
            }
        }
        
        // Also clear any potential input field references that might be cached
        window.setlistNameInputRef = null;

        // Create fresh modal
        const modalHtml = `
            <div id="setlistInputModal" class="modal-overlay">
                <div class="modal-content path-input-modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>Add New Setlist</h2>
                        <button class="modal-close" onclick="window.jamber3App.closeSetListInputModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="input-section">
                            <label for="setlistNameInput">Name:</label>
                            <input type="text" 
                                   id="setlistNameInput" 
                                   placeholder="Enter setlist name"
                                   class="path-input-field">
                                   
                            <div id="setlistValidationMessage" class="validation-message"></div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn primary" onclick="window.jamber3App.saveSetlistFromModal()">Create Setlist</button>
                        <button class="btn secondary" onclick="window.jamber3App.closeSetListInputModal()">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Get modal and input with fresh references
        const modal = document.getElementById('setlistInputModal');
        const nameInput = document.getElementById('setlistNameInput');
        
        // Store reference for debugging
        window.setlistNameInputRef = nameInput;
        
        // Ensure input is completely reset
        nameInput.value = '';
        nameInput.disabled = false;
        nameInput.readOnly = false;
        
        // Remove any existing event listeners on the input first
        nameInput.onkeydown = null;
        nameInput.oninput = null;
        nameInput.onchange = null;
        nameInput.onclick = null;
        nameInput.onfocus = null;
        nameInput.onblur = null;
        
        // Simple click outside handler
        modal.onclick = function(e) {
            if (e.target === modal) {
                window.jamber3App.closeSetListInputModal();
            }
        };
        
        // Use addEventListener for more reliable event handling
        nameInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.jamber3App.saveSetlistFromModal();
            }
        });
        
        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
            // Focus input after animation starts and ensure it's ready
            setTimeout(() => {
                nameInput.focus();
                // Force cursor to appear
                nameInput.click();
                // Verify input is working by testing it
                console.log('Input element state:', {
                    disabled: nameInput.disabled,
                    readOnly: nameInput.readOnly,
                    tabIndex: nameInput.tabIndex,
                    focused: document.activeElement === nameInput
                });
            }, 100);
        }, 10);
    }
    
    /**
     * Save setlist from modal
     */
    saveSetlistFromModal() {
        const nameInput = document.getElementById('setlistNameInput');
        if (nameInput) {
            const name = nameInput.value.trim();
            if (name) {
                this.createSetListWithValidation(name);
            } else {
                this.showSetListValidationMessage('Please enter a setlist name.', 'error');
            }
        }
    }

    /**
     * Close setlist input modal
     */
    closeSetListInputModal() {
        const modal = document.getElementById('setlistInputModal');
        if (modal) {
            modal.classList.remove('show');
            
            setTimeout(() => {
                if (modal.parentNode) {
                    modal.remove();
                }
            }, 300);
        }
    }

    /**
     * Show validation message in setlist input modal
     */
    showSetListValidationMessage(message, type = 'info') {
        const msgElement = document.getElementById('setlistValidationMessage');
        if (msgElement) {
            msgElement.textContent = message;
            msgElement.className = `validation-message ${type}`;
        }
    }

    /**
     * Create a new setlist with server-side validation
     */
    async createSetListWithValidation(name) {
        try {
            // Show loading state
            this.showSetListValidationMessage('Creating setlist...', 'info');
            
            const response = await fetch('/api/setlists', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name })
            });

            const result = await response.json();

            if (response.ok) {
                // Success - close modal and refresh settings
                this.closeSetListInputModal();
                
                // Refresh the settings modal and main dropdown
                setTimeout(async () => {
                    try {
                        const configResponse = await fetch('/api/config');
                        const setlistsResponse = await fetch('/api/setlists');
                        
                        if (configResponse.ok && setlistsResponse.ok) {
                            const config = await configResponse.json();
                            const setlists = await setlistsResponse.json();
                            this.createSettingsModal(config, setlists);
                            
                            // Also refresh main dropdown
                            this.populateSetlistDropdown(setlists);
                        }
                    } catch (error) {
                        console.error('Error refreshing settings:', error);
                    }
                }, 500);
            } else {
                // Show error message
                this.showSetListValidationMessage(
                    result.error || 'Failed to create setlist', 
                    'error'
                );
            }
        } catch (error) {
            console.error('Error creating setlist:', error);
            this.showSetListValidationMessage('Network error: Could not create setlist.', 'error');
        }
    }

    /**
     * Remove a setlist
     */
    async removeSetList(setlistItem) {
        const setlistId = parseInt(setlistItem.dataset.id);
        const setlistName = setlistItem.querySelector('.path-text strong').textContent;

        // Show confirmation dialog
        const confirmed = confirm(`Are you sure you want to delete the setlist "${setlistName}"?\n\nThis will remove the setlist but songs will remain in your library.`);
        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(`/api/setlists/${setlistId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // Refresh the settings modal and main dropdown
                setTimeout(async () => {
                    try {
                        const configResponse = await fetch('/api/config');
                        const setlistsResponse = await fetch('/api/setlists');
                        
                        if (configResponse.ok && setlistsResponse.ok) {
                            const config = await configResponse.json();
                            const setlists = await setlistsResponse.json();
                            this.createSettingsModal(config, setlists);
                            
                            // Also refresh main dropdown
                            this.populateSetlistDropdown(setlists);
                        }
                    } catch (error) {
                        console.error('Error refreshing settings:', error);
                    }
                }, 1000);
            } else {
                const result = await response.json();
                this.showError(result.error || 'Failed to delete setlist');
            }
        } catch (error) {
            console.error('Error deleting setlist:', error);
            this.showError('Network error: Could not delete setlist.');
        }
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
     * Show scan results in a custom modal
     */
    showScanResults(message) {
        // Create modal overlay
        const overlay = document.createElement('div');
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
        modal.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 8px;
            width: 450px;
            height: 320px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        `;
        
        // Add dark theme support
        if (document.body.classList.contains('dark-theme')) {
            modal.style.background = '#2d3748';
            modal.style.color = '#e2e8f0';
        }
        
        // Create content
        const title = document.createElement('h2');
        title.textContent = 'Scan Results';
        title.style.cssText = `
            margin: 0 0 15px 0;
            flex-shrink: 0;
        `;
        
        const contentContainer = document.createElement('div');
        contentContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            margin-bottom: 15px;
            padding-right: 10px;
        `;
        
        const content = document.createElement('pre');
        content.textContent = message;
        content.style.cssText = `
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: inherit;
            margin: 0;
            line-height: 1.5;
        `;
        
        contentContainer.appendChild(content);
        
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            flex-shrink: 0;
            text-align: center;
            padding-top: 10px;
            border-top: 1px solid #e9ecef;
        `;
        
        const button = document.createElement('button');
        button.textContent = 'OK';
        button.style.cssText = `
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 30px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
        `;
        
        button.addEventListener('click', () => {
            document.body.removeChild(overlay);
            // Restore search input after modal closes with proper cleanup
            setTimeout(() => {
                if (window.songExplorer) {
                    window.songExplorer.restoreSearchInput();
                    // Force re-focus on search input if needed
                    const searchInput = document.getElementById('librarySearchInput');
                    if (searchInput) {
                        searchInput.focus();
                        searchInput.blur();
                        // Re-enable all input capabilities
                        searchInput.style.pointerEvents = 'auto';
                        searchInput.style.zIndex = 'auto';
                        searchInput.tabIndex = 0;
                    }
                }
            }, 100);
        });
        
        buttonContainer.appendChild(button);
        
        // Allow closing with Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(overlay);
                document.removeEventListener('keydown', handleEscape);
                // Restore search input after modal closes with proper cleanup
                setTimeout(() => {
                    if (window.songExplorer) {
                        window.songExplorer.restoreSearchInput();
                        // Force re-focus on search input if needed
                        const searchInput = document.getElementById('librarySearchInput');
                        if (searchInput) {
                            searchInput.focus();
                            searchInput.blur();
                            // Re-enable all input capabilities
                            searchInput.style.pointerEvents = 'auto';
                            searchInput.style.zIndex = 'auto';
                            searchInput.tabIndex = 0;
                        }
                    }
                }, 100);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // Update dark theme border color
        if (document.body.classList.contains('dark-theme')) {
            buttonContainer.style.borderTopColor = '#4a5568';
        }
        
        modal.appendChild(title);
        modal.appendChild(contentContainer);
        modal.appendChild(buttonContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Focus the button
        button.focus();
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