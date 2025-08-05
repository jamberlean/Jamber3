const axios = require('axios');

/**
 * Resource Finder for Jamber3
 * Discovers guitar tabs, bass tabs, and lyrics using legitimate APIs
 */
class ResourceFinder {
    constructor() {
        this.searchCache = new Map();
        this.rateLimitDelay = 1000; // 1 second between requests
        this.lastRequestTime = 0;
        
        // API Configuration
        this.apis = {
            // Genius API for lyrics
            genius: {
                baseUrl: 'https://api.genius.com',
                // Note: In production, this should be set via environment variable
                // For now using demo/public endpoints where possible
                accessToken: process.env.GENIUS_ACCESS_TOKEN || null
            },
            
            // MusicBrainz API for metadata and links (future use)
            musicbrainz: {
                baseUrl: 'https://musicbrainz.org/ws/2',
                // No API key required for basic usage, but rate limited
                userAgent: 'Jamber3/1.0.0 (https://github.com/your-repo/jamber3)'
            }
        };
        
        // Resource type mappings
        this.resourceTypes = {
            guitar_tabs: ['guitar', 'chord', 'tab'],
            bass_tabs: ['bass'],
            lyrics: ['lyrics']
        };
    }

    /**
     * Find all resources for a song using APIs
     * @param {Object} song - Song object with artist and title
     * @param {Function} progressCallback - Progress callback function
     * @returns {Promise<Object>} Found resources
     */
    async findAllResources(song, progressCallback = null) {
        const results = {
            guitar_tabs: [],
            bass_tabs: [],
            lyrics: [],
            errors: []
        };

        const searchTasks = [
            { type: 'lyrics', method: 'searchLyrics' },
            { type: 'guitar_tabs', method: 'searchGuitarTabs' },
            { type: 'bass_tabs', method: 'searchBassTabs' }
        ];

        let completed = 0;
        const totalTasks = searchTasks.length;

        if (progressCallback) {
            progressCallback({
                phase: 'searching',
                message: `Searching for resources for "${song.title}"...`,
                progress: 0
            });
        }

        // Search each type of resource using APIs
        for (const task of searchTasks) {
            try {
                if (progressCallback) {
                    progressCallback({
                        phase: 'searching',
                        message: `Searching for ${task.type.replace('_', ' ')}...`,
                        progress: Math.round((completed / totalTasks) * 100)
                    });
                }

                const taskResults = await this[task.method](song);
                results[task.type] = taskResults;
                
            } catch (error) {
                console.warn(`Error searching ${task.type}:`, error.message);
                results.errors.push({
                    type: task.type,
                    error: error.message
                });
            }
            
            completed++;
            
            if (progressCallback) {
                progressCallback({
                    phase: 'searching',
                    message: `Completed ${task.type.replace('_', ' ')}`,
                    progress: Math.round((completed / totalTasks) * 100)
                });
            }
        }

        // Rank and filter results
        results.guitar_tabs = this.rankResults(results.guitar_tabs, song);
        results.bass_tabs = this.rankResults(results.bass_tabs, song);
        results.lyrics = this.rankResults(results.lyrics, song);

        if (progressCallback) {
            progressCallback({
                phase: 'complete',
                message: `Found ${results.guitar_tabs.length + results.bass_tabs.length + results.lyrics.length} resources`,
                progress: 100
            });
        }

        return results;
    }

    /**
     * Find specific type of resource using APIs
     * @param {string} resourceType - Type of resource (guitar_tabs, bass_tabs, lyrics)
     * @param {Object} song - Song object
     * @returns {Promise<Array>} Found resources
     */
    async findResource(resourceType, song) {
        let results = [];

        try {
            switch (resourceType) {
                case 'lyrics':
                    results = await this.searchLyrics(song);
                    break;
                case 'guitar_tabs':
                    results = await this.searchGuitarTabs(song);
                    break;
                case 'bass_tabs':
                    results = await this.searchBassTabs(song);
                    break;
                default:
                    throw new Error(`Unsupported resource type: ${resourceType}`);
            }
        } catch (error) {
            console.warn(`Error searching ${resourceType}:`, error.message);
            results = [];
        }

        return this.rankResults(results, song);
    }

    /**
     * Search for lyrics using Genius API
     * @param {Object} song - Song object
     * @returns {Promise<Array>} Found lyrics
     */
    async searchLyrics(song) {
        const results = [];
        
        // Try Genius API if token is available
        if (this.apis.genius.accessToken) {
            try {
                const geniusResults = await this.searchGeniusAPI(song);
                results.push(...geniusResults);
            } catch (error) {
                console.warn('Error searching Genius API:', error.message);
            }
        }

        // Fallback: provide manual search URLs for popular sites
        if (results.length === 0) {
            results.push(...this.generateLyricsSearchUrls(song));
        }

        return results;
    }

