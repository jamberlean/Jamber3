-- Migration to remove tablature_content column from songs table
-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table

-- Create a new table without tablature_content
CREATE TABLE songs_new (
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

-- Copy data from old table to new table (excluding tablature_content)
INSERT INTO songs_new (
    id, title, is_cover, artist, lyrics_path, lyrics_content, mp3_path,
    tablature_url, youtube_url, created_at, file_path, file_name,
    extracted_title, extracted_artist, metadata_source, file_size,
    duration, format, bitrate, sample_rate, last_scanned, user_edited,
    guitar_tab_url, guitar_tab_verified, bass_tab_url, bass_tab_verified,
    lyrics_url, lyrics_verified, album, is_removed
)
SELECT 
    id, title, is_cover, artist, lyrics_path, lyrics_content, mp3_path,
    tablature_url, youtube_url, created_at, file_path, file_name,
    extracted_title, extracted_artist, metadata_source, file_size,
    duration, format, bitrate, sample_rate, last_scanned, user_edited,
    guitar_tab_url, guitar_tab_verified, bass_tab_url, bass_tab_verified,
    lyrics_url, lyrics_verified, album, is_removed
FROM songs;

-- Drop the old table
DROP TABLE songs;

-- Rename the new table to the original name
ALTER TABLE songs_new RENAME TO songs;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
CREATE INDEX IF NOT EXISTS idx_songs_file_path ON songs(file_path);
CREATE INDEX IF NOT EXISTS idx_songs_extracted_title ON songs(extracted_title);
CREATE INDEX IF NOT EXISTS idx_songs_extracted_artist ON songs(extracted_artist);
CREATE INDEX IF NOT EXISTS idx_songs_created_at ON songs(created_at);
CREATE INDEX IF NOT EXISTS idx_songs_is_removed ON songs(is_removed);