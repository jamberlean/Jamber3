const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const DatabaseService = require('./database-service');
const ResourceFinder = require('./resource-finder');
const MP3Scanner = require('./mp3-scanner');
const MetadataExtractor = require('./metadata-extractor');
const ConfigManager = require('./config-manager');

// Setup file logging
const LOG_FILE = path.join(__dirname, 'errors.log');

// Store original console functions first
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function logError(message, data = null) {
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}] [ERROR] ${message}`;
    
    if (data) {
        logEntry += `\nData: ${JSON.stringify(data, null, 2)}`;
    }
    
    logEntry += '\n';
    
    try {
        fs.appendFileSync(LOG_FILE, logEntry);
    } catch (error) {
        // Don't use console.error here to avoid recursion
        originalConsoleError('Failed to write to log file:', error);
    }
    
    // Also log to console using original function
    originalConsoleError(`[ERROR] ${message}`, data || '');
}

// Override console.error to also log to file (but avoid recursion)

let isLogging = false; // Prevent infinite recursion

console.error = function(...args) {
    if (!isLogging) {
        isLogging = true;
        try {
            fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [ERROR] ${args.join(' ')}\n`);
        } catch (error) {
            // Ignore log file errors to prevent recursion
        }
        isLogging = false;
    }
    originalConsoleError.apply(console, args);
};

// Initialize error log file
console.log('=== JAMBER3 SERVER STARTING ===');
console.log(`Server started at ${new Date().toISOString()}`);
console.log(`Working directory: ${__dirname}`);

const app = express();
const PORT = process.env.PORT || 8081;
const db = new DatabaseService();
const resourceFinder = new ResourceFinder();
const configManager = new ConfigManager();
const mp3Scanner = new MP3Scanner(configManager);
const metadataExtractor = new MetadataExtractor();

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase payload limit for large music collections
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname)));

// Serve audio files endpoint
app.get('/audio/:songId', async (req, res) => {
    try {
        const songId = parseInt(req.params.songId);
        const song = db.getSongById(songId);
        
        if (!song || !song.file_path) {
            return res.status(404).json({ error: 'Song not found' });
        }
        
        const filePath = song.file_path;
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Audio file not found on disk' });
        }
        
        // Get file stats for proper headers
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        
        // Set appropriate headers for audio streaming
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': fileSize,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache'
        });
        
        // Handle range requests for seeking
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            
            res.status(206);
            res.set({
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Content-Length': chunksize
            });
            
            const stream = fs.createReadStream(filePath, { start, end });
            stream.pipe(res);
        } else {
            // Stream the entire file
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
        }
        
    } catch (error) {
        console.error('Error serving audio file:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Set proper charset for all responses
app.use((req, res, next) => {
    res.charset = 'utf-8';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    next();
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/songs', async (req, res) => {
    try {
        const songs = db.getAllSongs();
        res.json(songs);
    } catch (error) {
        console.error('Error fetching songs:', error);
        res.status(500).json({ error: 'Failed to fetch songs' });
    }
});

app.post('/api/songs', async (req, res) => {
    try {
        const { title, artist, lyrics_path, mp3_path, tablature_url, youtube_url } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).json({ error: 'Song title is required' });
        }

        const songData = {
            title: title.trim(),
            artist: artist ? artist.trim() : '',
            lyrics_path: lyrics_path || '',
            mp3_path: mp3_path || '',
            tablature_url: tablature_url || '',
            youtube_url: youtube_url || ''
        };

        const newSong = db.addSong(songData);
        
        if (newSong) {
            res.status(201).json(newSong);
        } else {
            res.status(500).json({ error: 'Failed to add song' });
        }
    } catch (error) {
        console.error('Error adding song:', error);
        res.status(500).json({ error: 'Failed to add song' });
    }
});

app.get('/api/songs/:id', async (req, res) => {
    try {
        const song = db.getSong(req.params.id);
        if (song) {
            res.json(song);
        } else {
            res.status(404).json({ error: 'Song not found' });
        }
    } catch (error) {
        console.error('Error fetching song:', error);
        res.status(500).json({ error: 'Failed to fetch song' });
    }
});

