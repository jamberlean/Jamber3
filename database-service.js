const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'jamber3.db');
const JSON_BACKUP_FILE = path.join(__dirname, 'songs.json');
const SCHEMA_FILE = path.join(__dirname, 'sqlite-schema.sql');

class DatabaseService {
    constructor() {
        this.db = null;
        this.setupDatabase();
    }

    setupDatabase() {
        try {
            // Create SQLite database
            this.db = new Database(DB_FILE);
            
            // Set database pragmas for performance
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('synchronous = NORMAL');
            this.db.pragma('cache_size = 1000');
            this.db.pragma('temp_store = memory');

            // Execute schema more carefully to handle migrations
            this.executeSchemaWithMigrations();

            // Migrate from JSON if exists and database is empty
            this.migrateFromJSON();


        } catch (error) {
            console.error('Error initializing database:', error);
            if (this.db) {
                try {
                    this.db.close();
                } catch (closeError) {
                    console.error('Error closing database during cleanup:', closeError);
                }
            }
            this.db = null;
            throw error;
        }
    }

    migrateFromJSON() {
        try {
            // Check if we have any songs in SQLite
            const songCount = this.db.prepare('SELECT COUNT(*) as count FROM songs').get();
            
            if (songCount.count > 0) {
                return;
            }

            // Check if JSON file exists
            if (!fs.existsSync(JSON_BACKUP_FILE)) {
                return;
            }

            const jsonData = JSON.parse(fs.readFileSync(JSON_BACKUP_FILE, 'utf8'));

            // Migrate songs
            if (jsonData.songs && jsonData.songs.length > 0) {
                const insertSong = this.db.prepare(`
                    INSERT INTO songs (
                        id, title, is_cover, artist, lyrics_path, lyrics_content, mp3_path,
                        tablature_url, youtube_url, created_at, file_path,
                        file_name, extracted_title, extracted_artist, metadata_source,
                        file_size, duration, format, bitrate, sample_rate, last_scanned,
                        user_edited, guitar_tab_url, guitar_tab_verified, bass_tab_url,
                        bass_tab_verified, lyrics_url, lyrics_verified, album
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                const insertMany = this.db.transaction((songs) => {
                    for (const song of songs) {
                        insertSong.run(
                            song.id, song.title, song.is_cover ? 1 : 0, song.artist,
                            song.lyrics_path, song.lyrics_content, song.mp3_path,
                            song.tablature_url, song.youtube_url,
                            song.created_at, song.file_path, song.file_name,
                            song.extracted_title, song.extracted_artist, song.metadata_source,
                            song.file_size, song.duration, song.format, song.bitrate,
                            song.sample_rate, song.last_scanned, song.user_edited ? 1 : 0,
                            song.guitar_tab_url, song.guitar_tab_verified ? 1 : 0,
                            song.bass_tab_url, song.bass_tab_verified ? 1 : 0,
                            song.lyrics_url, song.lyrics_verified ? 1 : 0, song.album
                        );
                    }
                });

                insertMany(jsonData.songs);
            }

            // Migrate scan directories
            if (jsonData.scan_directories && jsonData.scan_directories.length > 0) {
                const insertDir = this.db.prepare(`
                    INSERT INTO scan_directories (path, enabled, last_scanned, file_count)
                    VALUES (?, ?, ?, ?)
                `);

                const insertDirs = this.db.transaction((dirs) => {
                    for (const dir of dirs) {
                        insertDir.run(dir.path, dir.enabled ? 1 : 0, dir.last_scanned, dir.file_count || 0);
                    }
                });

                insertDirs(jsonData.scan_directories);
                console.log(`Migrated ${jsonData.scan_directories.length} scan directories to SQLite`);
            }

            // Migrate app settings
            if (jsonData.app_settings) {
                const insertSetting = this.db.prepare(`
                    INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)
                `);

                for (const [key, value] of Object.entries(jsonData.app_settings)) {
                    insertSetting.run(key, JSON.stringify(value));
                }
                console.log('Migrated app settings to SQLite');
            }

            // Set next_id
            if (jsonData.nextId) {
                const updateNextId = this.db.prepare(`
                    INSERT OR REPLACE INTO app_settings (key, value) VALUES ('next_id', ?)
                `);
                updateNextId.run(jsonData.nextId.toString());
            }

            console.log('JSON to SQLite migration completed successfully');
            
            // Backup the original JSON file
            const backupPath = path.join(__dirname, `songs-backup-${Date.now()}.json`);
            fs.copyFileSync(JSON_BACKUP_FILE, backupPath);
            console.log(`Original JSON file backed up to: ${backupPath}`);

        } catch (error) {
            console.error('Error migrating from JSON:', error);
            throw error;
        }
    }

    executeSchemaWithMigrations() {
        try {
            // Read the full schema file
            const schemaContent = fs.readFileSync(SCHEMA_FILE, 'utf8');
            
            // Split schema into parts - we'll execute table creation separately from index creation
            const statements = schemaContent.split(';').map(stmt => stmt.trim()).filter(stmt => stmt.length > 0);
            
            // Execute CREATE TABLE statements first
            for (const statement of statements) {
                if (statement.includes('CREATE TABLE')) {
                    this.db.exec(statement + ';');
                }
            }
            
            // Run migrations to add any missing columns
            this.runSchemaMigrations();
            
            // Now execute CREATE INDEX and other statements
            for (const statement of statements) {
                if (!statement.includes('CREATE TABLE')) {
                    try {
                        this.db.exec(statement + ';');
                    } catch (error) {
                        // Ignore errors for statements that might already exist or reference missing columns
                        console.log(`Skipped statement (likely already exists): ${statement.substring(0, 50)}...`);
                    }
                }
            }
        } catch (error) {
            console.error('Error executing schema with migrations:', error);
            throw error;
        }
    }

    runSchemaMigrations() {
        try {
            // Check if songs table exists first
            const tablesResult = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='songs'").get();
            if (!tablesResult) {
                console.log('Songs table does not exist yet, skipping migrations');
                return;
            }

            // Check if is_removed column exists, if not add it
            const columns = this.db.prepare("PRAGMA table_info(songs)").all();
            const hasIsRemovedColumn = columns.some(col => col.name === 'is_removed');
            
            if (!hasIsRemovedColumn) {
                console.log('Adding is_removed column to songs table...');
                this.db.exec('ALTER TABLE songs ADD COLUMN is_removed BOOLEAN DEFAULT 0');
                this.db.exec('CREATE INDEX IF NOT EXISTS idx_songs_is_removed ON songs(is_removed)');
                console.log('is_removed column added successfully');
            }

            // Check if tablature_content column exists, if so remove it
            const hasTablatureContentColumn = columns.some(col => col.name === 'tablature_content');
            
            if (hasTablatureContentColumn) {
                console.log('Removing tablature_content column from songs table...');
                
                // SQLite doesn't support DROP COLUMN, so we need to recreate the table
                const migrationSQL = fs.readFileSync(path.join(__dirname, 'migrations', 'remove_tablature_content.sql'), 'utf8');
                this.db.exec(migrationSQL);
                
                console.log('tablature_content column removed successfully');
            }
        } catch (error) {
            console.error('Error running schema migrations:', error);
            // Don't throw error as this is not critical for app startup
        }
    }

    getNextId() {
        const result = this.db.prepare("SELECT value FROM app_settings WHERE key = 'next_id'").get();
        return result ? parseInt(result.value) : 1;
    }

    setNextId(id) {
        const stmt = this.db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('next_id', ?)");
        stmt.run(id.toString());
    }

    addSong(songData) {
        try {
            const nextId = this.getNextId();
            const newSong = {
                id: nextId,
                title: songData.title,
                is_cover: songData.is_cover || false,
                artist: songData.artist || '',
                lyrics_path: songData.lyrics_path || '',
                lyrics_content: songData.lyrics_content || '',
                mp3_path: songData.mp3_path || '',
                tablature_url: songData.tablature_url || '',
                youtube_url: songData.youtube_url || '',
                created_at: new Date().toISOString()
            };

            const stmt = this.db.prepare(`
                INSERT INTO songs (
                    id, title, is_cover, artist, lyrics_path, lyrics_content, mp3_path,
                    tablature_url, youtube_url, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                newSong.id, newSong.title, newSong.is_cover ? 1 : 0, newSong.artist,
                newSong.lyrics_path, newSong.lyrics_content, newSong.mp3_path,
                newSong.tablature_url, newSong.youtube_url,
                newSong.created_at
            );

            this.setNextId(nextId + 1);
            return newSong;
        } catch (error) {
            console.error('Error adding song:', error);
            return null;
        }
    }

    getAllSongs() {
        try {
            const stmt = this.db.prepare('SELECT * FROM songs WHERE is_removed = 0 ORDER BY created_at DESC');
            const songs = stmt.all();
            
            // Convert boolean fields
            return songs.map(song => ({
                ...song,
                is_cover: Boolean(song.is_cover),
                user_edited: Boolean(song.user_edited),
                guitar_tab_verified: Boolean(song.guitar_tab_verified),
                bass_tab_verified: Boolean(song.bass_tab_verified),
                lyrics_verified: Boolean(song.lyrics_verified),
                is_removed: Boolean(song.is_removed)
            }));
        } catch (error) {
            console.error('Error getting all songs:', error);
            return [];
        }
    }

    getSong(id) {
        try {
            const stmt = this.db.prepare('SELECT * FROM songs WHERE id = ?');
            const song = stmt.get(parseInt(id));
            
            if (song) {
                return {
                    ...song,
                    is_cover: Boolean(song.is_cover),
                    user_edited: Boolean(song.user_edited),
                    guitar_tab_verified: Boolean(song.guitar_tab_verified),
                    bass_tab_verified: Boolean(song.bass_tab_verified),
                    lyrics_verified: Boolean(song.lyrics_verified)
                };
            }
            return null;
        } catch (error) {
            console.error('Error getting song:', error);
            return null;
        }
    }

    getSongById(id) {
        return this.getSong(id);
    }

    updateSong(id, songData) {
        try {
            const stmt = this.db.prepare(`
                UPDATE songs SET
                    title = ?, is_cover = ?, artist = ?, lyrics_path = ?, lyrics_content = ?,
                    mp3_path = ?, tablature_url = ?, youtube_url = ?
                WHERE id = ?
            `);

            const result = stmt.run(
                songData.title, songData.is_cover ? 1 : 0, songData.artist,
                songData.lyrics_path, songData.lyrics_content, songData.mp3_path,
                songData.tablature_url, songData.youtube_url,
                parseInt(id)
            );

            if (result.changes > 0) {
                return this.getSong(id);
            }
            return null;
        } catch (error) {
            console.error('Error updating song:', error);
            return null;
        }
    }

    deleteSong(id) {
        try {
            // Get the song details first to check file existence
            const song = this.db.prepare('SELECT * FROM songs WHERE id = ?').get(parseInt(id));
            if (!song) {
                return false;
            }

            // Check if the physical file still exists
            const fileExists = song.file_path && fs.existsSync(song.file_path);
            
            if (fileExists) {
                // File exists: Mark as removed so it won't be re-added on future scans
                const stmt = this.db.prepare('UPDATE songs SET is_removed = 1 WHERE id = ?');
                const result = stmt.run(parseInt(id));
                console.log(`Song marked as removed (file exists): ${song.title} - ${song.file_path}`);
                return result.changes > 0;
            } else {
                // File no longer exists: Delete the record entirely
                const stmt = this.db.prepare('DELETE FROM songs WHERE id = ?');
                const result = stmt.run(parseInt(id));
                console.log(`Song deleted from database (file not found): ${song.title} - ${song.file_path}`);
                return result.changes > 0;
            }
        } catch (error) {
            console.error('Error deleting song:', error);
            return false;
        }
    }

    markSongAsRemoved(id) {
        try {
            const stmt = this.db.prepare('UPDATE songs SET is_removed = 1 WHERE id = ?');
            const result = stmt.run(parseInt(id));
            return result.changes > 0;
        } catch (error) {
            console.error('Error marking song as removed:', error);
            return false;
        }
    }

    unmarkSongAsRemoved(id) {
        try {
            const stmt = this.db.prepare('UPDATE songs SET is_removed = 0, last_scanned = ? WHERE id = ?');
            const result = stmt.run(new Date().toISOString(), parseInt(id));
            console.log(`Song unmarked as removed (re-added to library): ${id}`);
            return result.changes > 0;
        } catch (error) {
            console.error('Error unmarking song as removed:', error);
            return false;
        }
    }

    addScanDirectory(directoryData) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO scan_directories (path, enabled, last_scanned, file_count)
                VALUES (?, ?, ?, ?)
            `);

            stmt.run(
                directoryData.path,
                directoryData.enabled !== false ? 1 : 0,
                new Date().toISOString(),
                directoryData.file_count || 0
            );

            return this.getScanDirectories();
        } catch (error) {
            console.error('Error adding scan directory:', error);
            return null;
        }
    }

    getScanDirectories() {
        try {
            const stmt = this.db.prepare('SELECT * FROM scan_directories ORDER BY path');
            const dirs = stmt.all();
            
            return dirs.map(dir => ({
                ...dir,
                enabled: Boolean(dir.enabled)
            }));
        } catch (error) {
            console.error('Error getting scan directories:', error);
            return [];
        }
    }

    updateAppSettings(settings) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)
            `);

