console.log('=== FULL SQLite Migration ===');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'tablary.db');
const JSON_FILE = path.join(__dirname, 'songs.json');
const SCHEMA_FILE = path.join(__dirname, 'sqlite-schema.sql');

// Remove existing database to start fresh
if (fs.existsSync(DB_FILE)) {
    fs.unlinkSync(DB_FILE);
    console.log('Removed existing database');
}

console.log('Reading JSON data...');
const jsonData = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
console.log(`Found ${jsonData.songs.length} songs to migrate`);

console.log('Creating new SQLite database...');
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error('Database creation error:', err);
        return;
    }

    console.log('Executing schema...');
    const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
    
    db.exec(schema, (err) => {
        if (err) {
            console.error('Schema error:', err);
            return;
        }

        console.log('Starting full migration...');
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            // Migrate songs with all fields
            const stmt = db.prepare(`
                INSERT INTO songs (
                    id, title, is_cover, artist, lyrics_path, lyrics_content, mp3_path,
                    tablature_url, tablature_content, youtube_url, created_at, file_path,
                    file_name, extracted_title, extracted_artist, metadata_source,
                    file_size, duration, format, bitrate, sample_rate, last_scanned,
                    user_edited, guitar_tab_url, guitar_tab_verified, bass_tab_url,
                    bass_tab_verified, lyrics_url, lyrics_verified, album
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            let migrated = 0;
            for (const song of jsonData.songs) {
                stmt.run(
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
                migrated++;
                
                if (migrated % 1000 === 0) {
                    console.log(`Migrated ${migrated} songs...`);
                }
            }

            stmt.finalize(() => {
                console.log(`Migrated ${migrated} songs total`);

                // Migrate scan directories
                if (jsonData.scan_directories && jsonData.scan_directories.length > 0) {
                    const dirStmt = db.prepare(`
                        INSERT INTO scan_directories (path, enabled, last_scanned, file_count)
                        VALUES (?, ?, ?, ?)
                    `);

                    for (const dir of jsonData.scan_directories) {
                        dirStmt.run(dir.path, dir.enabled ? 1 : 0, dir.last_scanned, dir.file_count || 0);
                    }
                    dirStmt.finalize();
                    console.log(`Migrated ${jsonData.scan_directories.length} scan directories`);
                }

                // Migrate app settings
                if (jsonData.app_settings) {
                    const settingsStmt = db.prepare(`
                        INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)
                    `);

                    for (const [key, value] of Object.entries(jsonData.app_settings)) {
                        settingsStmt.run(key, JSON.stringify(value));
                    }
                    settingsStmt.finalize();
                    console.log('Migrated app settings');
                }

                // Set next_id
                if (jsonData.nextId) {
                    const nextIdStmt = db.prepare(`
                        INSERT OR REPLACE INTO app_settings (key, value) VALUES ('next_id', ?)
                    `);
                    nextIdStmt.run(jsonData.nextId.toString());
                    nextIdStmt.finalize();
                    console.log(`Set next_id to ${jsonData.nextId}`);
                }

                db.run('COMMIT', (err) => {
                    if (err) {
                        console.error('Commit error:', err);
                        db.run('ROLLBACK');
                    } else {
                        console.log('✓ Migration completed successfully');
                        
                        // Create backup of JSON file
                        const backupPath = path.join(__dirname, `songs-backup-${Date.now()}.json`);
                        fs.copyFileSync(JSON_FILE, backupPath);
                        console.log(`✓ JSON backup created: ${path.basename(backupPath)}`);
                        
                        // Final verification
                        db.get('SELECT COUNT(*) as count FROM songs', (err, row) => {
                            if (err) {
                                console.error('Verification error:', err);
                            } else {
                                console.log(`✓ Final verification: ${row.count} songs in database`);
                                
                                const stats = fs.statSync(DB_FILE);
                                console.log(`✓ Database size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                            }
                            db.close();
                        });
                    }
                });
            });
        });
    });
});