app.put('/api/songs/:id', async (req, res) => {
    try {
        const { 
            title, artist, album, lyrics_content, tablature_content,
            tablature_url, guitar_tab_url, bass_tab_url, lyrics_url, youtube_url 
        } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).json({ error: 'Song title is required' });
        }

        // Use updateSongMetadata for comprehensive updates
        const metadata = {
            title: title.trim(),
            artist: artist ? artist.trim() : '',
            album: album ? album.trim() : '',
            lyrics_content: lyrics_content || '',
            tablature_content: tablature_content || '',
            tablature_url: tablature_url || '',
            guitar_tab_url: guitar_tab_url || '',
            bass_tab_url: bass_tab_url || '',
            lyrics_url: lyrics_url || '',
            youtube_url: youtube_url || '',
            user_edited: true  // Mark as user-edited when updated via UI
        };

        const updatedSong = db.updateSongMetadata(req.params.id, metadata);
        
        if (updatedSong) {
            res.json(updatedSong);
        } else {
            res.status(404).json({ error: 'Song not found' });
        }
    } catch (error) {
        console.error('Error updating song:', error);
        res.status(500).json({ error: 'Failed to update song' });
    }
});

app.delete('/api/songs/:id', async (req, res) => {
    try {
        const success = db.deleteSong(req.params.id);
        if (success) {
            res.json({ message: 'Song deleted successfully' });
        } else {
            res.status(404).json({ error: 'Song not found' });
        }
    } catch (error) {
        console.error('Error deleting song:', error);
        res.status(500).json({ error: 'Failed to delete song' });
    }
});

// Resource finding endpoints
app.post('/api/songs/:id/find-resources', async (req, res) => {
    try {
        const song = db.getSong(req.params.id);
        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const { resourceType } = req.body;
        
        if (resourceType && !['guitar_tabs', 'bass_tabs', 'lyrics'].includes(resourceType)) {
            return res.status(400).json({ error: 'Invalid resource type' });
        }

        let results;
        if (resourceType) {
            results = await resourceFinder.findResource(resourceType, song);
        } else {
            results = await resourceFinder.findAllResources(song);
        }

        res.json(results);
    } catch (error) {
        console.error('Error finding resources:', error);
        res.status(500).json({ error: 'Failed to find resources' });
    }
});

// Simple test endpoint
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'Server is working', 
        timestamp: new Date().toISOString(),
        scanner_state: {
            isScanning: mp3Scanner.isScanning,
            configManager: !!mp3Scanner.configManager
        }
    });
});

// Debug endpoint for permission checking
app.get('/api/debug/permissions', (req, res) => {
    try {
        const permissions = mp3Scanner.checkPermissions();
        res.json(permissions);
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to check permissions',
            details: error.message 
        });
    }
});

// Debug endpoint to reset scanner state
app.post('/api/debug/reset-scanner', (req, res) => {
    try {
        mp3Scanner.resetState();
        res.json({ 
            success: true, 
            message: 'Scanner state reset',
            isScanning: mp3Scanner.isScanning 
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to reset scanner',
            details: error.message 
        });
    }
});

