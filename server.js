const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const DatabaseService = require('./database-service');
const ResourceFinder = require('./resource-finder');
const MP3Scanner = require('./mp3-scanner');
const MetadataExtractor = require('./metadata-extractor');
const ConfigManager = require('./config-manager');
const errorLogger = require('./error-logger');
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
        const { 
            title, artist, album, lyrics_content,
            lyrics_path, mp3_path, file_path, file_name,
            tablature_url, guitar_tab_url, bass_tab_url, lyrics_url, youtube_url 
        } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).json({ error: 'Song title is required' });
        }

        const songData = {
            title: title.trim(),
            artist: artist ? artist.trim() : '',
            album: album ? album.trim() : '',
            lyrics_content: lyrics_content || '',
            lyrics_path: lyrics_path || '',
            mp3_path: mp3_path || '',
            file_path: file_path || '',
            file_name: file_name || '',
            tablature_url: tablature_url || '',
            guitar_tab_url: guitar_tab_url || '',
            bass_tab_url: bass_tab_url || '',
            lyrics_url: lyrics_url || '',
            youtube_url: youtube_url || ''
        };

        console.log('Creating new song with data:', songData);
        const newSong = db.addSongWithMetadata(songData);
        
        if (newSong) {
            console.log('New song created:', newSong.id);
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
        const songId = req.params.id;
        console.log('PUT /api/songs/:id - Song ID:', songId);
        console.log('Request body:', req.body);
        
        const { 
            title, artist, album, lyrics_content,
            tablature_url, guitar_tab_url, bass_tab_url, lyrics_url, youtube_url 
        } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).json({ error: 'Song title is required' });
        }

        // Check if song exists first
        const existingSong = db.getSong(songId);
        console.log('Existing song:', existingSong ? 'found' : 'not found');

        if (!existingSong) {
            console.log('Song not found for ID:', songId);
            return res.status(404).json({ error: 'Song not found' });
        }

        // Use updateSongMetadata for comprehensive updates
        const metadata = {
            title: title.trim(),
            artist: artist ? artist.trim() : '',
            album: album ? album.trim() : '',
            lyrics_content: lyrics_content || '',
            tablature_url: tablature_url || '',
            guitar_tab_url: guitar_tab_url || '',
            bass_tab_url: bass_tab_url || '',
            lyrics_url: lyrics_url || '',
            youtube_url: youtube_url || '',
            user_edited: true  // Mark as user-edited when updated via UI
        };

        console.log('Metadata to update:', metadata);
        const updatedSong = db.updateSongMetadata(songId, metadata);
        console.log('Update result:', updatedSong ? 'success' : 'failed');
        
        if (updatedSong) {
            res.json(updatedSong);
        } else {
            res.status(500).json({ error: 'Failed to update song' });
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
        errorLogger.logError('Server', 'musicDiscovery', error, {
            endpoint: '/discover-music',
            method: 'GET'
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
            errorLogger.logError('Server', 'invalidDirectories', new Error('Invalid directories parameter'), {
                directories: directories,
                type: typeof directories,
                endpoint: '/scan-music'
            });
            return res.status(400).json({ error: 'Directories array is required' });
        }

        // Get all music files from selected directories
        const allFiles = [];
        for (const dir of directories) {
            try {
                const dirPath = typeof dir === 'string' ? dir : dir.path;
                
                // Check if directory is excluded
                if (configManager.isPathExcluded(dirPath)) {
                    continue;
                }
                
                const scanResult = await mp3Scanner.scanDirectoryForMusic(dirPath);
                
                // Extract file paths from the directory structure
                const dirFiles = mp3Scanner.getAllMusicFiles(scanResult.directories);
                
                // Filter out excluded paths from individual files
                const filteredFiles = dirFiles.filter(filePath => !configManager.isPathExcluded(filePath));
                const excludedCount = dirFiles.length - filteredFiles.length;
                
                allFiles.push(...filteredFiles);
            } catch (dirError) {
                console.error(`Error scanning directory ${dir.path || dir}:`, dirError);
                // Continue with other directories instead of failing completely
            }
        }


        // Reload configuration to pick up any changes to excluded paths
        configManager.reloadConfig();
        
        // Clean up songs from excluded paths before processing new files
        const config = configManager.getConfig();
        const excludedPaths = config.scan_directories.excluded_paths || [];
        const removedFromExcluded = db.cleanupExcludedPaths(excludedPaths);
        if (removedFromExcluded > 0) {
            console.log(`[Server]: Removed ${removedFromExcluded} songs from excluded paths`);
        }
        
        // Clean up songs with missing files (files that have been deleted from disk)
        const removedMissing = db.cleanupMissingSongs();
        if (removedMissing > 0) {
            console.log(`[Server]: Removed ${removedMissing} songs with missing files`);
        }

        // Handle existing vs new files, including re-adding previously removed songs
        const unprocessedFiles = [];
        const removedToRestore = [];
        
        for (const filePath of allFiles) {
            const existing = db.getSongByFilePath(filePath);
            if (!existing) {
                // File not in database - needs processing
                unprocessedFiles.push(filePath);
            } else if (existing.is_removed) {
                // File was previously marked as removed - restore it
                removedToRestore.push(existing.id);
            }
            // Skip files that exist and are not removed (already processed)
        }

        // Restore previously removed songs that were found again
        let restoredCount = 0;
        for (const songId of removedToRestore) {
            if (db.unmarkSongAsRemoved(songId)) {
                restoredCount++;
            }
        }


        // Limit processing for very large collections to prevent timeouts
        const maxFiles = 1000; // Process max 1000 files per request
        const filesToProcess = unprocessedFiles.slice(0, maxFiles);
        
        if (unprocessedFiles.length > maxFiles) {
        }

        // Extract metadata for unprocessed files
        let songsMetadata = [];
        if (filesToProcess.length > 0) {
            try {
                songsMetadata = await metadataExtractor.extractBatchMetadata(filesToProcess);
            } catch (metadataError) {
                errorLogger.logError('Server', 'metadataExtraction', metadataError, {
                    filesCount: filesToProcess.length,
                    endpoint: '/scan-music'
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
                existing: allFiles.length - unprocessedFiles.length - restoredCount,
                restored: restoredCount,
                removed: removedMissing + removedFromExcluded,
                removedMissing: removedMissing,
                removedExcluded: removedFromExcluded,
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
                existing: allFiles.length - unprocessedFiles.length - restoredCount,
                restored: restoredCount,
                removed: removedMissing + removedFromExcluded,
                removedMissing: removedMissing,
                removedExcluded: removedFromExcluded,
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

// Path addition endpoints with validation
app.post('/api/config/add-enabled-path', async (req, res) => {
    try {
        const { path } = req.body;
        
        if (!path) {
            return res.status(400).json({ error: 'Path is required' });
        }

        // Validate that the path exists
        if (!fs.existsSync(path)) {
            return res.status(400).json({ 
                error: 'Path does not exist',
                details: `The directory "${path}" could not be found on your system. Please verify the path is correct and try again.`
            });
        }

        // Check if it's actually a directory
        const stats = fs.statSync(path);
        if (!stats.isDirectory()) {
            return res.status(400).json({ 
                error: 'Path is not a directory',
                details: `"${path}" is not a directory. Please select a folder path.`
            });
        }

        // Get current config and add the path
        const config = configManager.getConfig();
        
        if (config.scan_directories.enabled_paths.includes(path)) {
            return res.status(400).json({ 
                error: 'Path already exists',
                details: `"${path}" is already in the enabled paths list.`
            });
        }

        // Add the path
        config.scan_directories.enabled_paths.push(path);
        
        // Try to save the config (this might require updating config-manager)
        try {
            configManager.saveConfig(config);
            res.json({ 
                success: true, 
                path: path,
                config: configManager.getConfig(),
                message: `Successfully added "${path}" to enabled paths.`
            });
        } catch (saveError) {
            // Fallback: just update in memory for this session
            res.json({ 
                success: true, 
                path: path,
                config: config,
                message: `Added "${path}" to enabled paths (temporary - will need manual config update for persistence).`
            });
        }
    } catch (error) {
        console.error('Error adding enabled path:', error);
        res.status(500).json({ 
            error: 'Failed to add enabled path',
            details: error.message 
        });
    }
});

app.post('/api/config/add-excluded-path', async (req, res) => {
    try {
        const { path } = req.body;
        
        if (!path) {
            return res.status(400).json({ error: 'Path is required' });
        }

        // For excluded paths, we don't require them to exist (they might be patterns or deleted paths)
        // But we do validate if it's provided as an absolute path that it exists
        if (path.includes(':') || path.startsWith('/')) {
            // This looks like an absolute path, validate it exists
            if (!fs.existsSync(path)) {
                return res.status(400).json({ 
                    error: 'Path does not exist',
                    details: `The directory "${path}" could not be found on your system. Please verify the path is correct and try again.`
                });
            }
        }

        // Get current config
        const config = configManager.getConfig();
        
        if (config.scan_directories.excluded_paths.includes(path)) {
            return res.status(400).json({ 
                error: 'Path already exists',
                details: `"${path}" is already in the excluded paths list.`
            });
        }

        // Add the path
        config.scan_directories.excluded_paths.push(path);
        
        // Clean up existing songs from excluded path
        const removedCount = db.cleanupExcludedPaths([path]);
        
        // Try to save the config
        try {
            configManager.saveConfig(config);
            res.json({ 
                success: true, 
                path: path,
                removedSongs: removedCount,
                config: configManager.getConfig(),
                message: `Successfully added "${path}" to excluded paths. ${removedCount > 0 ? `Removed ${removedCount} songs from this path.` : ''}`
            });
        } catch (saveError) {
            // Fallback: just update in memory for this session
            res.json({ 
                success: true, 
                path: path,
                removedSongs: removedCount,
                config: config,
                message: `Added "${path}" to excluded paths (temporary - will need manual config update for persistence). ${removedCount > 0 ? `Removed ${removedCount} songs from this path.` : ''}`
            });
        }
    } catch (error) {
        console.error('Error adding excluded path:', error);
        res.status(500).json({ 
            error: 'Failed to add excluded path',
            details: error.message 
        });
    }
});

// Path removal endpoints with cleanup
app.delete('/api/config/remove-enabled-path', async (req, res) => {
    try {
        const { path } = req.body;
        
        if (!path) {
            return res.status(400).json({ error: 'Path is required' });
        }

        // Get current config
        const config = configManager.getConfig();
        
        if (!config.scan_directories.enabled_paths.includes(path)) {
            return res.status(400).json({ 
                error: 'Path not found',
                details: `"${path}" is not in the enabled paths list.`
            });
        }

        // Remove the path from enabled paths
        const index = config.scan_directories.enabled_paths.indexOf(path);
        const removedPath = config.scan_directories.enabled_paths.splice(index, 1)[0];
        
        // Clean up songs from the removed path
        const remainingEnabledPaths = config.scan_directories.enabled_paths;
        const removedSongsCount = db.cleanupSongsFromRemovedPath(removedPath, remainingEnabledPaths);
        
        // Try to save the config
        try {
            configManager.saveConfig(config);
            res.json({ 
                success: true, 
                path: removedPath,
                removedSongs: removedSongsCount,
                config: configManager.getConfig(),
                message: `Successfully removed "${removedPath}" from enabled paths. ${removedSongsCount > 0 ? `Removed ${removedSongsCount} songs from this path.` : 'No songs were affected.'}`
            });
        } catch (saveError) {
            // Fallback: just update in memory for this session
            res.json({ 
                success: true, 
                path: removedPath,
                removedSongs: removedSongsCount,
                config: config,
                message: `Removed "${removedPath}" from enabled paths (temporary - will need manual config update for persistence). ${removedSongsCount > 0 ? `Removed ${removedSongsCount} songs from this path.` : 'No songs were affected.'}`
            });
        }
    } catch (error) {
        console.error('Error removing enabled path:', error);
        res.status(500).json({ 
            error: 'Failed to remove enabled path',
            details: error.message 
        });
    }
});

app.delete('/api/config/remove-excluded-path', async (req, res) => {
    try {
        const { path } = req.body;
        
        if (!path) {
            return res.status(400).json({ error: 'Path is required' });
        }

        // Get current config
        const config = configManager.getConfig();
        
        if (!config.scan_directories.excluded_paths.includes(path)) {
            return res.status(400).json({ 
                error: 'Path not found',
                details: `"${path}" is not in the excluded paths list.`
            });
        }

        // Remove the path from excluded paths
        const index = config.scan_directories.excluded_paths.indexOf(path);
        const removedPath = config.scan_directories.excluded_paths.splice(index, 1)[0];
        
        // Try to save the config
        try {
            configManager.saveConfig(config);
            res.json({ 
                success: true, 
                path: removedPath,
                config: configManager.getConfig(),
                message: `Successfully removed "${removedPath}" from excluded paths.`
            });
        } catch (saveError) {
            // Fallback: just update in memory for this session
            res.json({ 
                success: true, 
                path: removedPath,
                config: config,
                message: `Removed "${removedPath}" from excluded paths (temporary - will need manual config update for persistence).`
            });
        }
    } catch (error) {
        console.error('Error removing excluded path:', error);
        res.status(500).json({ 
            error: 'Failed to remove excluded path',
            details: error.message 
        });
    }
});

// Legacy endpoint - keeping for compatibility
app.post('/api/config/exclude-path', async (req, res) => {
    // Redirect to the new endpoint
    return await app._router.handle(
        { ...req, url: '/api/config/add-excluded-path', path: '/api/config/add-excluded-path' }, 
        res
    );
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
        // The user would need to manually update the jamber3-config.json file
        // For now, we'll return success but note that changes are temporary
        
        
        res.json({ 
            success: true, 
            message: 'Path configuration updated successfully',
            note: 'Changes are temporary and will not persist after restart. To make changes permanent, update jamber3-config.json manually.'
        });
    } catch (error) {
        console.error('Error updating path configuration:', error);
        res.status(500).json({ error: 'Failed to update path configuration' });
    }
});

// SETLIST API ENDPOINTS

// Get all setlists
app.get('/api/setlists', async (req, res) => {
    try {
        const setlists = db.getAllSetlists();
        res.json(setlists);
    } catch (error) {
        console.error('Error fetching setlists:', error);
        res.status(500).json({ error: 'Failed to fetch setlists' });
    }
});

// Create new setlist
app.post('/api/setlists', async (req, res) => {
    try {
        const { name } = req.body;
        
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Setlist name is required' });
        }

        const setlist = db.createSetlist(name.trim());
        
        if (setlist) {
            res.status(201).json(setlist);
        } else {
            res.status(500).json({ error: 'Failed to create setlist' });
        }
    } catch (error) {
        console.error('Error creating setlist:', error);
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ error: 'A setlist with this name already exists' });
        } else {
            res.status(500).json({ error: 'Failed to create setlist' });
        }
    }
});

// Delete setlist
app.delete('/api/setlists/:id', async (req, res) => {
    try {
        const success = db.deleteSetlist(parseInt(req.params.id));
        if (success) {
            res.json({ message: 'Setlist deleted successfully' });
        } else {
            res.status(404).json({ error: 'Setlist not found' });
        }
    } catch (error) {
        console.error('Error deleting setlist:', error);
        res.status(500).json({ error: 'Failed to delete setlist' });
    }
});

// Get songs in a setlist
app.get('/api/setlists/:id/songs', async (req, res) => {
    try {
        const songs = db.getSongsInSetlist(parseInt(req.params.id));
        res.json(songs);
    } catch (error) {
        console.error('Error fetching setlist songs:', error);
        res.status(500).json({ error: 'Failed to fetch setlist songs' });
    }
});

// Get setlists for a song
app.get('/api/songs/:id/setlists', async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const setlists = db.getSetlistsForSong(songId);
        res.json(setlists);
    } catch (error) {
        console.error('Error fetching song setlists:', error);
        res.status(500).json({ error: 'Failed to fetch song setlists' });
    }
});

