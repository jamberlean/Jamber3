/**
 * File-based error logger for packaged Electron apps
 */
class FileLogger {
    constructor() {
        this.isElectron = typeof window !== 'undefined' && window.process && window.process.versions && window.process.versions.electron;
        this.logQueue = [];
        this.isLogging = false;
        
        // Set up error capture immediately
        this.setupErrorCapture();
    }

    setupErrorCapture() {
        // Capture unhandled errors
        if (typeof window !== 'undefined') {
            window.addEventListener('error', (event) => {
                this.logError('JavaScript Error', {
                    message: event.message,
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno,
                    error: event.error ? event.error.stack : 'No stack trace',
                    timestamp: new Date().toISOString()
                });
            });

            // Capture unhandled promise rejections
            window.addEventListener('unhandledrejection', (event) => {
                this.logError('Unhandled Promise Rejection', {
                    reason: event.reason,
                    timestamp: new Date().toISOString()
                });
            });
        }

        // Capture console errors
        const originalConsoleError = console.error;
        console.error = (...args) => {
            originalConsoleError.apply(console, args);
            this.logError('Console Error', {
                args: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)),
                timestamp: new Date().toISOString()
            });
        };

        // Capture console warnings
        const originalConsoleWarn = console.warn;
        console.warn = (...args) => {
            originalConsoleWarn.apply(console, args);
            this.logError('Console Warning', {
                args: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)),
                timestamp: new Date().toISOString()
            });
        };
    }

    async logError(category, details) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            category: category,
            details: details,
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        // Add to queue
        this.logQueue.push(logEntry);
        
        // Log to console as well
        console.log('FileLogger:', category, details);

        // Write to file if in Electron
        if (this.isElectron) {
            await this.writeToFile(logEntry);
        }
    }

    async writeToFile(logEntry) {
        if (this.isLogging) return;
        
        try {
            this.isLogging = true;
            
            // First try the contextBridge IPC approach (secure)
            if (window.electron && window.electron.ipcRenderer) {
                await window.electron.ipcRenderer.invoke('log-error', logEntry);
                return;
            }
            
            // Fallback: Try direct Node.js APIs (if nodeIntegration is enabled)
            if (typeof require !== 'undefined') {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const os = require('os');
                    
                    // Use a generic log directory in user home
                    const logDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Jamber3', 'logs');
                    const logFile = path.join(logDir, `error-${new Date().toISOString().split('T')[0]}.log`);
                    
                    // Ensure log directory exists
                    try {
                        if (!fs.existsSync(logDir)) {
                            fs.mkdirSync(logDir, { recursive: true });
                        }
                    } catch (err) {
                        // Directory creation failed, skip file logging
                        console.warn('Could not create log directory:', err.message);
                        return;
                    }

                    // Format log entry
                    const logLine = JSON.stringify(logEntry) + '\n';
                    
                    // Append to log file
                    fs.appendFileSync(logFile, logLine);
                } catch (directError) {
                    console.warn('Direct filesystem access failed:', directError.message);
                }
            }
            
        } catch (error) {
            console.error('Failed to write error log:', error);
        } finally {
            this.isLogging = false;
        }
    }

    // Public method to manually log errors
    log(message, details = {}) {
        this.logError('Manual Log', {
            message: message,
            details: details,
            timestamp: new Date().toISOString()
        });
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.fileLogger = new FileLogger();
    
    // Also expose as global function
    window.logError = (message, details) => {
        window.fileLogger.log(message, details);
    };
}

// Export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileLogger;
}