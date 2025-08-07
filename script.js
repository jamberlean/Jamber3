class SetListApp {
    constructor() {
        this.initializeElements();
        this.attachEventListeners();
        // Don't load songs immediately - let Jamber3App handle initial loading
    }

    initializeElements() {
        this.addSongBtn = document.getElementById('addSongBtn');
        this.modal = document.getElementById('addSongModal');
        this.modalTitle = document.getElementById('modalTitle');
        this.closeBtn = document.querySelector('.close');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.form = document.getElementById('addSongForm');
        this.submitBtn = document.getElementById('submitBtn');
        this.titleInput = document.getElementById('title');
        this.artistInput = document.getElementById('artist');
        this.lyricsInput = document.getElementById('lyrics');
        this.mp3Input = document.getElementById('mp3');
        this.tablatureInput = document.getElementById('tablature');
        this.lyricsContentInput = document.getElementById('lyrics-content');
        this.youtubeInput = document.getElementById('youtube');
        
        this.editingSongId = null;
    }

    attachEventListeners() {
        this.addSongBtn.addEventListener('click', () => this.openModal());
        this.closeBtn.addEventListener('click', () => this.closeModal());
        this.cancelBtn.addEventListener('click', () => this.closeModal());
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.titleInput.addEventListener('input', () => this.validateForm());
        
        this.lyricsInput.addEventListener('change', (e) => this.handleFileInput(e, 'lyrics'));
        this.mp3Input.addEventListener('change', (e) => this.handleFileInput(e, 'mp3'));

        window.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
            }
        });
    }

    openModal(mode = 'add', song = null) {
        this.editingSongId = song ? song.id : null;
        
        if (mode === 'edit' && song) {
            this.modalTitle.textContent = 'Edit Song';
            this.submitBtn.textContent = 'Save';
            this.populateForm(song);
        } else {
            this.modalTitle.textContent = 'Add New Song';
            this.submitBtn.textContent = 'Add Song';
        }
        
        this.modal.style.display = 'block';
        this.titleInput.focus();
    }

    closeModal() {
        this.modal.style.display = 'none';
        this.resetForm();
    }

    resetForm() {
        this.form.reset();
        this.artistGroup.style.display = 'none';
        this.originalRadio.checked = true;
        this.updateFileDisplay('lyrics', 'No file selected');
        this.updateFileDisplay('mp3', 'No file selected');
        this.editingSongId = null;
        this.validateForm();
    }

    populateForm(song) {
        this.titleInput.value = song.title;
        this.artistInput.value = song.artist || '';
        
        this.tablatureInput.value = song.tablature_url || '';
        this.lyricsContentInput.value = song.lyrics_content || '';
        this.youtubeInput.value = song.youtube_url || '';
        
        this.updateFileDisplay('lyrics', song.lyrics_path ? song.lyrics_path.split('\\').pop() || 'Selected file' : 'No file selected');
        this.updateFileDisplay('mp3', song.mp3_path ? song.mp3_path.split('\\').pop() || 'Selected file' : 'No file selected');
        
        this.validateForm();
    }

    handleFileInput(event, type) {
        const file = event.target.files[0];
        if (file) {
            this.updateFileDisplay(type, file.name);
        } else {
            this.updateFileDisplay(type, 'No file selected');
        }
    }

    updateFileDisplay(type, text) {
        const fileNameSpan = document.querySelector(`#${type} + .file-name`);
        if (fileNameSpan) {
            fileNameSpan.textContent = text;
        }
    }

    validateForm() {
        const title = this.titleInput.value.trim();
        this.submitBtn.disabled = title === '';
    }

    async handleSubmit(event) {
        event.preventDefault();
        
        const formData = new FormData(this.form);
        const songData = {
            title: formData.get('title').trim(),
            artist: formData.get('artist') ? formData.get('artist').trim() : '',
            lyrics_path: this.lyricsInput.files[0] ? this.lyricsInput.files[0].path || this.lyricsInput.files[0].name : (this.editingSongId ? this.getCurrentSong().lyrics_path : ''),
            lyrics_content: formData.get('lyrics-content') || '',
            mp3_path: this.mp3Input.files[0] ? this.mp3Input.files[0].path || this.mp3Input.files[0].name : (this.editingSongId ? this.getCurrentSong().mp3_path : ''),
            tablature_url: formData.get('tablature') || '',
            youtube_url: formData.get('youtube') || ''
        };

        try {
            const url = this.editingSongId ? `/api/songs/${this.editingSongId}` : '/api/songs';
            const method = this.editingSongId ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(songData)
            });

            if (response.ok) {
                this.closeModal();
                // Reload songs through the song explorer
                if (window.jamber3App) {
                    window.jamber3App.loadSongs();
                }
            } else {
                const error = await response.json();
                alert(`Error ${this.editingSongId ? 'updating' : 'adding'} song: ` + error.error);
            }
        } catch (error) {
            console.error(`Error ${this.editingSongId ? 'updating' : 'adding'} song:`, error);
            alert(`Error ${this.editingSongId ? 'updating' : 'adding'} song. Please try again.`);
        }
    }

    getCurrentSong() {
        return this.currentSongs.find(song => song.id === this.editingSongId) || {};
    }

    async editSong(songId) {
        try {
            const response = await fetch(`/api/songs/${songId}`);
            if (response.ok) {
                const song = await response.json();
                this.currentSongs = this.currentSongs || [];
                this.openModal('edit', song);
            } else {
                alert('Error loading song data');
            }
        } catch (error) {
            console.error('Error loading song:', error);
            alert('Error loading song data');
        }
    }

    async deleteSong(songId) {
        const song = this.currentSongs.find(s => s.id === songId);
        const songTitle = song ? song.title : `Song #${songId}`;
        
        if (!confirm(`Are you sure you want to delete "${songTitle}"?\n\nThis action cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/songs/${songId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // Reload songs through the song explorer
                if (window.jamber3App) {
                    window.jamber3App.loadSongs();
                }
            } else {
                const error = await response.json();
                alert('Error deleting song: ' + error.error);
            }
        } catch (error) {
            console.error('Error deleting song:', error);
            alert('Error deleting song. Please try again.');
        }
    }

    async loadSongs() {
        // This method is kept for backward compatibility but delegates to Jamber3App
        if (window.jamber3App) {
            await window.jamber3App.loadSongs();
        }
    }

    async openFile(filePath) {
        // Check if we're running in Electron
        if (typeof require !== 'undefined') {
            try {
                const { shell } = require('electron');
                const result = await shell.openPath(filePath);
                
                if (result) {
                    // If result is not empty, it means there was an error
                    console.error('Error opening file:', result);
                    this.showFilePath(filePath);
                } else {
                    console.log('File opened successfully:', filePath);
                }
            } catch (error) {
                console.error('Error opening file:', error);
                this.showFilePath(filePath);
            }
        } else {
            // Fallback for browser - show the file path
            this.showFilePath(filePath);
        }
    }

    showFilePath(filePath) {
        // Create a temporary dialog to show the file path
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 80%;
            word-break: break-all;
        `;
        
        dialog.innerHTML = `
            <h3>File Location</h3>
            <p style="margin: 10px 0; font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 4px;">${filePath}</p>
            <button onclick="this.parentElement.remove()" style="padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
        `;
        
        document.body.appendChild(dialog);
        
        // Auto-close after 5 seconds
        setTimeout(() => {
            if (dialog.parentElement) {
                dialog.remove();
            }
        }, 5000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeForJavaScript(text) {
        if (!text) return '';
        return text
            .replace(/\\/g, '\\\\')  // Escape backslashes first
            .replace(/'/g, "\\'")    // Escape single quotes
            .replace(/"/g, '\\"')    // Escape double quotes
            .replace(/\n/g, '\\n')   // Escape newlines
            .replace(/\r/g, '\\r')   // Escape carriage returns
            .replace(/\t/g, '\\t');  // Escape tabs
    }
}

const app = new SetListApp();