const fs = require('fs');
const path = require('path');
const os = require('os');

class MP3Scanner {
    constructor(configManager = null) {
        this.configManager = configManager;
        this.supportedExtensions = configManager ? 
            configManager.getFileFilters().supported_formats : 
            ['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.wma'];
        this.isScanning = false;
        this.shouldStop = false;
        
        console.log('MP3Scanner initialized, isScanning:', this.isScanning);
    }

    /**
     * Reset scanner state (for debugging)
     */
    resetState() {
        console.log('Resetting scanner state, was scanning:', this.isScanning);
        this.isScanning = false;
        this.shouldStop = false;
    }

    /**
     * Get standard music directories based on the operating system
     * @returns {string[]} Array of standard directory paths
     */
    getStandardMusicDirectories() {
        const homeDir = os.homedir();
        const platform = os.platform();
        const dirs = [];

        if (platform === 'win32') {
            // Windows standard directories
            dirs.push(
                path.join(homeDir, 'Music'),
                path.join(homeDir, 'Downloads'),
                path.join(homeDir, 'Documents'),
                path.join(homeDir, 'Desktop'),
                'C:\\Music',
                'D:\\Music',
                'C:\\Users\\Public\\Music'
            );
        } else if (platform === 'darwin') {
            // macOS standard directories
            dirs.push(
                path.join(homeDir, 'Music'),
                path.join(homeDir, 'Downloads'),
                path.join(homeDir, 'Documents'),
                path.join(homeDir, 'Desktop'),
                '/Users/Shared/Music'
            );
        } else {
            // Linux standard directories
            dirs.push(
                path.join(homeDir, 'Music'),
                path.join(homeDir, 'Downloads'),
                path.join(homeDir, 'Documents'),
                path.join(homeDir, 'Desktop'),
                '/home/music',
                '/usr/share/music'
            );
        }

        // Filter to only existing directories
        return dirs.filter(dir => this.directoryExists(dir));
    }

    /**
     * Check if a directory exists and is accessible
     * @param {string} dirPath - Directory path to check
     * @returns {boolean} True if directory exists and is accessible
     */
    directoryExists(dirPath) {
        try {
            const stats = fs.statSync(dirPath);
            return stats.isDirectory();
        } catch (error) {
            return false;
        }
    }

    /**
     * Check file system permissions and access
     * @returns {Object} Permission check results
     */
    checkPermissions() {
        const os = require('os');
        const homeDir = os.homedir();
        const permissions = {
            homeDir: homeDir,
            homeDirAccessible: false,
            musicDirAccessible: false,
            platform: process.platform,
            userInfo: {},
            standardDirs: []
        };

        try {
            // Check home directory access
            fs.accessSync(homeDir, fs.constants.R_OK);
            permissions.homeDirAccessible = true;
        } catch (error) {
            permissions.homeDirError = error.message;
        }

        try {
            // Check standard music directory access
            const musicDir = path.join(homeDir, 'Music');
            fs.accessSync(musicDir, fs.constants.R_OK);
            permissions.musicDirAccessible = true;
        } catch (error) {
            permissions.musicDirError = error.message;
        }

        try {
            // Get user info
            permissions.userInfo = os.userInfo();
        } catch (error) {
            permissions.userInfoError = error.message;
        }

        // Check standard directories
        const standardDirs = this.getStandardMusicDirectories();
        permissions.standardDirs = standardDirs.map(dir => ({
            path: dir,
            exists: this.directoryExists(dir),
            accessible: this.checkDirectoryAccess(dir)
        }));

        return permissions;
    }