    /**
     * Search for guitar tabs using available APIs and services
     * @param {Object} song - Song object
     * @returns {Promise<Array>} Found guitar tabs
     */
    async searchGuitarTabs(song) {
        const results = [];

        // Note: Most tab sites don't have reliable public APIs
        // For now, we provide curated manual search URLs
        // TODO: Add legitimate API integrations when available (Ultimate Guitar API, etc.)
        
        results.push(...this.generateGuitarTabSearchUrls(song));
        return results;
    }

    /**
     * Search for bass tabs using available APIs and services
     * @param {Object} song - Song object
     * @returns {Promise<Array>} Found bass tabs
     */
    async searchBassTabs(song) {
        const results = [];

        // Note: Most tab sites don't have reliable public APIs
        // For now, we provide curated manual search URLs
        // TODO: Add legitimate API integrations when available
        
        results.push(...this.generateBassTabSearchUrls(song));
        return results;
    }

    /**
     * Search Genius API for lyrics
     * @param {Object} song - Song object
     * @returns {Promise<Array>} Found lyrics from Genius
     */
    async searchGeniusAPI(song) {
        const artist = song.artist || song.extracted_artist || '';
        const title = song.title || '';
        const query = encodeURIComponent(`${artist} ${title}`.trim());

        if (!query) return [];

        await this.waitForRateLimit();

        try {
            const response = await axios.get(`${this.apis.genius.baseUrl}/search`, {
                params: { q: query },
                headers: {
                    'Authorization': `Bearer ${this.apis.genius.accessToken}`,
                    'User-Agent': this.apis.musicbrainz.userAgent
                },
                timeout: 10000
            });

            const results = [];
            if (response.data && response.data.response && response.data.response.hits) {
                for (const hit of response.data.response.hits.slice(0, 5)) {
                    const result = hit.result;
                    results.push({
                        title: result.title,
                        artist: result.primary_artist.name,
                        url: result.url,
                        source: 'Genius',
                        type: 'lyrics',
                        confidence: this.calculateConfidence(song, {
                            title: result.title,
                            artist: result.primary_artist.name
                        })
                    });
                }
            }

            return results;
        } catch (error) {
            console.warn('Genius API error:', error.message);
            return [];
        }
    }


    /**
     * Generate search URLs for lyrics as fallback
     * @param {Object} song - Song object  
     * @returns {Array} Search URL suggestions
     */
    generateLyricsSearchUrls(song) {
        const artist = song.artist || song.extracted_artist || '';
        const title = song.title || '';
        const query = encodeURIComponent(`${artist} ${title}`.trim());
        
        if (!query) return [];

        return [
            {
                title: title,
                artist: artist,
                url: `https://genius.com/search?q=${query}`,
                source: 'Genius (Manual Search)',
                type: 'lyrics',
                confidence: 0.5,
                isManualSearch: true
            },
            {
                title: title,
                artist: artist,
                url: `https://www.azlyrics.com/search.php?q=${query}`,
                source: 'AZLyrics (Manual Search)',
                type: 'lyrics',
                confidence: 0.5,
                isManualSearch: true
            },
            {
                title: title,
                artist: artist,
                url: `https://www.lyrics.com/lyrics/${query}`,
                source: 'Lyrics.com (Manual Search)',
                type: 'lyrics',
                confidence: 0.5,
                isManualSearch: true
            }
        ];
    }

    /**
     * Generate search URLs for guitar tabs as fallback
     * @param {Object} song - Song object
     * @returns {Array} Search URL suggestions
     */
    generateGuitarTabSearchUrls(song) {
        const artist = song.artist || song.extracted_artist || '';
        const title = song.title || '';
        const query = encodeURIComponent(`${artist} ${title}`.trim());
        
        if (!query) return [];

        return [
            {
                title: title,
                artist: artist,
                url: `https://www.ultimate-guitar.com/search.php?search_type=title&value=${query}`,
                source: 'Ultimate Guitar (Manual Search)',
                type: 'guitar_tab',
                confidence: 0.5,
                isManualSearch: true
            },
            {
                title: title,
                artist: artist,
                url: `https://www.songsterr.com/a/wa/search?pattern=${query}`,
                source: 'Songsterr (Manual Search)',
                type: 'guitar_tab',
                confidence: 0.5,
                isManualSearch: true
            },
            {
                title: title,
                artist: artist,
                url: `https://www.911tabs.com/search/?query=${query}`,
                source: '911tabs (Manual Search)',
                type: 'guitar_tab',
                confidence: 0.5,
                isManualSearch: true
            }
        ];
    }

