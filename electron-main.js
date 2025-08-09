const { app, BrowserWindow, shell, ipcMain, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Reduce GPU process warnings on Windows
if (process.platform === 'win32') {
    app.commandLine.appendSwitch('disable-gpu-sandbox');
    // Only use hardware acceleration if available
    app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
    app.commandLine.appendSwitch('ignore-gpu-blacklist');
}

let mainWindow;
let serverProcess;

// Path for window state file
const WINDOW_STATE_FILE = path.join(__dirname, 'window-state.json');

// Get saved window bounds from JSON file
const getSavedWindowBounds = () => {
    try {
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
        const stateData = {
            ...bounds,
            lastSaved: new Date().toISOString()
        };
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
            enableRemoteModule: true
        },
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        show: false,
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
            windowOptions.show = false; // We'll maximize after show
        }
        
        console.log('Restored window bounds:', validatedBounds);
    }
    
    mainWindow = new BrowserWindow(windowOptions);

    // Start the Express server
    startServer();

    // Wait a moment for server to start, then load the page
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:8081');
    }, 2000);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
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
        }
    });
};

const startServer = (callback) => {
    const isDebug = process.env.NODE_ENV === 'development' || process.argv.includes('--debug');
    
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
    if (serverProcess && !serverProcess.killed) {
        console.log('Terminating server process on window close...');
        serverProcess.kill('SIGTERM');
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

let isQuitting = false;

app.on('before-quit', (event) => {
    if (serverProcess && !serverProcess.killed && !isQuitting) {
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
    }
});