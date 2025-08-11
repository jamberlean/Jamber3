const { app, BrowserWindow, shell, ipcMain, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Main process logger
function logToFile(message, data = {}) {
    try {
        const logDir = path.join(app.getPath('userData'), 'main-logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        const logFile = path.join(logDir, `main-${new Date().toISOString().split('T')[0]}.log`);
        const logEntry = {
            timestamp: new Date().toISOString(),
            message: message,
            data: data,
            isPackaged: app.isPackaged
        };
        
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
        console.log('[MAIN LOG]:', message, data);
    } catch (error) {
        console.error('[MAIN LOG ERROR]:', error);
    }
}

// Log startup
logToFile('Electron main process starting', {
    version: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch
});

// Catch all uncaught exceptions
process.on('uncaughtException', (error) => {
    logToFile('Uncaught Exception in Main Process', {
        error: error.message,
        stack: error.stack
    });
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logToFile('Unhandled Rejection in Main Process', {
        reason: reason,
        promise: promise
    });
    console.error('Unhandled Rejection:', reason);
});

// Reduce GPU process warnings on Windows
if (process.platform === 'win32') {
    app.commandLine.appendSwitch('disable-gpu-sandbox');
    // Only use hardware acceleration if available
    app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
    app.commandLine.appendSwitch('ignore-gpu-blacklist');
}

let mainWindow;
let serverProcess;
let serverModule; // For embedded server in packaged mode

// Path for window state file - use userData directory for consistency
const getWindowStateFilePath = () => {
    try {
        const userDataPath = app.getPath('userData');
        return path.join(userDataPath, 'window-state.json');
    } catch (e) {
        // Fallback to current directory if userData not available
        return path.join(__dirname, 'window-state.json');
    }
};

// Get saved window bounds from JSON file
const getSavedWindowBounds = () => {
    try {
        const WINDOW_STATE_FILE = getWindowStateFilePath();
        if (fs.existsSync(WINDOW_STATE_FILE)) {
            const data = fs.readFileSync(WINDOW_STATE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading window state:', error);
    }
    return null;
};

// Save window bounds to JSON file
const saveWindowBounds = (bounds) => {
    try {
        const WINDOW_STATE_FILE = getWindowStateFilePath();
        const stateData = {
            ...bounds,
            lastSaved: new Date().toISOString()
        };
        
        // Ensure the directory exists
        const dir = path.dirname(WINDOW_STATE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(stateData, null, 2));
        console.log('Window state saved:', bounds);
    } catch (error) {
        console.error('Error saving window state:', error);
    }
};

// Validate bounds are within screen limits
const validateBounds = (bounds) => {
    const displays = screen.getAllDisplays();
    let isValid = false;
    
    // Check if the window position is on any display
    for (const display of displays) {
        const { x: screenX, y: screenY, width: screenWidth, height: screenHeight } = display.workArea;
        
        // Window is considered valid if any part of it is visible on this screen
        if (bounds.x < screenX + screenWidth && bounds.x + bounds.width > screenX &&
            bounds.y < screenY + screenHeight && bounds.y + bounds.height > screenY) {
            isValid = true;
            break;
        }
    }
    
    if (!isValid) {
        // If window is off-screen, center it on primary display
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;
        bounds.x = Math.floor((screenWidth - bounds.width) / 2);
        bounds.y = Math.floor((screenHeight - bounds.height) / 2);
    }
    
    return bounds;
};

const createWindow = () => {
    logToFile('Creating main window');
    
    // Load saved window bounds or use defaults
    const savedBounds = getSavedWindowBounds();
    let windowOptions = {
        width: 1200,
        height: 1000,
        minWidth: 800,
        minHeight: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        },
        icon: path.join(__dirname, 'icons', 'icon.ico'),
        show: true,
        title: 'Jamber3 - Automated Guitar Song Library'
    };
    
    // Apply saved bounds if available and valid
    if (savedBounds) {
        const validatedBounds = validateBounds(savedBounds);
        windowOptions.x = validatedBounds.x;
        windowOptions.y = validatedBounds.y;
        windowOptions.width = validatedBounds.width;
        windowOptions.height = validatedBounds.height;
        
        // Restore maximized state
        if (savedBounds.isMaximized) {
            windowOptions.show = true; // Show immediately, we'll maximize after
        }
        
        console.log('Restored window bounds:', validatedBounds);
    }
    
    logToFile('Window options configured', windowOptions);
    
    try {
        mainWindow = new BrowserWindow(windowOptions);
        logToFile('BrowserWindow created successfully');
        
        // Add crash detection
        mainWindow.webContents.on('crashed', () => {
            logToFile('Renderer process crashed');
        });
        
        mainWindow.webContents.on('unresponsive', () => {
            logToFile('Renderer process became unresponsive');
        });
        
        mainWindow.webContents.on('responsive', () => {
            logToFile('Renderer process became responsive again');
        });
        
        mainWindow.on('closed', () => {
            logToFile('Main window closed');
        });

        // Start the server or load file
        startServer();
        
        // Load the URL immediately after server starts
        setTimeout(() => {
            logToFile('Loading localhost:8081 directly');
            mainWindow.loadURL('http://localhost:8081');
        }, 3000);

    } catch (error) {
        logToFile('Error creating BrowserWindow', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }

    mainWindow.once('ready-to-show', () => {
        logToFile('Window ready-to-show event fired');
        mainWindow.show();
        mainWindow.focus();
        
        // Restore maximized state if it was saved
        const savedBounds = getSavedWindowBounds();
        if (savedBounds && savedBounds.isMaximized) {
            mainWindow.maximize();
        }
    });

    // Handle new window requests (for tabs/external links)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // Calculate letter-sized dimensions (approximately 8.5:11 ratio)
        const screenSize = screen.getPrimaryDisplay().workAreaSize;
        const letterWidth = Math.min(Math.floor(screenSize.width * 0.5), 700); // Half screen or max 700px
        const letterHeight = Math.min(Math.floor(screenSize.height * 0.85), 900); // 85% of screen or max 900px
        
        return {
            action: 'allow',
            overrideBrowserWindowOptions: {
                width: letterWidth,
                height: letterHeight,
                x: Math.floor((screenSize.width - letterWidth) / 2), // Center horizontally
                y: Math.floor((screenSize.height - letterHeight) / 10), // A bit from top
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    enableRemoteModule: false
                },
                icon: path.join(__dirname, 'assets', 'icon.ico'),
                title: 'Jamber3 - External Link',
                resizable: true,
                minimizable: true,
                maximizable: true
            }
        };
    });

    // Also handle the deprecated new-window event for older Electron compatibility
    mainWindow.webContents.on('new-window', (event, url, frameName, disposition, options) => {
        event.preventDefault();
        const screenSize = screen.getPrimaryDisplay().workAreaSize;
        const letterWidth = Math.min(Math.floor(screenSize.width * 0.5), 700);
        const letterHeight = Math.min(Math.floor(screenSize.height * 0.85), 900);
        
        const newWindow = new BrowserWindow({
            ...options,
            width: letterWidth,
            height: letterHeight,
            x: Math.floor((screenSize.width - letterWidth) / 2),
            y: Math.floor((screenSize.height - letterHeight) / 10),
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false
            },
            icon: path.join(__dirname, 'assets', 'icon.ico'),
            title: 'Jamber3 - External Link'
        });
        
        newWindow.loadURL(url);
        event.newGuest = newWindow;
    });

    // Save window state when moved or resized (with debouncing)
    let saveTimeout;
    let isSaving = false;
    let isDragging = false; // Track if user is dragging/selecting
    
    const saveBoundsDebounced = () => {
        // Don't save if window is being destroyed or user is actively dragging
        if (!mainWindow || mainWindow.isDestroyed() || isDragging) {
            return;
        }
        
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            // Triple-check conditions after timeout: window exists, not destroyed, not dragging
            if (mainWindow && !mainWindow.isDestroyed() && !isSaving && !isDragging) {
                isSaving = true;
                try {
                    // Additional safety check - verify window handle is still valid
                    if (mainWindow.isDestroyed() || !mainWindow.getBounds) {
                        console.log('Window handle invalid, skipping bounds save');
                        return;
                    }
                    
                    // Wrap in additional try-catch for getBounds specifically
                    let bounds, isMaximized;
                    try {
                        bounds = mainWindow.getBounds();
                        isMaximized = mainWindow.isMaximized();
                    } catch (boundsError) {
                        console.error('Error getting window bounds:', boundsError.message);
                        // Don't attempt to save if we can't get bounds
                        return;
                    }
                    
                    // Validate bounds before saving
                    if (bounds && typeof bounds.x === 'number' && typeof bounds.y === 'number' && 
                        typeof bounds.width === 'number' && typeof bounds.height === 'number' &&
                        bounds.width > 0 && bounds.height > 0) {
                        saveWindowBounds({
                            ...bounds,
                            isMaximized
                        });
                    } else {
                        console.log('Invalid bounds detected, skipping save:', bounds);
                    }
                } catch (error) {
                    console.error('Error in saveBoundsDebounced:', error.message);
                } finally {
                    isSaving = false;
                }
            }
        }, 750); // Increased delay to 750ms to reduce conflicts with drag operations
    };

    // Add web contents event listeners to detect text selection/dragging
    mainWindow.webContents.on('before-input-event', (event, input) => {
        // Detect when user starts dragging (mouse down while selecting text)
        if (input.type === 'mouseDown') {
            isDragging = true;
            // Clear drag state after a short delay if no mouseUp detected
            setTimeout(() => {
                if (isDragging) {
                    isDragging = false;
                }
            }, 2000);
        } else if (input.type === 'mouseUp') {
            // Small delay before clearing drag state to ensure bounds saving doesn't interfere
            setTimeout(() => {
                isDragging = false;
            }, 100);
        }
    });

    // Listen for window state changes
    mainWindow.on('moved', saveBoundsDebounced);
    mainWindow.on('resized', saveBoundsDebounced);
    mainWindow.on('maximize', saveBoundsDebounced);
    mainWindow.on('unmaximize', saveBoundsDebounced);

    // Handle window closed
    mainWindow.on('closed', () => {
        // Clear any pending window state saves and reset state
        clearTimeout(saveTimeout);
        isDragging = false;
        isSaving = false;
        
        mainWindow = null;
        
        // Handle server shutdown for both modes
        if (serverProcess) {
            console.log('Terminating server process...');
            serverProcess.kill('SIGTERM');
            
            // Force kill after 5 seconds if still running
            setTimeout(() => {
                if (serverProcess && !serverProcess.killed) {
                    console.log('Force killing server process...');
                    serverProcess.kill('SIGKILL');
                }
            }, 5000);
        } else if (serverModule && serverModule.server) {
            console.log('Shutting down embedded server...');
            try {
                serverModule.gracefulShutdown('APP_CLOSE');
            } catch (error) {
                console.error('Error shutting down embedded server:', error);
            }
        }
    });
};

