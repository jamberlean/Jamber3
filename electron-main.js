const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

const createWindow = () => {
    mainWindow = new BrowserWindow({
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
    });

    // Start the Express server
    startServer();

    // Wait a moment for server to start, then load the page
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:8081');
    }, 2000);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Handle new window requests (for tabs/external links)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // Calculate letter-sized dimensions (approximately 8.5:11 ratio)
        const screenSize = require('electron').screen.getPrimaryDisplay().workAreaSize;
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
        const screenSize = require('electron').screen.getPrimaryDisplay().workAreaSize;
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

    // Handle window closed
    mainWindow.on('closed', () => {
        mainWindow = null;
        if (serverProcess) {
            serverProcess.kill();
        }
    });
};

const startServer = (callback) => {
    const isDebug = process.env.NODE_ENV === 'development' || process.argv.includes('--debug');
    
    serverProcess = spawn('node', ['server.js'], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'], // Use pipe to capture output
        windowsHide: !isDebug, // Show console window in debug mode
        env: { ...process.env, NODE_ENV: isDebug ? 'development' : process.env.NODE_ENV }
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
    if (serverProcess) {
        serverProcess.kill();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
});