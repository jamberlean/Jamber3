/**
 * Error Logger Utility for Jamber3
 * Provides comprehensive error logging to errors.log file
 */

const fs = require('fs');
const path = require('path');

class ErrorLogger {
    constructor() {
        this.logFile = path.join(__dirname, 'errors.log');
        this.isElectron = typeof window !== 'undefined' && window.require;
        this.isInitialized = false;
        
        // Initialize log file if it doesn't exist
        try {
            this.initializeLogFile();
            this.isInitialized = true;
        } catch (error) {
            console.error('Failed to initialize error logger:', error);
            this.isInitialized = false;
        }
    }

    /**
     * Initialize the log file with header information
     */
    initializeLogFile() {
        try {
            // Check if we're in the renderer process (where fs access is restricted)
            if (this.isElectron && typeof window !== 'undefined') {
                // In renderer process, skip file initialization
                console.log('Error logger running in renderer process - console logging only');
                return;
            }
            
            if (!fs.existsSync(this.logFile)) {
                const header = `=== JAMBER3 ERROR LOG ===\nStarted: ${new Date().toISOString()}\n\n`;
                fs.writeFileSync(this.logFile, header, 'utf8');
            }
        } catch (error) {
            console.error('Failed to initialize error log file:', error);
            // Continue without file logging - use console only
        }
    }

    /**
     * Format error information for logging
     * @param {string} component - Component where error occurred
     * @param {string} operation - Operation being performed
     * @param {Error|string} error - Error object or message
     * @param {Object} context - Additional context information
     * @returns {string} Formatted log entry
     */
    formatLogEntry(component, operation, error, context = {}) {
        const timestamp = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : '';
        
        let logEntry = `[${timestamp}] ERROR in ${component}:${operation}\n`;
        logEntry += `Message: ${errorMessage}\n`;
        
        if (context.songId) {
            logEntry += `Song ID: ${context.songId}\n`;
        }
        
        if (context.audioSrc) {
            logEntry += `Audio Source: ${context.audioSrc}\n`;
        }
        
        if (context.userAgent) {
            logEntry += `User Agent: ${context.userAgent}\n`;
        }
        
        if (context.additionalInfo) {
            logEntry += `Additional Info: ${JSON.stringify(context.additionalInfo)}\n`;
        }
        
        if (stack) {
            logEntry += `Stack Trace:\n${stack}\n`;
        }
        
        logEntry += '---\n\n';
        
        return logEntry;
    }

    /**
     * Write error to log file
     * @param {string} component - Component where error occurred
     * @param {string} operation - Operation being performed
     * @param {Error|string} error - Error object or message
     * @param {Object} context - Additional context information
     */
    logError(component, operation, error, context = {}) {
        try {
            // Don't try to log if not initialized
            if (!this.isInitialized) {
                console.error(`[${component}:${operation}] (Logger not initialized)`, error);
                return;
            }
            
            const logEntry = this.formatLogEntry(component, operation, error, context);
            
            // Also log to console for immediate debugging
            console.error(`[${component}:${operation}]`, error);
            
            // Write to file with additional safety checks
            try {
                // Skip file writing in renderer process due to security restrictions
                if (this.isElectron && typeof window !== 'undefined') {
                    // In renderer process, only use console logging
                    return;
                }
                
                // In Node.js (main process) - write to file
                if (typeof fs !== 'undefined' && fs.appendFileSync) {
                    fs.appendFileSync(this.logFile, logEntry, 'utf8');
                }
            } catch (fsError) {
                console.error('Filesystem error during logging:', fsError);
            }
        } catch (writeError) {
            console.error('Failed to write to error log:', writeError);
            console.error('Original error:', error);
        }
    }

    /**
     * Log audio-specific errors
     * @param {string} operation - Audio operation (load, play, seek, etc.)
     * @param {Error|string} error - Error object or message
     * @param {Object} context - Audio context (songId, audioSrc, etc.)
     */
    logAudioError(operation, error, context = {}) {
        this.logError('AudioPlayer', operation, error, {
            ...context,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js',
            toneVersion: typeof Tone !== 'undefined' ? Tone.version : 'unknown'
        });
    }

    /**
     * Log song details errors
     * @param {string} operation - Song details operation
     * @param {Error|string} error - Error object or message
     * @param {Object} context - Song context
     */
    logSongDetailsError(operation, error, context = {}) {
        this.logError('SongDetails', operation, error, context);
    }

    /**
     * Log navigation errors
     * @param {string} operation - Navigation operation
     * @param {Error|string} error - Error object or message
     * @param {Object} context - Navigation context
     */
    logNavigationError(operation, error, context = {}) {
        this.logError('Navigation', operation, error, context);
    }

    /**
     * Clear the error log file
     */
    clearLog() {
        try {
            // Skip file operations in renderer process
            if (this.isElectron && typeof window !== 'undefined') {
                console.log('Error log cleared (renderer process - console only)');
                return;
            }
            
            const header = `=== JAMBER3 ERROR LOG ===\nCleared: ${new Date().toISOString()}\n\n`;
            if (typeof fs !== 'undefined' && fs.writeFileSync) {
                fs.writeFileSync(this.logFile, header, 'utf8');
            }
        } catch (error) {
            console.error('Failed to clear error log:', error);
        }
    }

    /**
     * Get the log file path
     * @returns {string} Path to error log file
     */
    getLogPath() {
        return this.logFile;
    }
}

// Create singleton instance
const errorLogger = new ErrorLogger();

// For browser/renderer process
if (typeof window !== 'undefined') {
    window.ErrorLogger = errorLogger;
}

// For Node.js/main process
if (typeof module !== 'undefined' && module.exports) {
    module.exports = errorLogger;
}