            const updateMany = this.db.transaction((settingsObj) => {
                for (const [key, value] of Object.entries(settingsObj)) {
                    stmt.run(key, JSON.stringify(value));
                }
            });

            updateMany(settings);
            return true;
        } catch (error) {
            console.error('Error updating app settings:', error);
            return false;
        }
    }

    getAppSettings() {
        try {
            const stmt = this.db.prepare('SELECT key, value FROM app_settings');
            const rows = stmt.all();
            
            const settings = {};
            for (const row of rows) {
                try {
                    settings[row.key] = JSON.parse(row.value);
                } catch {
                    settings[row.key] = row.value;
                }
            }

            return {
                first_launch: settings.first_launch || true,
                last_scan: settings.last_scan || null,
                scan_in_progress: settings.scan_in_progress || false,
                ...settings
            };
        } catch (error) {
            console.error('Error getting app settings:', error);
            return {
                first_launch: true,
                last_scan: null,
                scan_in_progress: false
            };
        }
    }

    addSongWithMetadata(songMetadata) {
        try {
            const nextId = this.getNextId();
            const newSong = {
                id: nextId,
                ...songMetadata
            };

            const stmt = this.db.prepare(`
                INSERT INTO songs (
                    id, title, is_cover, artist, lyrics_path, lyrics_content, mp3_path,
                    tablature_url, youtube_url, created_at, file_path,
                    file_name, extracted_title, extracted_artist, metadata_source,
                    file_size, duration, format, bitrate, sample_rate, last_scanned,
                    user_edited, guitar_tab_url, guitar_tab_verified, bass_tab_url,
                    bass_tab_verified, lyrics_url, lyrics_verified, album
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                newSong.id, newSong.title, newSong.is_cover ? 1 : 0, newSong.artist,
                newSong.lyrics_path, newSong.lyrics_content, newSong.mp3_path,
                newSong.tablature_url, newSong.youtube_url,
                newSong.created_at, newSong.file_path, newSong.file_name,
                newSong.extracted_title, newSong.extracted_artist, newSong.metadata_source,
                newSong.file_size, newSong.duration, newSong.format, newSong.bitrate,
                newSong.sample_rate, newSong.last_scanned, newSong.user_edited ? 1 : 0,
                newSong.guitar_tab_url, newSong.guitar_tab_verified ? 1 : 0,
                newSong.bass_tab_url, newSong.bass_tab_verified ? 1 : 0,
                newSong.lyrics_url, newSong.lyrics_verified ? 1 : 0, newSong.album
            );

            this.setNextId(nextId + 1);
            return newSong;
        } catch (error) {
            console.error('Error adding song with metadata:', error);
            return null;
        }
    }

    addSongsBatch(songsMetadata) {
        try {
            const nextId = this.getNextId();
            const newSongs = [];

            const stmt = this.db.prepare(`
                INSERT INTO songs (
                    id, title, is_cover, artist, lyrics_path, lyrics_content, mp3_path,
                    tablature_url, youtube_url, created_at, file_path,
                    file_name, extracted_title, extracted_artist, metadata_source,
                    file_size, duration, format, bitrate, sample_rate, last_scanned,
                    user_edited, guitar_tab_url, guitar_tab_verified, bass_tab_url,
                    bass_tab_verified, lyrics_url, lyrics_verified, album
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const insertMany = this.db.transaction((songs) => {
                let currentId = nextId;
                for (const songMetadata of songs) {
                    const newSong = {
                        id: currentId,
                        ...songMetadata
                    };

                    stmt.run(
                        newSong.id, newSong.title, newSong.is_cover ? 1 : 0, newSong.artist,
                        newSong.lyrics_path, newSong.lyrics_content, newSong.mp3_path,
                        newSong.tablature_url, newSong.youtube_url,
                        newSong.created_at, newSong.file_path, newSong.file_name,
                        newSong.extracted_title, newSong.extracted_artist, newSong.metadata_source,
                        newSong.file_size, newSong.duration, newSong.format, newSong.bitrate,
                        newSong.sample_rate, newSong.last_scanned, newSong.user_edited ? 1 : 0,
                        newSong.guitar_tab_url, newSong.guitar_tab_verified ? 1 : 0,
                        newSong.bass_tab_url, newSong.bass_tab_verified ? 1 : 0,
                        newSong.lyrics_url, newSong.lyrics_verified ? 1 : 0, newSong.album
                    );

                    newSongs.push(newSong);
                    currentId++;
                }
                return currentId;
            });

            const finalId = insertMany(songsMetadata);
            this.setNextId(finalId);
            
            return newSongs;
        } catch (error) {
            console.error('Error adding songs batch:', error);
            return null;
        }
    }

    getSongByFilePath(filePath) {
        try {
            const stmt = this.db.prepare('SELECT * FROM songs WHERE file_path = ?');
            const song = stmt.get(filePath);
            
            if (song) {
                return {
                    ...song,
                    is_cover: Boolean(song.is_cover),
                    user_edited: Boolean(song.user_edited),
                    guitar_tab_verified: Boolean(song.guitar_tab_verified),
                    bass_tab_verified: Boolean(song.bass_tab_verified),
                    lyrics_verified: Boolean(song.lyrics_verified),
                    is_removed: Boolean(song.is_removed)
                };
            }
            return null;
        } catch (error) {
            console.error('Error getting song by file path:', error);
            return null;
        }
    }

    updateSongMetadata(id, metadata) {
        try {
            const fields = Object.keys(metadata);
            const values = Object.values(metadata).map(value => {
                // Convert boolean to integer for SQLite compatibility
                if (typeof value === 'boolean') {
                    return value ? 1 : 0;
                }
                // Convert undefined to null
                if (value === undefined) {
                    return null;
                }
                // Convert other types to string if not already a valid SQLite type
                if (typeof value !== 'string' && typeof value !== 'number' && value !== null) {
                    return String(value);
                }
                return value;
            });
            const setClause = fields.map(field => `${field} = ?`).join(', ');

            const stmt = this.db.prepare(`UPDATE songs SET ${setClause} WHERE id = ?`);
            const result = stmt.run(...values, parseInt(id));

            if (result.changes > 0) {
                return this.getSong(id);
            }
            return null;
        } catch (error) {
            console.error('Error updating song metadata:', error);
            return null;
        }
    }

    cleanupMissingSongs() {
        try {
            const songs = this.getAllSongs();
            let removedCount = 0;

            const deleteStmt = this.db.prepare('DELETE FROM songs WHERE id = ?');
            const transaction = this.db.transaction((songsToCheck) => {
                for (const song of songsToCheck) {
                    if (!song.file_path) continue; // Keep manually added songs
                    
                    try {
                        if (!fs.existsSync(song.file_path)) {
                            deleteStmt.run(song.id);
                            removedCount++;
                        }
                    } catch (error) {
                        deleteStmt.run(song.id);
                        removedCount++;
                    }
                }
            });

            transaction(songs);

            if (removedCount > 0) {
                console.log(`Removed ${removedCount} songs with missing files`);
            }

            return removedCount;
        } catch (error) {
            console.error('Error cleaning up missing songs:', error);
            return 0;
        }
    }

    cleanupExcludedPaths(excludedPaths) {
        if (!excludedPaths || excludedPaths.length === 0) return 0;

        try {
            const songs = this.getAllSongs();
            let removedCount = 0;

            const deleteStmt = this.db.prepare('DELETE FROM songs WHERE id = ?');
            const transaction = this.db.transaction((songsToCheck) => {
                for (const song of songsToCheck) {
                    if (!song.file_path) continue; // Keep manually added songs
                    
                    for (const excludedPath of excludedPaths) {
                        if (song.file_path.startsWith(excludedPath)) {
                            console.log(`Removing song from excluded path: ${song.title} (${song.file_path})`);
                            deleteStmt.run(song.id);
                            removedCount++;
                            break;
                        }
                    }
                }
            });

            transaction(songs);

            if (removedCount > 0) {
                console.log(`Removed ${removedCount} songs from excluded paths`);
            }

            return removedCount;
        } catch (error) {
            console.error('Error cleaning up excluded paths:', error);
            return 0;
        }
    }

    /**
     * Clean up songs that are no longer in any enabled path
     * @param {string} removedPath - The path that was removed from enabled paths
     * @param {Array} remainingEnabledPaths - Array of remaining enabled path strings
     * @returns {number} Number of songs removed
     */
    cleanupSongsFromRemovedPath(removedPath, remainingEnabledPaths) {
        if (!removedPath) return 0;

        try {
            const songs = this.getAllSongs();
            let removedCount = 0;

            const deleteStmt = this.db.prepare('DELETE FROM songs WHERE id = ?');
            
            const transaction = this.db.transaction((songsToCheck) => {
                for (const song of songsToCheck) {
                    if (!song.file_path) continue; // Keep manually added songs
                    
                    // Check if this song is from the removed path
                    if (song.file_path.startsWith(removedPath)) {
                        // Check if it's also covered by any remaining enabled path
                        let isCoveredByOtherPath = false;
                        for (const enabledPath of remainingEnabledPaths) {
                            if (song.file_path.startsWith(enabledPath)) {
                                isCoveredByOtherPath = true;
                                break;
                            }
                        }
                        
                        // Only remove if not covered by any other enabled path
                        if (!isCoveredByOtherPath) {
                            console.log(`Removing song from removed path: ${song.title} (${song.file_path})`);
                            deleteStmt.run(song.id);
                            removedCount++;
                        }
                    }
                }
            });

            transaction(songs);

            if (removedCount > 0) {
                console.log(`Removed ${removedCount} songs from removed enabled path: ${removedPath}`);
            }

            return removedCount;
        } catch (error) {
            console.error('Error cleaning up songs from removed enabled path:', error);
            return 0;
        }
    }

    /**
     * SETLIST METHODS
     */

    /**
     * Create a new setlist
     * @param {string} name - Setlist name (required, unique)
     * @returns {Object|null} Created setlist object or null on failure
     */
    createSetlist(name) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO setlists (name, created_at, updated_at)
                VALUES (?, datetime('now'), datetime('now'))
            `);
            const result = stmt.run(name);
            
            if (result.lastInsertRowid) {
                return this.getSetlist(result.lastInsertRowid);
            }
            return null;
        } catch (error) {
            console.error('Error creating setlist:', error);
            return null;
        }
    }

    /**
     * Get a setlist by ID
     * @param {number} id - Setlist ID
     * @returns {Object|null} Setlist object or null if not found
     */
    getSetlist(id) {
        try {
            const stmt = this.db.prepare('SELECT * FROM setlists WHERE id = ?');
            return stmt.get(id) || null;
        } catch (error) {
            console.error('Error getting setlist:', error);
            return null;
        }
    }

    /**
     * Get all setlists with song counts
     * @returns {Array} Array of setlist objects with song counts
     */
    getAllSetlists() {
        try {
            const stmt = this.db.prepare(`
                SELECT s.*, COUNT(ss.song_id) as song_count
                FROM setlists s
                LEFT JOIN song_setlists ss ON s.id = ss.setlist_id
                GROUP BY s.id
                ORDER BY s.name ASC
            `);
            return stmt.all();
        } catch (error) {
            console.error('Error getting all setlists:', error);
            return [];
        }
    }

    /**
     * Delete a setlist (cascade deletes relationships)
     * @param {number} id - Setlist ID
     * @returns {boolean} True if deleted successfully
     */
    deleteSetlist(id) {
        try {
            const stmt = this.db.prepare('DELETE FROM setlists WHERE id = ?');
            const result = stmt.run(id);
            return result.changes > 0;
        } catch (error) {
            console.error('Error deleting setlist:', error);
            return false;
        }
    }

    /**
     * Add a song to a setlist
     * @param {number} songId - Song ID
     * @param {number} setlistId - Setlist ID
     * @returns {boolean} True if added successfully
     */
    addSongToSetlist(songId, setlistId) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO song_setlists (song_id, setlist_id, added_at)
                VALUES (?, ?, datetime('now'))
            `);
            const result = stmt.run(songId, setlistId);
            return result.changes > 0;
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                // Song already in setlist - not an error
                return true;
            }
            console.error('Error adding song to setlist:', error);
            return false;
        }
    }

    /**
     * Remove a song from a setlist
     * @param {number} songId - Song ID
     * @param {number} setlistId - Setlist ID
     * @returns {boolean} True if removed successfully
     */
    removeSongFromSetlist(songId, setlistId) {
        try {
            const stmt = this.db.prepare('DELETE FROM song_setlists WHERE song_id = ? AND setlist_id = ?');
            const result = stmt.run(songId, setlistId);
            return result.changes > 0;
        } catch (error) {
            console.error('Error removing song from setlist:', error);
            return false;
        }
    }

    /**
     * Get all songs in a setlist
     * @param {number} setlistId - Setlist ID
     * @returns {Array} Array of song objects
     */
    getSongsInSetlist(setlistId) {
        try {
            const stmt = this.db.prepare(`
                SELECT s.*, ss.added_at as setlist_added_at
                FROM songs s
                INNER JOIN song_setlists ss ON s.id = ss.song_id
                WHERE ss.setlist_id = ? AND s.is_removed = 0
                ORDER BY ss.added_at DESC
            `);
            return stmt.all(setlistId);
        } catch (error) {
            console.error('Error getting songs in setlist:', error);
            return [];
        }
    }

    /**
     * Get all setlists that contain a specific song
     * @param {number} songId - Song ID
     * @returns {Array} Array of setlist objects
     */
    getSetlistsForSong(songId) {
        try {
            const stmt = this.db.prepare(`
                SELECT s.*, ss.added_at as setlist_added_at
                FROM setlists s
                INNER JOIN song_setlists ss ON s.id = ss.setlist_id
                WHERE ss.song_id = ?
                ORDER BY s.name ASC
            `);
            return stmt.all(songId);
        } catch (error) {
            console.error('Error getting setlists for song:', error);
            return [];
        }
    }

    /**
     * Get setlist with song count
     * @param {number} setlistId - Setlist ID
     * @returns {Object|null} Setlist with song count
     */
    getSetlistWithSongCount(setlistId) {
        try {
            const stmt = this.db.prepare(`
                SELECT s.*, COUNT(ss.song_id) as song_count
                FROM setlists s
                LEFT JOIN song_setlists ss ON s.id = ss.setlist_id
                WHERE s.id = ?
                GROUP BY s.id
            `);
            return stmt.get(setlistId) || null;
        } catch (error) {
            console.error('Error getting setlist with song count:', error);
            return null;
        }
    }

    close() {
        if (this.db) {
            this.db.close();
        }
    }

    // Legacy methods for compatibility - these are no longer needed with SQLite
    initializeDatabase() {
        // Already handled in constructor
    }

    readDatabase() {
        // No longer needed - SQLite handles this
        return null;
    }

    writeDatabase(data) {
        // No longer needed - SQLite handles this
        return true;
    }

    migrateDatabase() {
        // Already handled in migrateFromJSON
    }

    migrateSongToNewSchema(song) {
        // No longer needed - handled in migration
        return song;
    }
}

module.exports = DatabaseService;
