/**
 * Global Error Handler for Jamber3
 * Catches uncaught exceptions and unhandled promise rejections
 */

// Global error handler for uncaught JavaScript errors
window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error);
    
    if (window.ErrorLogger) {
        window.ErrorLogger.logError('Global', 'uncaughtError', event.error, {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            message: event.message,
            additionalInfo: {
                url: window.location.href,
                timestamp: new Date().toISOString()
            }
        });
    }
});

// Global handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    if (window.ErrorLogger) {
        window.ErrorLogger.logError('Global', 'unhandledPromiseRejection', event.reason, {
            additionalInfo: {
                url: window.location.href,
                timestamp: new Date().toISOString(),
                promiseRejectionReason: String(event.reason)
            }
        });
    }
});

// Console error override to catch console.error calls
const originalConsoleError = console.error;
let isLoggingError = false; // Prevent infinite recursion

console.error = function(...args) {
    // Call original console.error
    originalConsoleError.apply(console, args);
    
    // Prevent infinite recursion
    if (isLoggingError) {
        return;
    }
    
    // Log to file if it's a significant error
    if (window.ErrorLogger && args.length > 0) {
        const errorMessage = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        // Only log certain types of console errors to avoid spam
        if (errorMessage.toLowerCase().includes('audio') || 
            errorMessage.toLowerCase().includes('tone') ||
            errorMessage.toLowerCase().includes('player') ||
            errorMessage.toLowerCase().includes('song') ||
            errorMessage.toLowerCase().includes('failed') ||
            errorMessage.toLowerCase().includes('error')) {
            
            isLoggingError = true;
            try {
                window.ErrorLogger.logError('Console', 'error', errorMessage, {
                    additionalInfo: {
                        args: args,
                        url: window.location.href,
                        timestamp: new Date().toISOString()
                    }
                });
            } finally {
                isLoggingError = false;
            }
        }
    }
};

// Track application crashes/freezes
let lastHeartbeat = Date.now();
const HEARTBEAT_INTERVAL = 5000; // 5 seconds
const CRASH_THRESHOLD = 15000; // 15 seconds

// Simple heartbeat to detect if the application becomes unresponsive
function heartbeat() {
    lastHeartbeat = Date.now();
}

setInterval(heartbeat, HEARTBEAT_INTERVAL);

// Check for potential crashes
setInterval(() => {
    const timeSinceLastHeartbeat = Date.now() - lastHeartbeat;
    
    if (timeSinceLastHeartbeat > CRASH_THRESHOLD) {
        console.warn('Application may be unresponsive');
        
        if (window.ErrorLogger) {
            window.ErrorLogger.logError('Global', 'applicationUnresponsive', 'Application heartbeat missed', {
                additionalInfo: {
                    timeSinceLastHeartbeat,
                    threshold: CRASH_THRESHOLD,
                    url: window.location.href,
                    timestamp: new Date().toISOString()
                }
            });
        }
        
        // Reset heartbeat to avoid spam
        lastHeartbeat = Date.now();
    }
}, CRASH_THRESHOLD);

// Electron-specific error handling if available
if (typeof window.require !== 'undefined') {
    try {
        const { ipcRenderer } = window.require('electron');
        
        // Listen for main process errors
        ipcRenderer.on('main-process-error', (event, error) => {
            console.error('Main process error:', error);
            
            if (window.ErrorLogger) {
                window.ErrorLogger.logError('Electron', 'mainProcessError', error, {
                    additionalInfo: {
                        timestamp: new Date().toISOString()
                    }
                });
            }
        });
        
    } catch (error) {
        console.warn('Could not set up Electron error handling:', error);
    }
}

console.log('Global error handler initialized');