// Add song to setlist
app.post('/api/songs/:id/setlists', async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const { setlistId } = req.body;
        
        if (!setlistId) {
            return res.status(400).json({ error: 'Setlist ID is required' });
        }

        const success = db.addSongToSetlist(songId, parseInt(setlistId));
        
        if (success) {
            res.json({ message: 'Song added to setlist successfully' });
        } else {
            res.status(500).json({ error: 'Failed to add song to setlist' });
        }
    } catch (error) {
        console.error('Error adding song to setlist:', error);
        res.status(500).json({ error: 'Failed to add song to setlist' });
    }
});

// Remove song from setlist
app.delete('/api/songs/:id/setlists/:setlistId', async (req, res) => {
    try {
        const songId = parseInt(req.params.id);
        const setlistId = parseInt(req.params.setlistId);
        
        const success = db.removeSongFromSetlist(songId, setlistId);
        
        if (success) {
            res.json({ message: 'Song removed from setlist successfully' });
        } else {
            res.status(404).json({ error: 'Song not found in setlist' });
        }
    } catch (error) {
        console.error('Error removing song from setlist:', error);
        res.status(500).json({ error: 'Failed to remove song from setlist' });
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

const server = app.listen(PORT, () => {
    console.log(`Jamber3 server running on http://localhost:${PORT}`);
    // Signal that the server is ready
    console.log('SERVER_READY');
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    
    // Close the HTTP server
    server.close(() => {
        console.log('HTTP server closed');
        
        // Close database connection
        if (db) {
            try {
                db.close();
                console.log('Database connection closed');
            } catch (error) {
                console.error('Error closing database:', error);
            }
        }
        
        // Exit the process
        process.exit(0);
    });
    
    // Force close after 5 seconds
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 5000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});