    /**
     * Generate search URLs for bass tabs as fallback
     * @param {Object} song - Song object
     * @returns {Array} Search URL suggestions
     */
    generateBassTabSearchUrls(song) {
        const artist = song.artist || song.extracted_artist || '';
        const title = song.title || '';
        const query = encodeURIComponent(`${artist} ${title} bass`.trim());
        
        if (!query) return [];

        return [
            {
                title: title,
                artist: artist,
                url: `https://www.ultimate-guitar.com/search.php?search_type=title&value=${query}`,
                source: 'Ultimate Guitar Bass (Manual Search)',
                type: 'bass_tab',
                confidence: 0.5,
                isManualSearch: true
            },
            {
                title: title,
                artist: artist,
                url: `https://www.songsterr.com/a/wa/search?pattern=${query}`,
                source: 'Songsterr Bass (Manual Search)',
                type: 'bass_tab',
                confidence: 0.5,
                isManualSearch: true
            }
        ];
    }

    /**
     * Rate limiting helper
     */
    async waitForRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.rateLimitDelay) {
            const waitTime = this.rateLimitDelay - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastRequestTime = Date.now();
    }

    /**
     * Calculate confidence score for a result
     * @param {Object} song - Original song
     * @param {Object} result - Search result
     * @returns {number} Confidence score (0-1)
     */
    calculateConfidence(song, result) {
        let confidence = 0;
        
        const songTitle = (song.title || '').toLowerCase();
        const songArtist = (song.artist || song.extracted_artist || '').toLowerCase();
        const resultTitle = (result.title || '').toLowerCase();
        const resultArtist = (result.artist || '').toLowerCase();

        // Title match
        if (songTitle && resultTitle) {
            if (songTitle === resultTitle) {
                confidence += 0.5;
            } else if (resultTitle.includes(songTitle) || songTitle.includes(resultTitle)) {
                confidence += 0.3;
            } else {
                // Calculate similarity
                const similarity = this.calculateStringSimilarity(songTitle, resultTitle);
                confidence += similarity * 0.5;
            }
        }

        // Artist match
        if (songArtist && resultArtist) {
            if (songArtist === resultArtist) {
                confidence += 0.5;
            } else if (resultArtist.includes(songArtist) || songArtist.includes(resultArtist)) {
                confidence += 0.3;
            } else {
                const similarity = this.calculateStringSimilarity(songArtist, resultArtist);
                confidence += similarity * 0.5;
            }
        }

        return Math.min(confidence, 1);
    }

    /**
     * Calculate string similarity using Levenshtein distance
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Similarity score (0-1)
     */
    calculateStringSimilarity(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        const matrix = Array(len2 + 1).fill().map(() => Array(len1 + 1).fill(0));

        for (let i = 0; i <= len1; i++) matrix[0][i] = i;
        for (let j = 0; j <= len2; j++) matrix[j][0] = j;

        for (let j = 1; j <= len2; j++) {
            for (let i = 1; i <= len1; i++) {
                if (str1[i - 1] === str2[j - 1]) {
                    matrix[j][i] = matrix[j - 1][i - 1];
                } else {
                    matrix[j][i] = Math.min(
                        matrix[j - 1][i] + 1,
                        matrix[j][i - 1] + 1,
                        matrix[j - 1][i - 1] + 1
                    );
                }
            }
        }

        const distance = matrix[len2][len1];
        const maxLen = Math.max(len1, len2);
        return maxLen === 0 ? 1 : (maxLen - distance) / maxLen;
    }

    /**
     * Rank results by confidence and other factors
     * @param {Array} results - Search results
     * @param {Object} song - Original song
     * @returns {Array} Ranked results
     */
    rankResults(results, song) {
        return results
            .sort((a, b) => {
                // Primary sort by confidence
                if (b.confidence !== a.confidence) {
                    return b.confidence - a.confidence;
                }
                // Secondary sort by rating (if available)
                return (b.rating || 0) - (a.rating || 0);
            })
            .slice(0, 10); // Limit to top 10 results
    }

    /**
     * Clear search cache
     */
    clearCache() {
        this.searchCache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.searchCache.size,
            keys: Array.from(this.searchCache.keys())
        };
    }
}

module.exports = ResourceFinder;