# Creating a Desktop Icon/Shortcut for Jamber3 Music Library

## Method 1: Automated Desktop Shortcut Creation (Easiest)

**Use the provided shortcut creator:**
1. Right-click on `Create-Desktop-Shortcut.bat` and select "Run as administrator" (recommended)
2. The script will automatically create a desktop shortcut with the Jamber3 icon
3. Double-click the new "Jamber3 Music Library" shortcut to launch the app

## Method 2: Silent Launch (No Command Window)

**Option A - Use the provided silent launcher:**
1. Copy `Jamber3-Silent.vbs` from the project folder to your desktop
2. Double-click `Jamber3-Silent.vbs` to launch - no command window will appear!

**Option B - Create your own silent VBS file:**
1. Create a new text file called `Jamber3-Silent.vbs` on your desktop
2. Add this content:
```vbs
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c ""cd /d C:\git\PlayMyLibrary && npm start""", 0, False
```
3. Save the file
4. Double-click to launch without showing command window

## Method 3: Simple Batch File Shortcut (Shows Command Window)

**Option A - Use the provided batch file:**
1. Copy `Jamber3.bat` from the project folder to your desktop
2. Double-click `Jamber3.bat` to launch the app

**Option B - Create your own batch file:**
1. Create a new text file called `Jamber3.bat` on your desktop
2. Add this content to the file:
```batch
@echo off
title Jamber3 Music Library
cd /d "C:\git\PlayMyLibrary"
npm start
pause
```
3. Save the file
4. Double-click `Jamber3.bat` to launch the app

## Method 4: Manual Windows Shortcut with Custom Icon

1. Right-click on your desktop and select "New" > "Shortcut"
2. For the location, enter:
   ```
   C:\Windows\System32\cmd.exe /c "cd /d C:\git\PlayMyLibrary && npm start"
   ```
3. Click "Next"
4. Name it "Jamber3 Music Library" and click "Finish"
5. Right-click the new shortcut and select "Properties"
6. In the "Shortcut" tab:
   - Change "Start in:" to: `C:\git\PlayMyLibrary`
   - Click "Change Icon..."
   - Click "Browse..." and navigate to `C:\git\PlayMyLibrary\assets\icon.ico`
   - Select the icon and click "OK"
7. Click "OK" to save

## Method 5: Add to Start Menu

To add Jamber3 to your Start Menu:
1. Create a desktop shortcut using Method 1 or 4 above
2. Copy the shortcut to: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\`
3. You can now find Jamber3 in your Start Menu and pin it to taskbar if desired

## Available Launcher Files

The project includes these ready-to-use launcher files:

- **`Create-Desktop-Shortcut.bat`** - Automatically creates a desktop shortcut with icon
- **`Jamber3-Silent.vbs`** - Silent launcher (no command window)  
- **`Jamber3.bat`** - Standard launcher (shows command window)
- **`assets\icon.ico`** - Application icon file

## Note
Make sure Node.js and npm are installed and available in your system PATH for these shortcuts to work.