    /**
     * Check if directory is accessible for reading
     * @param {string} dirPath - Directory path to check
     * @returns {boolean} True if accessible
     */
    checkDirectoryAccess(dirPath) {
        try {
            fs.accessSync(dirPath, fs.constants.R_OK);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Intelligent discovery of music directories
     * Combines standard directories with intelligent scanning for custom folders
     * @param {Function} progressCallback - Progress callback function
     * @returns {Promise<Object>} Discovery results with directories and suggestions
     */
    async discoverAllMusicDirectories(progressCallback = null) {
        console.log('discoverAllMusicDirectories called, isScanning:', this.isScanning);
        
        if (this.isScanning) {
            console.error('Scanner is already running! State:', {
                isScanning: this.isScanning,
                shouldStop: this.shouldStop,
                timestamp: new Date().toISOString()
            });
            throw new Error('Scanner is already running');
        }

        console.log('Starting music directory discovery...');
        this.isScanning = true;
        this.shouldStop = false;

        try {
            const results = {
                standard_directories: [],
                discovered_directories: [],
                suggested_directories: [],
                total_files: 0,
                scan_summary: {}
            };

            if (progressCallback) {
                progressCallback({
                    phase: 'initializing',
                    message: 'Initializing intelligent directory discovery...',
                    progress: 0
                });
            }

            // Phase 1: Scan standard directories
            let standardPaths;
            try {
                standardPaths = this.configManager ? 
                    this.configManager.getScanDirectories() : 
                    this.getStandardMusicDirectories();
                console.log('Standard paths found:', standardPaths);
            } catch (error) {
                console.error('Error getting standard paths:', error);
                standardPaths = this.getStandardMusicDirectories();
                console.log('Fallback to built-in paths:', standardPaths);
            }

            if (progressCallback) {
                progressCallback({
                    phase: 'standard',
                    message: 'Scanning standard music directories...',
                    progress: 10
                });
            }

            let standardResults;
            try {
                console.log('About to call discoverMusicDirectories with paths:', standardPaths);
                standardResults = await this.discoverMusicDirectories(standardPaths, (scanProgress) => {
                    if (progressCallback) {
                        progressCallback({
                            phase: 'standard',
                            message: `Scanning: ${scanProgress.currentPath}`,
                            progress: 10 + (scanProgress.filesFound / 100) // Rough progress
                        });
                    }
                });
                console.log('discoverMusicDirectories completed, results:', standardResults);
            } catch (error) {
                console.error('Error in discoverMusicDirectories:', error);
                throw error; // Re-throw to be caught by outer catch
            }

            results.standard_directories = standardResults;
            results.total_files += this.getAllMusicFiles(standardResults).length;

            // Phase 2: Intelligent discovery of additional directories
            if (progressCallback) {
                progressCallback({
                    phase: 'discovery',
                    message: 'Discovering additional music directories...',
                    progress: 50
                });
            }

            const discoveredPaths = await this.intelligentDirectoryDiscovery(progressCallback);
            
            // Scan discovered directories
            const discoveredResults = await this.discoverMusicDirectories(discoveredPaths, (scanProgress) => {
                if (progressCallback) {
                    progressCallback({
                        phase: 'discovery',
                        message: `Scanning discovered: ${scanProgress.currentPath}`,
                        progress: 50 + (scanProgress.filesFound / 100)
                    });
                }
            });

            results.discovered_directories = discoveredResults;
            results.total_files += this.getAllMusicFiles(discoveredResults).length;

            // Phase 3: Generate suggestions for user review
            if (progressCallback) {
                progressCallback({
                    phase: 'suggestions',
                    message: 'Generating directory suggestions...',
                    progress: 90
                });
            }

            results.suggested_directories = await this.generateDirectorySuggestions();

            results.scan_summary = {
                standard_dirs_found: results.standard_directories.length,
                discovered_dirs_found: results.discovered_directories.length,
                suggested_dirs_count: results.suggested_directories.length,
                total_music_files: results.total_files,
                scan_completed_at: new Date().toISOString()
            };

            if (progressCallback) {
                progressCallback({
                    phase: 'complete',
                    message: `Discovery complete: Found ${results.total_files} music files in ${results.standard_directories.length + results.discovered_directories.length} directories`,
                    progress: 100
                });
            }

            return results;
        } catch (error) {
            // Add more specific error information
            const errorDetails = {
                originalError: error.message,
                permissions: this.checkPermissions(),
                platform: process.platform,
                homeDirectory: require('os').homedir(),
                timestamp: new Date().toISOString()
            };
            
            console.error('MP3 Scanner detailed error:', errorDetails);
            
            throw new Error(`Music directory discovery failed: ${error.message}. Platform: ${process.platform}, Home: ${require('os').homedir()}. Check console for full details.`);
        } finally {
            this.isScanning = false;
            this.shouldStop = false;
        }
    }

    /**
     * Discover all directories containing music files
     * @param {string[]} searchPaths - Directories to search in
     * @param {Function} progressCallback - Progress callback function
     * @returns {Promise<Object[]>} Array of directory info objects
     */
    async discoverMusicDirectories(searchPaths = null, progressCallback = null) {
        // Note: This method can be called from discoverAllMusicDirectories, 
        // so we don't check isScanning here to avoid conflicts
        console.log('discoverMusicDirectories called with paths:', searchPaths);

        try {
            const pathsToSearch = searchPaths || this.standardMusicDirs;
            const musicDirectories = new Map(); // Use Map to avoid duplicates
            let totalScanned = 0;

            if (progressCallback) {
                progressCallback({
                    phase: 'starting',
                    message: 'Initializing directory scan...',
                    currentPath: '',
                    directoriesFound: 0,
                    filesFound: 0
                });
            }

            for (const searchPath of pathsToSearch) {
                if (this.shouldStop) break;

                if (progressCallback) {
                    progressCallback({
                        phase: 'scanning',
                        message: `Scanning: ${searchPath}`,
                        currentPath: searchPath,
                        directoriesFound: musicDirectories.size,
                        filesFound: totalScanned
                    });
                }

                try {
                    const { directories, fileCount } = await this.scanDirectoryForMusic(
                        searchPath, 
                        (scanProgress) => {
                            if (progressCallback) {
                                progressCallback({
                                    phase: 'scanning',
                                    message: `Scanning: ${scanProgress.currentPath}`,
                                    currentPath: scanProgress.currentPath,
                                    directoriesFound: musicDirectories.size,
                                    filesFound: totalScanned + scanProgress.filesFound
                                });
                            }
                        }
                    );

                    // Add discovered directories to our map
                    directories.forEach(dir => {
                        musicDirectories.set(dir.path, dir);
                    });

                    totalScanned += fileCount;
                } catch (error) {
                    console.warn(`Error scanning ${searchPath}:`, error.message);
                }
            }

            const result = Array.from(musicDirectories.values());

            if (progressCallback) {
                progressCallback({
                    phase: 'complete',
                    message: `Scan complete: Found ${result.length} directories with ${totalScanned} music files`,
                    currentPath: '',
                    directoriesFound: result.length,
                    filesFound: totalScanned
                });
            }

            return result;
        } catch (error) {
            console.error('Error in discoverMusicDirectories:', error);
            throw error;
        }
    }

    /**
     * Recursively scan a directory for music files
     * @param {string} dirPath - Directory to scan
     * @param {Function} progressCallback - Progress callback
     * @param {number} maxDepth - Maximum recursion depth (default: 10)
     * @returns {Promise<Object>} Object with directories array and total file count
     */
    async scanDirectoryForMusic(dirPath, progressCallback = null, maxDepth = 10) {
        const musicDirectories = [];
        let totalFiles = 0;

        const scanRecursive = async (currentPath, depth = 0) => {
            if (this.shouldStop || depth > maxDepth) return;

            try {
                if (!this.directoryExists(currentPath)) return;

                const items = fs.readdirSync(currentPath);
                const musicFiles = [];
                const subdirectories = [];

                // Separate files and directories
                for (const item of items) {
                    if (this.shouldStop) break;

                    const itemPath = path.join(currentPath, item);
                    
                    try {
                        const stats = fs.statSync(itemPath);
                        
                        if (stats.isFile() && this.isMusicFile(item)) {
                            musicFiles.push({
                                name: item,
                                path: itemPath,
                                size: stats.size,
                                modified: stats.mtime
                            });
                            totalFiles++;
                        } else if (stats.isDirectory() && !this.isSystemDirectory(item)) {
                            subdirectories.push(itemPath);
                        }
                    } catch (error) {
                        // Skip files/directories we can't access
                        continue;
                    }
                }

                // If this directory contains music files, add it to our list
                if (musicFiles.length > 0) {
                    musicDirectories.push({
                        path: currentPath,
                        name: path.basename(currentPath),
                        fileCount: musicFiles.length,
                        files: musicFiles,
                        totalSize: musicFiles.reduce((sum, file) => sum + file.size, 0),
                        lastScanned: new Date().toISOString()
                    });

                    if (progressCallback) {
                        progressCallback({
                            currentPath: currentPath,
                            filesFound: totalFiles,
                            directoriesFound: musicDirectories.length
                        });
                    }
                }

                // Recursively scan subdirectories
                for (const subdir of subdirectories) {
                    if (this.shouldStop) break;
                    await scanRecursive(subdir, depth + 1);
                }

            } catch (error) {
                // Skip directories we can't access
                console.warn(`Cannot access directory ${currentPath}:`, error.message);
            }
        };

        await scanRecursive(dirPath);
        
        return {
            directories: musicDirectories,
            fileCount: totalFiles
        };
    }

    /**
     * Get all music files from discovered directories
     * @param {Object[]} musicDirectories - Array of directory objects from discoverMusicDirectories
     * @returns {string[]} Array of full file paths
     */
    getAllMusicFiles(musicDirectories) {
        const allFiles = [];
        
        for (const directory of musicDirectories) {
            for (const file of directory.files) {
                allFiles.push(file.path);
            }
        }
        
        return allFiles;
    }

    /**
     * Check if a file is a music file based on extension
     * @param {string} fileName - Name of the file
     * @returns {boolean} True if it's a music file
     */
    isMusicFile(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        return this.supportedExtensions.includes(ext);
    }

    /**
     * Check if a directory is a system directory that should be skipped
     * @param {string} dirName - Directory name
     * @returns {boolean} True if it's a system directory
     */
    isSystemDirectory(dirName) {
        const systemDirs = [
            'System Volume Information',
            '$RECYCLE.BIN',
            'Windows',
            'Program Files',
            'Program Files (x86)',
            'ProgramData',
            'Recovery',
            'System32',
            'node_modules',
            '.git',
            '.vs',
            'Temp',
            'tmp'
        ];
        
        return systemDirs.some(sysDir => 
            dirName.toLowerCase().includes(sysDir.toLowerCase())
        );
    }

    /**
     * Stop the current scanning operation
     */
    stopScanning() {
        this.shouldStop = true;
    }

    /**
     * Check if scanner is currently running
     * @returns {boolean} True if scanning is in progress
     */
    isRunning() {
        return this.isScanning;
    }

    /**
     * Quick scan to estimate total files (for progress estimation)
     * @param {string[]} searchPaths - Paths to scan
     * @returns {Promise<number>} Estimated total file count
     */
    async estimateTotalFiles(searchPaths = null) {
        const pathsToSearch = searchPaths || this.standardMusicDirs;
        let totalEstimate = 0;

        for (const searchPath of pathsToSearch) {
            try {
                if (this.directoryExists(searchPath)) {
                    // Quick estimate by counting files in first level only
                    const items = fs.readdirSync(searchPath);
                    const musicFileCount = items.filter(item => 
                        this.isMusicFile(item)
                    ).length;
                    
                    // Rough estimate: multiply by average directory depth
                    totalEstimate += musicFileCount * 5; // Assume average 5x multiplier for subdirectories
                }
            } catch (error) {
                // Skip directories we can't access
            }
        }

        return totalEstimate;
    }

    /**
     * Get drive letters available on Windows
     * @returns {string[]} Array of drive letters (e.g., ['C:', 'D:'])
     */
    getAvailableDrives() {
        if (os.platform() !== 'win32') {
            return [];
        }

        const drives = [];
        const driveLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        
        for (const letter of driveLetters) {
            const drivePath = `${letter}:\\`;
            if (this.directoryExists(drivePath)) {
                drives.push(drivePath);
            }
        }
        
        return drives;
    }

    /**
     * Intelligent discovery of music directories by analyzing common patterns
     * @param {Function} progressCallback - Progress callback
     * @returns {Promise<string[]>} Array of discovered directory paths
     */
    async intelligentDirectoryDiscovery(progressCallback = null) {
        const discoveredPaths = new Set();
        const searchLocations = this.getIntelligentSearchLocations();

        for (let i = 0; i < searchLocations.length; i++) {
            if (this.shouldStop) break;

            const location = searchLocations[i];
            
            if (progressCallback) {
                progressCallback({
                    phase: 'discovery',
                    message: `Analyzing: ${location}`,
                    progress: 50 + (i / searchLocations.length) * 30
                });
            }

            try {
                const foundDirs = await this.analyzeLocationForMusic(location);
                foundDirs.forEach(dir => discoveredPaths.add(dir));
            } catch (error) {
                // Skip locations we can't access
                continue;
            }
        }

        return Array.from(discoveredPaths);
    }

    /**
     * Get intelligent search locations based on common patterns
     * @returns {string[]} Array of locations to analyze
     */
    getIntelligentSearchLocations() {
        const homeDir = os.homedir();
        const platform = os.platform();
        const locations = [];

        // Common music directory names to look for
        const musicFolderNames = [
            'Music', 'music', 'Audio', 'audio', 'Songs', 'songs',
            'MP3', 'mp3', 'Media', 'media', 'Sound', 'sound',
            'iTunes', 'Spotify', 'Amazon Music', 'Apple Music'
        ];

        // Search in user directories
        locations.push(homeDir);

        if (platform === 'win32') {
            // Windows-specific locations
            locations.push(
                'C:\\',
                'D:\\',
                'E:\\',
                path.join(homeDir, 'Desktop'),
                path.join(homeDir, 'OneDrive'),
                path.join(homeDir, 'Google Drive'),
                path.join(homeDir, 'Dropbox')
            );

            // Check for external drives
            const drives = this.getAvailableDrives();
            drives.forEach(drive => {
                if (drive !== 'C:\\') {
                    locations.push(drive);
                }
            });
        } else if (platform === 'darwin') {
            // macOS-specific locations
            locations.push(
                '/Users',
                '/Volumes',
                path.join(homeDir, 'Desktop'),
                path.join(homeDir, 'iCloud Drive'),
                path.join(homeDir, 'Google Drive'),
                path.join(homeDir, 'Dropbox')
            );
        } else {
            // Linux-specific locations
            locations.push(
                '/home',
                '/mnt',
                '/media',
                path.join(homeDir, 'Desktop')
            );
        }

        return locations.filter(loc => this.directoryExists(loc));
    }

    /**
     * Analyze a location for music directories
     * @param {string} location - Location to analyze
     * @returns {Promise<string[]>} Array of music directories found
     */
    async analyzeLocationForMusic(location, maxDepth = 3) {
        const musicDirs = [];
        const musicFolderNames = [
            'music', 'audio', 'songs', 'mp3', 'media', 'sound',
            'itunes', 'spotify', 'amazon music', 'apple music',
            'my music', 'collection'
        ];

        const analyzeRecursive = async (currentPath, depth = 0) => {
            if (depth > maxDepth || this.shouldStop) return;

            try {
                const items = fs.readdirSync(currentPath);
                let musicFileCount = 0;
                const subdirs = [];

                // First pass: count music files and collect subdirectories
                for (const item of items) {
                    if (this.shouldStop) break;

                    const itemPath = path.join(currentPath, item);
                    
                    try {
                        const stats = fs.statSync(itemPath);
                        
                        if (stats.isFile() && this.isMusicFile(item)) {
                            musicFileCount++;
                        } else if (stats.isDirectory() && !this.isSystemDirectory(item)) {
                            subdirs.push({ name: item, path: itemPath });
                        }
                    } catch (error) {
                        // Skip items we can't access
                        continue;
                    }
                }

                // If this directory has music files, add it
                if (musicFileCount > 0) {
                    musicDirs.push(currentPath);
                }

                // Second pass: analyze promising subdirectories
                for (const subdir of subdirs) {
                    if (this.shouldStop) break;

                    // Prioritize directories with music-related names
                    const lowerName = subdir.name.toLowerCase();
                    const isMusicDir = musicFolderNames.some(musicName => 
                        lowerName.includes(musicName)
                    );

                    if (isMusicDir || depth < 2) {
                        await analyzeRecursive(subdir.path, depth + 1);
                    }
                }

            } catch (error) {
                // Skip directories we can't access
            }
        };

        await analyzeRecursive(location);
        return musicDirs;
    }

    /**
     * Generate directory suggestions based on analysis
     * @returns {Promise<Object[]>} Array of directory suggestions
     */
    async generateDirectorySuggestions() {
        const suggestions = [];
        
        // Analyze recently accessed directories
        const recentDirs = await this.findRecentlyAccessedMusicDirs();
        
        // Analyze directories with music-like names but no music files yet
        const emptyMusicDirs = await this.findEmptyMusicDirectories();
        
        // Combine and rank suggestions
        recentDirs.forEach(dir => {
            suggestions.push({
                path: dir.path,
                reason: 'Recently accessed directory with music files',
                confidence: 0.8,
                file_count: dir.fileCount || 0,
                last_modified: dir.lastModified
            });
        });

        emptyMusicDirs.forEach(dir => {
            suggestions.push({
                path: dir,
                reason: 'Directory with music-related name',
                confidence: 0.6,
                file_count: 0,
                last_modified: null
            });
        });

        return suggestions.slice(0, 10); // Limit to top 10 suggestions
    }

    /**
     * Find recently accessed directories that might contain music
     * @returns {Promise<Object[]>} Array of recent directory info
     */
    async findRecentlyAccessedMusicDirs() {
        const recentDirs = [];
        const homeDir = os.homedir();
        const recentPaths = [
            path.join(homeDir, 'Downloads'),
            path.join(homeDir, 'Desktop'),
            path.join(homeDir, 'Documents')
        ];

        for (const dirPath of recentPaths) {
            if (!this.directoryExists(dirPath)) continue;

            try {
                const items = fs.readdirSync(dirPath);
                const musicFiles = items.filter(item => {
                    const itemPath = path.join(dirPath, item);
                    try {
                        const stats = fs.statSync(itemPath);
                        return stats.isFile() && this.isMusicFile(item);
                    } catch (error) {
                        return false;
                    }
                });

                if (musicFiles.length > 0) {
                    const stats = fs.statSync(dirPath);
                    recentDirs.push({
                        path: dirPath,
                        fileCount: musicFiles.length,
                        lastModified: stats.mtime
                    });
                }
            } catch (error) {
                // Skip directories we can't access
            }
        }

        return recentDirs;
    }

    /**
     * Find empty directories with music-related names
     * @returns {Promise<string[]>} Array of empty music directory paths
     */
    async findEmptyMusicDirectories() {
        const emptyDirs = [];
        const musicFolderNames = ['Music', 'Audio', 'Songs', 'MP3', 'Media'];
        const searchPaths = [os.homedir()];

        for (const searchPath of searchPaths) {
            try {
                const items = fs.readdirSync(searchPath);
                
                for (const item of items) {
                    if (musicFolderNames.includes(item)) {
                        const itemPath = path.join(searchPath, item);
                        
                        try {
                            const stats = fs.statSync(itemPath);
                            if (stats.isDirectory()) {
                                const contents = fs.readdirSync(itemPath);
                                if (contents.length === 0) {
                                    emptyDirs.push(itemPath);
                                }
                            }
                        } catch (error) {
                            // Skip items we can't access
                        }
                    }
                }
            } catch (error) {
                // Skip paths we can't access
            }
        }

        return emptyDirs;
    }
}

module.exports = MP3Scanner;