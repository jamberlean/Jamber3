const { parseFile } = require('music-metadata');
const path = require('path');
const fs = require('fs');

class MetadataExtractor {
    constructor() {
        this.supportedFormats = ['.mp3', '.m4a', '.wav', '.flac', '.ogg'];
    }

    /**
     * Extract metadata from an audio file
     * @param {string} filePath - Full path to the audio file
     * @returns {Promise<Object>} Extracted metadata
     */
    async extractMetadata(filePath) {
        try {
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            // Check if file format is supported
            const ext = path.extname(filePath).toLowerCase();
            if (!this.supportedFormats.includes(ext)) {
                console.warn(`Unsupported format: ${ext} for file: ${filePath}`);
                return this.createFallbackMetadata(filePath);
            }

            // Parse metadata using music-metadata
            const metadata = await parseFile(filePath);
            
            return this.processMetadata(filePath, metadata);
        } catch (error) {
            console.warn(`Failed to extract metadata from ${filePath}:`, error.message);
            return this.createFallbackMetadata(filePath);
        }
    }

    /**
     * Process raw metadata into our standardized format
     * @param {string} filePath - Full path to the file
     * @param {Object} metadata - Raw metadata from music-metadata
     * @returns {Object} Processed metadata
     */
    processMetadata(filePath, metadata) {
        const common = metadata.common || {};
        const format = metadata.format || {};
        
        // Get file stats
        const stats = fs.statSync(filePath);
        const fileName = path.basename(filePath);
        
        // Extract basic metadata
        let title = common.title?.trim();
        let artist = common.artist?.trim();
        let album = common.album?.trim();
        
        // If no metadata found, try to parse filename
        if (!title || !artist) {
            const filenameData = this.parseFilename(fileName);
            title = title || filenameData.title;
            artist = artist || filenameData.artist;
        }

        return {
            file_path: filePath,
            file_name: fileName,
            title: title || fileName.replace(path.extname(fileName), ''),
            artist: artist || '',
            album: album || '',
            extracted_title: title || '',
            extracted_artist: artist || '',
            metadata_source: (common.title && common.artist) ? 'id3' : 
                           (title || artist) ? 'filename' : 'fallback',
            file_size: stats.size,
            duration: format.duration ? Math.round(format.duration) : null,
            format: format.container || path.extname(filePath).substring(1),
            bitrate: format.bitrate || null,
            sample_rate: format.sampleRate || null,
            added_at: new Date().toISOString(),
            last_scanned: new Date().toISOString(),
            user_edited: false,
            // Initialize resource URLs as empty - will be populated later
            guitar_tab_url: '',
            guitar_tab_verified: false,
            bass_tab_url: '',
            bass_tab_verified: false,
            lyrics_url: '',
            lyrics_verified: false
        };
    }

    /**
     * Parse filename to extract artist and title
     * Common patterns:
     * - "Artist - Title.mp3"
     * - "Artist-Title.mp3"
     * - "Title by Artist.mp3"
     * - "01 Artist - Title.mp3"
     * - "Artist_Title.mp3"
     * @param {string} fileName - The filename to parse
     * @returns {Object} Parsed artist and title
     */
    parseFilename(fileName) {
        // Remove file extension
        const nameWithoutExt = fileName.replace(path.extname(fileName), '');
        
        // Remove track numbers (01, 02, etc.) from the beginning
        let cleanName = nameWithoutExt.replace(/^\d+[\s\-_.]*/, '');
        
        let artist = '';
        let title = '';

        // Try different patterns
        const patterns = [
            // "Artist - Title" or "Artist-Title"
            /^(.+?)\s*[-–]\s*(.+)$/,
            // "Title by Artist"
            /^(.+?)\s+by\s+(.+)$/i,
            // "Artist_Title"
            /^(.+?)_(.+)$/,
            // "Artist, Title"
            /^(.+?),\s*(.+)$/
        ];

        for (const pattern of patterns) {
            const match = cleanName.match(pattern);
            if (match) {
                if (pattern === /^(.+?)\s+by\s+(.+)$/i) {
                    // For "Title by Artist" pattern
                    title = match[1].trim();
                    artist = match[2].trim();
                } else {
                    // For other patterns, first group is artist
                    artist = match[1].trim();
                    title = match[2].trim();
                }
                break;
            }
        }

        // If no pattern matched, use the whole name as title
        if (!title) {
            title = cleanName;
        }

        return {
            artist: this.cleanString(artist),
            title: this.cleanString(title)
        };
    }

    /**
     * Clean and normalize string values
     * @param {string} str - String to clean
     * @returns {string} Cleaned string
     */
    cleanString(str) {
        if (!str) return '';
        
        return str
            .trim()
            .replace(/[_]+/g, ' ')  // Replace underscores with spaces
            .replace(/\s+/g, ' ')   // Replace multiple spaces with single space
            .replace(/^the\s+/i, '') // Remove leading "the"
            .trim();
    }

    /**
     * Create fallback metadata when extraction fails
     * @param {string} filePath - Full path to the file
     * @returns {Object} Fallback metadata
     */
    createFallbackMetadata(filePath) {
        const fileName = path.basename(filePath);
        const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : { size: 0 };
        
        const filenameData = this.parseFilename(fileName);
        
        return {
            file_path: filePath,
            file_name: fileName,
            title: filenameData.title || fileName.replace(path.extname(fileName), ''),
            artist: filenameData.artist || '',
            album: '',
            extracted_title: filenameData.title || '',
            extracted_artist: filenameData.artist || '',
            metadata_source: 'fallback',
            file_size: stats.size,
            duration: null,
            format: path.extname(filePath).substring(1),
            bitrate: null,
            sample_rate: null,
            added_at: new Date().toISOString(),
            last_scanned: new Date().toISOString(),
            user_edited: false,
            guitar_tab_url: '',
            guitar_tab_verified: false,
            bass_tab_url: '',
            bass_tab_verified: false,
            lyrics_url: '',
            lyrics_verified: false
        };
    }

    /**
     * Batch extract metadata from multiple files
     * @param {string[]} filePaths - Array of file paths
     * @param {Function} progressCallback - Optional progress callback
     * @returns {Promise<Object[]>} Array of metadata objects
     */
    async extractBatchMetadata(filePaths, progressCallback = null) {
        const results = [];
        const total = filePaths.length;
        
        for (let i = 0; i < filePaths.length; i++) {
            try {
                const metadata = await this.extractMetadata(filePaths[i]);
                results.push(metadata);
                
                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: total,
                        percentage: Math.round(((i + 1) / total) * 100),
                        currentFile: filePaths[i]
                    });
                }
            } catch (error) {
                console.error(`Error processing ${filePaths[i]}:`, error);
                // Continue with next file
            }
        }
        
        return results;
    }
}

module.exports = MetadataExtractor;