Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c ""cd /d C:\git\PlayMyLibrary && npm start""", 0, False