const startServer = (callback) => {
    const isDebug = process.env.NODE_ENV === 'development' || process.argv.includes('--debug');
    
    // In packaged app, we need to use a different approach
    // Check if we're in a packaged app
    const isPackaged = app.isPackaged;
    
    logToFile('Starting server', { isPackaged, isDebug });
    
    if (isPackaged) {
        // In packaged app, run the server in the same process
        logToFile('Running in packaged mode - starting embedded server');
        
        try {
            // Require the server directly instead of spawning a process
            serverModule = require('./server.js');
            
            // Give the server a moment to start, then load the UI
            setTimeout(() => {
                logToFile('Loading application UI after server startup');
                mainWindow.loadURL('http://localhost:8081').then(() => {
                    logToFile('Application UI loaded successfully');
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.show();
                        mainWindow.focus();
                        logToFile('Window shown and focused after UI load');
                    }
                }).catch((error) => {
                    logToFile('Error loading application UI', {
                        error: error.message,
                        stack: error.stack
                    });
                    // If loading fails, still show the window with fallback content
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        const fallbackHtml = `
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <title>Jamber3 - Connection Error</title>
                                <style>
                                    body { font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #1a1a1a; color: #fff; }
                                    h1 { color: #ff6b6b; }
                                    .error-box { background: #2a2a2a; padding: 20px; border-radius: 8px; margin: 20px 0; }
                                    .error-details { background: #333; padding: 10px; border-radius: 4px; font-family: monospace; text-align: left; }
                                    .retry-btn { background: #007acc; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; margin-top: 20px; }
                                </style>
                            </head>
                            <body>
                                <h1>Connection Error</h1>
                                <div class="error-box">
                                    <p>Could not connect to the Jamber3 server:</p>
                                    <div class="error-details">${error.message}</div>
                                </div>
                                <button class="retry-btn" onclick="location.reload()">Retry Connection</button>
                            </body>
                            </html>
                        `;
                        mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fallbackHtml)}`);
                        mainWindow.show();
                    }
                });
            }, 2000); // Give server 2 seconds to start
        } catch (error) {
            logToFile('Failed to start embedded server', {
                error: error.message,
                stack: error.stack
            });
            
            // If server fails due to missing dependencies, try to load the app without server
            if (error.message.includes('Cannot find module') || error.message.includes('express')) {
                logToFile('Attempting to load application in standalone mode without server');
                
                // Load the main HTML file directly without server
                setTimeout(() => {
                    const htmlPath = path.join(__dirname, 'index.html');
                    mainWindow.loadFile(htmlPath).then(() => {
                        logToFile('Standalone application loaded successfully');
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.show();
                        }
                    }).catch((loadError) => {
                        logToFile('Failed to load standalone application', {
                            error: loadError.message,
                            stack: loadError.stack
                        });
                        
                        // Show error UI as last resort
                        const errorHtml = `
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <title>Jamber3 - Startup Error</title>
                                <style>
                                    body { font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #1a1a1a; color: #fff; }
                                    h1 { color: #ff6b6b; }
                                    .error-box { background: #2a2a2a; padding: 20px; border-radius: 8px; margin: 20px 0; }
                                    .error-details { background: #333; padding: 10px; border-radius: 4px; font-family: monospace; text-align: left; }
                                    .info-box { background: #2a4a2a; padding: 15px; border-radius: 4px; margin: 15px 0; }
                                </style>
                            </head>
                            <body>
                                <h1>Application Startup Issue</h1>
                                <div class="error-box">
                                    <p>Unable to start server or load application files:</p>
                                    <div class="error-details">Server: ${error.message}<br/>Load: ${loadError.message}</div>
                                </div>
                                <div class="info-box">
                                    <p><strong>Note:</strong> This appears to be a dependency packaging issue.</p>
                                    <p>The application may need to be rebuilt with proper dependency inclusion.</p>
                                </div>
                                <p>Logs available at: ${app.getPath('userData')}\\main-logs\\</p>
                            </body>
                            </html>
                        `;
                        mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
                        mainWindow.show();
                    });
                }, 1000);
            } else {
                // Show error UI for other types of errors
                if (mainWindow && !mainWindow.isDestroyed()) {
                    const errorHtml = `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>Jamber3 - Server Error</title>
                            <style>
                                body { font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #1a1a1a; color: #fff; }
                                h1 { color: #ff6b6b; }
                                .error-box { background: #2a2a2a; padding: 20px; border-radius: 8px; margin: 20px 0; }
                                .error-details { background: #333; padding: 10px; border-radius: 4px; font-family: monospace; text-align: left; }
                                .log-path { background: #333; padding: 10px; border-radius: 4px; font-family: monospace; margin-top: 10px; }
                            </style>
                        </head>
                        <body>
                            <h1>Server Initialization Error</h1>
                            <div class="error-box">
                                <p>Failed to start the Jamber3 server:</p>
                                <div class="error-details">${error.message}</div>
                            </div>
                            <p>Check the log files for more details:</p>
                            <div class="log-path">${app.getPath('userData')}\\main-logs\\</div>
                        </body>
                        </html>
                    `;
                    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
                    mainWindow.show();
                }
            }
        }
        
        if (callback) {
            callback();
        }
        return;
    }
    
    // Development mode - spawn separate process
    serverProcess = spawn('node', ['server.js'], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'], // Use pipe to capture output
        windowsHide: !isDebug, // Show console window in debug mode
        env: { ...process.env, NODE_ENV: isDebug ? 'development' : process.env.NODE_ENV },
        detached: false // Ensure server is tied to parent process
    });

    serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[Server]: ${output}`);
        if (output.includes('SERVER_READY')) {
            logToFile('Server ready, loading UI');
            setTimeout(() => {
                mainWindow.loadURL('http://localhost:8081').then(() => {
                    logToFile('UI loaded from server ready callback');
                }).catch(err => {
                    logToFile('Error loading UI from server ready', { error: err.message });
                });
            }, 1000);
            if (callback) {
                callback();
            }
        }
    });

    serverProcess.stderr.on('data', (data) => {
        console.error(`[Server Error]: ${data}`);
    });

    serverProcess.on('error', (error) => {
        console.error('Failed to start server:', error);
    });
    
    serverProcess.on('close', (code) => {
        if (code === 143 || code === 0) {
            // Normal termination (SIGTERM = 143, clean exit = 0)
            console.log(`Server process terminated normally (code ${code})`);
        } else if (code !== null) {
            // Actual unexpected exit
            console.error(`Server process exited unexpectedly with code ${code}`);
        }
    });
};

// Handle file opening from renderer process
ipcMain.handle('open-file', async (event, filePath) => {
    try {
        await shell.openPath(filePath);
        return { success: true };
    } catch (error) {
        console.error('Error opening file:', error);
        return { success: false, error: error.message };
    }
});

// Handle error logging from renderer process
ipcMain.handle('log-error', async (event, logEntry) => {
    try {
        const fs = require('fs').promises;
        const path = require('path');
        
        const logDir = path.join(app.getPath('userData'), 'logs');
        const logFile = path.join(logDir, `error-${new Date().toISOString().split('T')[0]}.log`);
        
        // Ensure log directory exists
        try {
            await fs.mkdir(logDir, { recursive: true });
        } catch (err) {
            // Directory might already exist
        }

        // Format log entry with additional system info
        const enhancedLogEntry = {
            ...logEntry,
            electronVersion: process.versions.electron,
            nodeVersion: process.versions.node,
            platform: process.platform,
            arch: process.arch,
            isPackaged: app.isPackaged
        };

        const logLine = JSON.stringify(enhancedLogEntry) + '\n';
        
        // Append to log file
        await fs.appendFile(logFile, logLine);
        
        console.log(`Error logged to: ${logFile}`);
        return { success: true, logFile: logFile };
    } catch (error) {
        console.error('Failed to write error log:', error);
        return { success: false, error: error.message };
    }
});


// Handle app events
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    // Handle server shutdown for both modes
    if (serverProcess && !serverProcess.killed) {
        console.log('Terminating server process on window close...');
        serverProcess.kill('SIGTERM');
    } else if (serverModule && serverModule.server) {
        console.log('Shutting down embedded server on window close...');
        try {
            serverModule.gracefulShutdown('WINDOW_CLOSE');
        } catch (error) {
            console.error('Error shutting down embedded server:', error);
        }
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

let isQuitting = false;

app.on('before-quit', (event) => {
    if (!isQuitting) {
        // Handle server shutdown for both modes
        if (serverProcess && !serverProcess.killed) {
            console.log('Terminating server process before quit...');
            isQuitting = true;
            event.preventDefault();
            
            serverProcess.kill('SIGTERM');
            
            // Give server 3 seconds to shut down gracefully
            setTimeout(() => {
                if (serverProcess && !serverProcess.killed) {
                    console.log('Force killing server process...');
                    serverProcess.kill('SIGKILL');
                }
                app.quit();
            }, 3000);
        } else if (serverModule && serverModule.server) {
            console.log('Shutting down embedded server before quit...');
            isQuitting = true;
            event.preventDefault();
            
            try {
                serverModule.gracefulShutdown('APP_QUIT');
                // Give embedded server time to shut down
                setTimeout(() => {
                    app.quit();
                }, 1000);
            } catch (error) {
                console.error('Error shutting down embedded server:', error);
                app.quit();
            }
        }
    }
});