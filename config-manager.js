const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILE = path.join(__dirname, 'jamber3-config.json');

class ConfigManager {
    constructor() {
        this.config = this.loadConfig();
    }

    /**
     * Load configuration from file (READ-ONLY)
     * @returns {Object} Configuration object
     */
    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const data = fs.readFileSync(CONFIG_FILE, 'utf8');
                const config = JSON.parse(data);
                return this.migrateConfig(config);
            } else {
                console.error('CRITICAL: jamber3-config.json file not found!');
                console.error('This file must exist and cannot be created by the application.');
                throw new Error('Configuration file is required but missing');
            }
        } catch (error) {
            console.error('Error loading config file:', error.message);
            throw error;
        }
    }

    // Config file creation is DISABLED - file must exist externally

    /**
     * Get standard music directories for the current OS
     * @returns {Array} Array of directory paths
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
                path.join(homeDir, 'Documents', 'Music'),
                'C:\\Music',
                'C:\\Users\\Public\\Music'
            );

            // Check for additional drives
            const driveLetters = 'DEFGHIJKLMNOPQRSTUVWXYZ';
            for (const letter of driveLetters) {
                const musicPath = `${letter}:\\Music`;
                if (this.directoryExists(musicPath)) {
                    dirs.push(musicPath);
                }
            }
        } else if (platform === 'darwin') {
            // macOS standard directories
            dirs.push(
                path.join(homeDir, 'Music'),
                path.join(homeDir, 'Downloads'),
                path.join(homeDir, 'Documents'),
                '/Users/Shared/Music'
            );
        } else {
            // Linux standard directories
            dirs.push(
                path.join(homeDir, 'Music'),
                path.join(homeDir, 'Downloads'),
                path.join(homeDir, 'Documents'),
                '/usr/share/music',
                '/home/music'
            );
        }

        // Filter to only existing directories
        return dirs.filter(dir => this.directoryExists(dir));
    }

    /**
     * Get directories that should be excluded by default
     * @returns {Array} Array of directory paths/patterns
     */
    getStandardExcludedDirectories() {
        const platform = os.platform();
        const excluded = [
            'node_modules',
            '.git',
            '.vs',
            '.vscode',
            'Temp',
            'tmp',
            '$RECYCLE.BIN',
            'System Volume Information'
        ];

        if (platform === 'win32') {
            excluded.push(
                'C:\\Windows',
                'C:\\Program Files',
                'C:\\Program Files (x86)',
                'C:\\ProgramData',
                'C:\\System32'
            );
        } else if (platform === 'darwin') {
            excluded.push(
                '/System',
                '/Library',
                '/Applications',
                '/usr/bin',
                '/usr/lib'
            );
        } else {
            excluded.push(
                '/bin',
                '/sbin',
                '/usr/bin',
                '/usr/sbin',
                '/lib',
                '/usr/lib',
                '/sys',
                '/proc'
            );
        }

        return excluded;
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
     * Migrate old configuration to new version
     * @param {Object} config - Old configuration
     * @returns {Object} Migrated configuration
     */
    migrateConfig(config) {
        // If no version, assume it needs full migration
        if (!config.version) {
            console.log('Migrating configuration to new format...');
            const newConfig = this.createDefaultConfig();
            
            // Preserve any custom settings if they exist
            if (config.scan_directories) {
                newConfig.scan_directories.custom_paths = config.scan_directories.custom_paths || [];
            }
            
            return newConfig;
        }

        // Config migration is minimal - file must contain all required sections
        console.log('Config migration: assuming config file is complete and valid');
        return config;
    }

    /**
     * Config saving is DISABLED - file is read-only
     */
    saveConfig(config = null) {
        console.warn('Cannot save config - jamber3-config.json is read-only');
        return false;
    }

    /**
     * Reload configuration from file
     * @returns {boolean} True if reloaded successfully
     */
    reloadConfig() {
        try {
            console.log('Reloading configuration from file...');
            this.config = this.loadConfig();
            console.log('Configuration reloaded successfully');
            return true;
        } catch (error) {
            console.error('Error reloading config:', error.message);
            return false;
        }
    }

    /**
     * Get current configuration
     * @returns {Object} Current configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Update configuration section
     * @param {string} section - Section name
     * @param {Object} updates - Updates to apply
     * @returns {boolean} True if updated successfully
     */
    updateSection(section, updates) {
        console.warn('Cannot update config section - jamber3-config.json is read-only');
        return false;
    }

    /**
     * Add custom scan directory
     * @param {string} dirPath - Directory path to add
     * @returns {boolean} True if added successfully
     */
    addScanDirectory(dirPath) {
        console.warn('Cannot add scan directory - config file is read-only');
        return false;
    }

    /**
     * Remove scan directory
     * @param {string} dirPath - Directory path to remove
     * @returns {boolean} True if removed successfully
     */
    removeScanDirectory(dirPath) {
        console.warn('Cannot remove scan directory - config file is read-only');
        return false;
    }

    /**
     * Get all enabled scan directories
     * @returns {Array} Array of directory paths to scan
     */
    getScanDirectories() {
        const enabled = [
            ...this.config.scan_directories.enabled_paths,
            ...this.config.scan_directories.custom_paths
        ];

        // Remove excluded directories
        return enabled.filter(dir => 
            !this.config.scan_directories.excluded_paths.includes(dir) &&
            this.directoryExists(dir)
        );
    }

    /**
     * Get file filter settings
     * @returns {Object} File filter configuration
     */
    getFileFilters() {
        return { ...this.config.file_filters };
    }

    /**
     * Get scanning settings
     * @returns {Object} Scanning configuration
     */
    getScanningSettings() {
        return { ...this.config.scanning };
    }

    /**
     * Get UI preferences
     * @returns {Object} UI preferences
     */
    getUIPreferences() {
        return { ...this.config.ui_preferences };
    }

    /**
     * Reset configuration to defaults
     * @returns {boolean} True if reset successfully
     */
    resetToDefaults() {
        console.warn('Cannot reset config - jamber3-config.json is read-only');
        return false;
    }

    /**
     * Export configuration
     * @param {string} filePath - Path to export to
     * @returns {boolean} True if exported successfully
     */
    exportConfig(filePath) {
        console.warn('Config export disabled - jamber3-config.json should be managed externally');
        return false;
    }

    /**
     * Import configuration
     * @param {string} filePath - Path to import from
     * @returns {boolean} True if imported successfully
     */
    importConfig(filePath) {
        console.warn('Cannot import config - jamber3-config.json is read-only');
        return false;
    }

    /**
     * Lock the configuration after first successful scan
     * @returns {boolean} True if locked successfully
     */
    lockConfiguration() {
        console.warn('Cannot lock configuration - jamber3-config.json is read-only');
        return false;
    }

    /**
     * Check if configuration is locked
     * @returns {boolean} True if configuration is locked
     */
    isLocked() {
        return this.config.locked === true;
    }

    /**
     * Unlock configuration (allows full rescan)
     * @returns {boolean} True if unlocked successfully
     */
    unlockConfiguration() {
        console.warn('Cannot unlock configuration - jamber3-config.json is read-only');
        return false;
    }

    /**
     * Add a path to excluded directories
     * @param {string} dirPath - Directory path to exclude
     * @returns {boolean} True if added successfully
     */
    addExcludedPath(dirPath) {
        console.warn('Cannot add excluded path - jamber3-config.json is read-only');
        console.warn('Please add excluded paths directly to the jamber3-config.json file');
        return false;
    }

    /**
     * Remove a path from excluded directories
     * @param {string} dirPath - Directory path to remove from exclusions
     * @returns {boolean} True if removed successfully
     */
    removeExcludedPath(dirPath) {
        console.warn('Cannot remove excluded path - jamber3-config.json is read-only');
        console.warn('Please remove excluded paths directly from the jamber3-config.json file');
        return false;
    }

    /**
     * Check if a path is excluded
     * @param {string} filePath - File or directory path to check
     * @returns {boolean} True if path should be excluded
     */
    isPathExcluded(filePath) {
        if (!filePath) return false;
        
        const normalizedPath = path.resolve(filePath);
        
        // Check direct exclusions
        for (const excludedPath of this.config.scan_directories.excluded_paths) {
            if (normalizedPath.startsWith(excludedPath)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Excluded path cleanup is handled externally since config is read-only
     */
    async cleanupExcludedPathSongs(excludedPaths) {
        console.log('Config is read-only - excluded path cleanup must be handled externally');
    }
}

module.exports = ConfigManager;