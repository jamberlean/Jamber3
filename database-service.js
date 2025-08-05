const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'tablary.db');
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

            // Read and execute schema
            const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
            this.db.exec(schema);

            // Migrate from JSON if exists and database is empty
            this.migrateFromJSON();

            console.log('Database initialized successfully');
        } catch (error) {
            console.error('Error initializing database:', error);
            this.db = null;
            throw error;
        }
    }

    migrateFromJSON() {
        try {
            // Check if we have any songs in SQLite
            const songCount = this.db.prepare('SELECT COUNT(*) as count FROM songs').get();
            
            if (songCount.count > 0) {
                console.log('SQLite database already has data, skipping JSON migration');
                return;
            }

            // Check if JSON file exists
            if (!fs.existsSync(JSON_BACKUP_FILE)) {
                console.log('No JSON file found, starting with empty database');
                return;
            }

            console.log('Migrating data from JSON to SQLite...');
            const jsonData = JSON.parse(fs.readFileSync(JSON_BACKUP_FILE, 'utf8'));

            // Migrate songs
            if (jsonData.songs && jsonData.songs.length > 0) {
                const insertSong = this.db.prepare(`
                    INSERT INTO songs (
                        id, title, is_cover, artist, lyrics_path, lyrics_content, mp3_path,
                        tablature_url, tablature_content, youtube_url, created_at, file_path,
                        file_name, extracted_title, extracted_artist, metadata_source,
                        file_size, duration, format, bitrate, sample_rate, last_scanned,
                        user_edited, guitar_tab_url, guitar_tab_verified, bass_tab_url,
                        bass_tab_verified, lyrics_url, lyrics_verified, album
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                const insertMany = this.db.transaction((songs) => {
                    for (const song of songs) {
                        insertSong.run(
                            song.id, song.title, song.is_cover ? 1 : 0, song.artist,
                            song.lyrics_path, song.lyrics_content, song.mp3_path,
                            song.tablature_url, song.tablature_content, song.youtube_url,
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
                console.log(`Migrated ${jsonData.songs.length} songs to SQLite`);
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
                tablature_content: songData.tablature_content || '',
                youtube_url: songData.youtube_url || '',
                created_at: new Date().toISOString()
            };

            const stmt = this.db.prepare(`
                INSERT INTO songs (
                    id, title, is_cover, artist, lyrics_path, lyrics_content, mp3_path,
                    tablature_url, tablature_content, youtube_url, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                newSong.id, newSong.title, newSong.is_cover ? 1 : 0, newSong.artist,
                newSong.lyrics_path, newSong.lyrics_content, newSong.mp3_path,
                newSong.tablature_url, newSong.tablature_content, newSong.youtube_url,
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
            const stmt = this.db.prepare('SELECT * FROM songs ORDER BY created_at DESC');
            const songs = stmt.all();
            
            // Convert boolean fields
            return songs.map(song => ({
                ...song,
                is_cover: Boolean(song.is_cover),
                user_edited: Boolean(song.user_edited),
                guitar_tab_verified: Boolean(song.guitar_tab_verified),
                bass_tab_verified: Boolean(song.bass_tab_verified),
                lyrics_verified: Boolean(song.lyrics_verified)
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
                    mp3_path = ?, tablature_url = ?, tablature_content = ?, youtube_url = ?
                WHERE id = ?
            `);

            const result = stmt.run(
                songData.title, songData.is_cover ? 1 : 0, songData.artist,
                songData.lyrics_path, songData.lyrics_content, songData.mp3_path,
                songData.tablature_url, songData.tablature_content, songData.youtube_url,
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
            const stmt = this.db.prepare('DELETE FROM songs WHERE id = ?');
            const result = stmt.run(parseInt(id));
            return result.changes > 0;
        } catch (error) {
            console.error('Error deleting song:', error);
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
                    tablature_url, tablature_content, youtube_url, created_at, file_path,
                    file_name, extracted_title, extracted_artist, metadata_source,
                    file_size, duration, format, bitrate, sample_rate, last_scanned,
                    user_edited, guitar_tab_url, guitar_tab_verified, bass_tab_url,
                    bass_tab_verified, lyrics_url, lyrics_verified, album
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                newSong.id, newSong.title, newSong.is_cover ? 1 : 0, newSong.artist,
                newSong.lyrics_path, newSong.lyrics_content, newSong.mp3_path,
                newSong.tablature_url, newSong.tablature_content, newSong.youtube_url,
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
                    tablature_url, tablature_content, youtube_url, created_at, file_path,
                    file_name, extracted_title, extracted_artist, metadata_source,
                    file_size, duration, format, bitrate, sample_rate, last_scanned,
                    user_edited, guitar_tab_url, guitar_tab_verified, bass_tab_url,
                    bass_tab_verified, lyrics_url, lyrics_verified, album
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        newSong.tablature_url, newSong.tablature_content, newSong.youtube_url,
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
                    lyrics_verified: Boolean(song.lyrics_verified)
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
            const values = Object.values(metadata);
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
