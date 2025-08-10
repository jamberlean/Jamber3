-- SQLite Database Schema for Jamber3
-- Migration from songs.json to SQLite database

-- Main songs table with all existing fields
CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    is_cover BOOLEAN DEFAULT 0,
    artist TEXT,
    lyrics_path TEXT,
    lyrics_content TEXT,
    mp3_path TEXT,
    tablature_url TEXT,
    youtube_url TEXT,
    created_at TEXT,
    file_path TEXT,
    file_name TEXT,
    extracted_title TEXT,
    extracted_artist TEXT,
    metadata_source TEXT DEFAULT 'manual',
    file_size INTEGER,
    duration INTEGER,
    format TEXT,
    bitrate INTEGER,
    sample_rate INTEGER,
    last_scanned TEXT,
    user_edited BOOLEAN DEFAULT 0,
    guitar_tab_url TEXT,
    guitar_tab_verified BOOLEAN DEFAULT 0,
    bass_tab_url TEXT,
    bass_tab_verified BOOLEAN DEFAULT 0,
    lyrics_url TEXT,
    lyrics_verified BOOLEAN DEFAULT 0,
    album TEXT,
    is_removed BOOLEAN DEFAULT 0
);

-- Scan directories table
CREATE TABLE IF NOT EXISTS scan_directories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    enabled BOOLEAN DEFAULT 1,
    last_scanned TEXT,
    file_count INTEGER DEFAULT 0
);

-- App settings table (key-value pairs)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Set Lists table
CREATE TABLE IF NOT EXISTS setlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Song-Setlist junction table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS song_setlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    setlist_id INTEGER NOT NULL,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
    FOREIGN KEY (setlist_id) REFERENCES setlists(id) ON DELETE CASCADE,
    UNIQUE(song_id, setlist_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
CREATE INDEX IF NOT EXISTS idx_songs_file_path ON songs(file_path);
CREATE INDEX IF NOT EXISTS idx_songs_extracted_title ON songs(extracted_title);
CREATE INDEX IF NOT EXISTS idx_songs_extracted_artist ON songs(extracted_artist);
CREATE INDEX IF NOT EXISTS idx_songs_created_at ON songs(created_at);
CREATE INDEX IF NOT EXISTS idx_songs_is_removed ON songs(is_removed);
CREATE INDEX IF NOT EXISTS idx_scan_directories_path ON scan_directories(path);
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);
CREATE INDEX IF NOT EXISTS idx_song_setlists_song_id ON song_setlists(song_id);
CREATE INDEX IF NOT EXISTS idx_song_setlists_setlist_id ON song_setlists(setlist_id);

-- Initialize default app settings
INSERT OR IGNORE INTO app_settings (key, value) VALUES 
    ('first_launch', 'true'),
    ('last_scan', NULL),
    ('scan_in_progress', 'false'),
    ('next_id', '1');