// Music scanning endpoints
app.post('/api/scan/discover', async (req, res) => {
    try {
        // Always use the configured scan directories only
        const scanDirectories = configManager.getScanDirectories();
        const results = {
            standard_directories: [],
            discovered_directories: scanDirectories.map(dir => ({
                path: dir,
                fileCount: 0, // Will be calculated during processing
                status: 'configured'
            })),
            total_files: 0,
            locked: configManager.isLocked(),
            message: 'Using configured scan directories from jamber3-config.json.'
        };
        
        res.json(results);
    } catch (error) {
        logError('Error discovering music:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        
        // Always reset state after error to prevent stuck state
        mp3Scanner.resetState();
        
        res.status(500).json({ 
            error: 'Failed to discover music directories',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.post('/api/scan/process', async (req, res) => {
    try {
        const { directories } = req.body;
        
        if (!directories || !Array.isArray(directories)) {
            logError('Invalid directories parameter', { directories, type: typeof directories });
            return res.status(400).json({ error: 'Directories array is required' });
        }

        // Get all music files from selected directories
        const allFiles = [];
        for (const dir of directories) {
            try {
                console.log(`Scanning directory: ${dir.path || dir}`);
                const dirPath = typeof dir === 'string' ? dir : dir.path;
                
                // Check if directory is excluded
                if (configManager.isPathExcluded(dirPath)) {
                    console.log(`Skipping excluded directory: ${dirPath}`);
                    continue;
                }
                
                console.log(`Calling scanDirectoryForMusic with path: "${dirPath}"`);
                const scanResult = await mp3Scanner.scanDirectoryForMusic(dirPath);
                console.log(`scanDirectoryForMusic returned result with ${scanResult.fileCount} files`);
                
                // Extract file paths from the directory structure
                const dirFiles = mp3Scanner.getAllMusicFiles(scanResult.directories);
                
                // Filter out excluded paths from individual files
                const filteredFiles = dirFiles.filter(filePath => !configManager.isPathExcluded(filePath));
                const excludedCount = dirFiles.length - filteredFiles.length;
                
                allFiles.push(...filteredFiles);
                console.log(`Found ${dirFiles.length} files in ${dirPath}, ${excludedCount} excluded, ${filteredFiles.length} included`);
            } catch (dirError) {
                console.error(`Error scanning directory ${dir.path || dir}:`, dirError);
                // Continue with other directories instead of failing completely
            }
        }

        console.log(`Total files found: ${allFiles.length}`);

        // Reload configuration to pick up any changes to excluded paths
        configManager.reloadConfig();
        
        // Clean up songs from excluded paths before processing new files
        const config = configManager.getConfig();
        const excludedPaths = config.scan_directories.excluded_paths || [];
        console.log(`Current excluded paths: ${excludedPaths.length} paths`);
        const removedCount = db.cleanupExcludedPaths(excludedPaths);
        if (removedCount > 0) {
            console.log(`Cleaned up ${removedCount} songs from excluded paths`);
        }

        // Filter out files that already exist in database FIRST
        const unprocessedFiles = [];
        for (const filePath of allFiles) {
            const existing = db.getSongByFilePath(filePath);
            if (!existing) {
                unprocessedFiles.push(filePath);
            }
        }

        console.log(`Files already in database: ${allFiles.length - unprocessedFiles.length}`);
        console.log(`Unprocessed files: ${unprocessedFiles.length}`);

        // Limit processing for very large collections to prevent timeouts
        const maxFiles = 1000; // Process max 1000 files per request
        const filesToProcess = unprocessedFiles.slice(0, maxFiles);
        
        if (unprocessedFiles.length > maxFiles) {
            console.log(`Large collection of unprocessed files (${unprocessedFiles.length}). Processing first ${maxFiles} files.`);
        }

        // Extract metadata for unprocessed files
        let songsMetadata = [];
        if (filesToProcess.length > 0) {
            try {
                songsMetadata = await metadataExtractor.extractBatchMetadata(filesToProcess);
            } catch (metadataError) {
                logError('Error during metadata extraction', {
                    message: metadataError.message,
                    stack: metadataError.stack,
                    filesCount: filesToProcess.length
                });
                throw metadataError;
            }
        }

        // Add new songs to database
        if (songsMetadata.length > 0) {
            const addedSongs = db.addSongsBatch(songsMetadata);
            
            // Lock configuration after successful first scan
            if (!configManager.isLocked()) {
                configManager.lockConfiguration();
            }
            
            res.json({
                discovered: allFiles.length,
                processed: filesToProcess.length,
                new: songsMetadata.length,
                existing: allFiles.length - unprocessedFiles.length,
                remaining: unprocessedFiles.length - filesToProcess.length,
                songs: addedSongs,
                truncated: unprocessedFiles.length > maxFiles,
                locked: configManager.isLocked(),
                message: unprocessedFiles.length > maxFiles ? 
                    `${unprocessedFiles.length} unprocessed files found. Processed ${filesToProcess.length} files. Run scan again to process remaining ${unprocessedFiles.length - filesToProcess.length} files.` : 
                    unprocessedFiles.length === 0 ? 'All files have been processed.' : undefined
            });
        } else {
            res.json({
                discovered: allFiles.length,
                processed: filesToProcess.length,
                new: 0,
                existing: allFiles.length - unprocessedFiles.length,
                remaining: unprocessedFiles.length - filesToProcess.length,
                songs: [],
                truncated: unprocessedFiles.length > maxFiles,
                locked: configManager.isLocked(),
                message: unprocessedFiles.length > maxFiles ? 
                    `${unprocessedFiles.length} unprocessed files found. Processed ${filesToProcess.length} files. Run scan again to process remaining ${unprocessedFiles.length - filesToProcess.length} files.` : 
                    unprocessedFiles.length === 0 ? 'All files have been processed.' : undefined
            });
        }
    } catch (error) {
        console.error('Error processing scan:', error);
        console.error('Error stack:', error.stack);
        console.error('Error details:', {
            message: error.message,
            name: error.name,
            code: error.code
        });
        res.status(500).json({ 
            error: 'Failed to process scan',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Configuration endpoints
app.get('/api/config', (req, res) => {
    try {
        const config = configManager.getConfig();
        res.json(config);
    } catch (error) {
        console.error('Error getting config:', error);
        res.status(500).json({ error: 'Failed to get configuration' });
    }
});

app.put('/api/config', (req, res) => {
    try {
        const { section, updates } = req.body;
        
        if (!section || !updates) {
            return res.status(400).json({ error: 'Section and updates are required' });
        }

        const success = configManager.updateSection(section, updates);
        
        if (success) {
            res.json({ success: true, config: configManager.getConfig() });
        } else {
            res.status(500).json({ error: 'Failed to update configuration' });
        }
    } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).json({ error: 'Failed to update configuration' });
    }
});

app.post('/api/config/add-directory', (req, res) => {
    try {
        const { path } = req.body;
        
        if (!path) {
            return res.status(400).json({ error: 'Path is required' });
        }

        configManager.addScanDirectory(path);
        res.json({ success: true, directories: configManager.getScanDirectories() });
    } catch (error) {
        console.error('Error adding directory:', error);
        res.status(500).json({ error: error.message || 'Failed to add directory' });
    }
});

app.delete('/api/config/remove-directory', (req, res) => {
    try {
        const { path } = req.body;
        
        if (!path) {
            return res.status(400).json({ error: 'Path is required' });
        }

        configManager.removeScanDirectory(path);
        res.json({ success: true, directories: configManager.getScanDirectories() });
    } catch (error) {
        console.error('Error removing directory:', error);
        res.status(500).json({ error: 'Failed to remove directory' });
    }
});

// Configuration locking endpoints
app.post('/api/config/exclude-path', async (req, res) => {
    try {
        const { path } = req.body;
        
        if (!path) {
            return res.status(400).json({ error: 'Path is required' });
        }

        // Add to excluded paths
        const success = configManager.addExcludedPath(path);
        
        if (success) {
            // Clean up existing songs from excluded path
            const removedCount = db.cleanupExcludedPaths([path]);
            
            res.json({ 
                success: true, 
                path: path,
                removedSongs: removedCount,
                config: configManager.getConfig() 
            });
        } else {
            res.status(500).json({ error: 'Failed to exclude path' });
        }
    } catch (error) {
        console.error('Error excluding path:', error);
        res.status(500).json({ error: 'Failed to exclude path' });
    }
});

app.delete('/api/config/exclude-path', (req, res) => {
    try {
        const { path } = req.body;
        
        if (!path) {
            return res.status(400).json({ error: 'Path is required' });
        }

        const success = configManager.removeExcludedPath(path);
        
        if (success) {
            res.json({ 
                success: true, 
                path: path,
                config: configManager.getConfig() 
            });
        } else {
            res.status(500).json({ error: 'Failed to remove excluded path' });
        }
    } catch (error) {
        console.error('Error removing excluded path:', error);
        res.status(500).json({ error: 'Failed to remove excluded path' });
    }
});

app.post('/api/config/cleanup-excluded', async (req, res) => {
    try {
        const config = configManager.getConfig();
        const excludedPaths = config.scan_directories.excluded_paths;
        
        const removedCount = db.cleanupExcludedPaths(excludedPaths);
        
        res.json({ 
            success: true, 
            removedSongs: removedCount,
            excludedPaths: excludedPaths 
        });
    } catch (error) {
        console.error('Error cleaning up excluded paths:', error);
        res.status(500).json({ error: 'Failed to cleanup excluded paths' });
    }
});

app.post('/api/config/unlock', (req, res) => {
    try {
        const success = configManager.unlockConfiguration();
        
        if (success) {
            res.json({ 
                success: true, 
                locked: configManager.isLocked(),
                message: 'Configuration unlocked. Full rescan is now allowed.' 
            });
        } else {
            res.status(500).json({ error: 'Failed to unlock configuration' });
        }
    } catch (error) {
        console.error('Error unlocking configuration:', error);
        res.status(500).json({ error: 'Failed to unlock configuration' });
    }
});

app.get('/api/config/status', (req, res) => {
    try {
        res.json({
            locked: configManager.isLocked(),
            excludedPaths: configManager.getConfig().scan_directories.excluded_paths || []
        });
    } catch (error) {
        console.error('Error getting config status:', error);
        res.status(500).json({ error: 'Failed to get configuration status' });
    }
});

// Path management endpoint
app.put('/api/config/paths', (req, res) => {
    try {
        const { enabled_paths, excluded_paths } = req.body;
        
        // Validate input
        if (!Array.isArray(enabled_paths) || !Array.isArray(excluded_paths)) {
            return res.status(400).json({ error: 'Enabled and excluded path arrays are required' });
        }
        
        // Get current config
        const config = configManager.getConfig();
        
        // Update the paths
        config.scan_directories.enabled_paths = enabled_paths;
        config.scan_directories.excluded_paths = excluded_paths;
        
        // Note: Since the config is read-only, we can't save it directly
        // The user would need to manually update the tablary-config.json file
        // For now, we'll return success but note that changes are temporary
        
        console.log('Path configuration updated (temporary - not saved to file):');
        console.log('Enabled paths:', enabled_paths);
        console.log('Excluded paths:', excluded_paths);
        
        res.json({ 
            success: true, 
            message: 'Path configuration updated successfully',
            note: 'Changes are temporary and will not persist after restart. To make changes permanent, update tablary-config.json manually.'
        });
    } catch (error) {
        console.error('Error updating path configuration:', error);
        res.status(500).json({ error: 'Failed to update path configuration' });
    }
});

// Database backup endpoints
app.get('/api/backup', async (req, res) => {
    try {
        const backup = {
            timestamp: new Date().toISOString(),
            songs: db.getAllSongs(),
            config: configManager.getConfig(),
            version: '1.0.0'
        };
        
        res.setHeader('Content-Disposition', `attachment; filename="jamber3-backup-${new Date().toISOString().split('T')[0]}.json"`);
        res.setHeader('Content-Type', 'application/json');
        res.json(backup);
    } catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

app.post('/api/restore', (req, res) => {
    try {
        const { backup, merge } = req.body;
        
        if (!backup || !backup.songs) {
            return res.status(400).json({ error: 'Invalid backup data' });
        }

        let restoredCount = 0;
        
        if (merge) {
            // Merge mode: only add songs that don't exist
            for (const song of backup.songs) {
                const existing = db.getSongByFilePath(song.file_path);
                if (!existing) {
                    delete song.id; // Let database assign new ID
                    db.addSongWithMetadata(song);
                    restoredCount++;
                }
            }
        } else {
            // Replace mode: clear existing and restore all
            // Note: In a real implementation, you'd want better backup/restore
            console.warn('Full restore not implemented for safety');
            return res.status(400).json({ error: 'Full restore not supported yet' });
        }

        res.json({ 
            success: true, 
            restored: restoredCount,
            total: backup.songs.length 
        });
    } catch (error) {
        console.error('Error restoring backup:', error);
        res.status(500).json({ error: 'Failed to restore backup' });
    }
});

app.listen(PORT, () => {
    console.log(`Jamber3 server running on http://localhost:${PORT}`);
    // Signal that the server is ready
    console.log('SERVER_READY');
});