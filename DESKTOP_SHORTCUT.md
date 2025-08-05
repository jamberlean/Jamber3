# Creating a Desktop Shortcut for SetList

## Method 1: Silent Launch (Recommended)

**Option A - Use the provided silent launcher:**
1. Copy `SetList-Silent.vbs` from the project folder to your desktop
2. Double-click `SetList-Silent.vbs` to launch - no command window will appear!

**Option B - Create your own silent batch file:**
1. Create a new text file called `SetList-Silent.bat` on your desktop
2. Add this content:
```batch
@echo off
cd /d "C:\git\SetList"
start "" /B npm start
```
3. Save the file
4. Double-click to launch without showing command window

## Method 2: Simple Batch File Shortcut (shows command window)

1. Create a new text file called `SetList.bat` on your desktop
2. Add this content to the file:
```batch
@echo off
cd /d "C:\git\SetList"
npm start
```
3. Save the file
4. Double-click `SetList.bat` to launch the app

## Method 2: Windows Shortcut with Icon

1. Right-click on your desktop and select "New" > "Shortcut"
2. For the location, enter:
   ```
   C:\Windows\System32\cmd.exe /c "cd /d C:\git\SetList && npm start"
   ```
3. Click "Next"
4. Name it "SetList" and click "Finish"
5. Right-click the new shortcut and select "Properties"
6. In the "Shortcut" tab:
   - Change "Start in:" to: `C:\git\SetList`
   - Click "Change Icon..."
   - Click "Browse..." and navigate to `C:\git\SetList\assets\icon.ico`
   - Select the icon and click "OK"
7. Click "OK" to save

## Method 3: PowerShell Shortcut (Recommended)

Create a PowerShell script that starts the app more cleanly:

1. Create `SetList.ps1` on your desktop with this content:
```powershell
Set-Location "C:\git\SetList"
Start-Process "npm" -ArgumentList "start" -NoNewWindow
```

2. Create a batch file `SetList.bat` that calls the PowerShell script:
```batch
@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0SetList.ps1"
```

## Alternative: Add to Start Menu

To add SetList to your Start Menu:
1. Create the shortcut using Method 2 above
2. Copy the shortcut to: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\`

Now you can find SetList in your Start Menu and pin it to taskbar if desired.

## Note
Make sure Node.js and npm are installed and available in your system PATH for these shortcuts to work.