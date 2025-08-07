@echo off
echo Creating Jamber3 Desktop Shortcut...

set "SHORTCUT_NAME=Jamber3 Music Library"
set "TARGET_PATH=C:\Windows\System32\cmd.exe"
set "ARGUMENTS=/c ""cd /d C:\git\PlayMyLibrary && npm start"""
set "WORKING_DIR=C:\git\PlayMyLibrary"
set "ICON_PATH=C:\git\PlayMyLibrary\assets\icon.ico"
set "DESKTOP=%USERPROFILE%\Desktop"

:: Create PowerShell script to create the shortcut
echo $WshShell = New-Object -comObject WScript.Shell > temp_shortcut.ps1
echo $Shortcut = $WshShell.CreateShortcut("%DESKTOP%\%SHORTCUT_NAME%.lnk") >> temp_shortcut.ps1
echo $Shortcut.TargetPath = "%TARGET_PATH%" >> temp_shortcut.ps1
echo $Shortcut.Arguments = "%ARGUMENTS%" >> temp_shortcut.ps1
echo $Shortcut.WorkingDirectory = "%WORKING_DIR%" >> temp_shortcut.ps1
echo $Shortcut.IconLocation = "%ICON_PATH%" >> temp_shortcut.ps1
echo $Shortcut.Description = "Jamber3 Music Library Application" >> temp_shortcut.ps1
echo $Shortcut.Save() >> temp_shortcut.ps1

:: Execute the PowerShell script
powershell -ExecutionPolicy Bypass -File temp_shortcut.ps1

:: Clean up
del temp_shortcut.ps1

if exist "%DESKTOP%\%SHORTCUT_NAME%.lnk" (
    echo Success! Desktop shortcut created: %SHORTCUT_NAME%.lnk
    echo.
    echo The shortcut has been placed on your desktop with the Jamber3 icon.
    echo Double-click it to launch the Jamber3 Music Library application.
) else (
    echo Error: Failed to create desktop shortcut.
)

echo.
pause