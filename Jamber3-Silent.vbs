Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c ""cd /d C:\git\Jamber3 && npm start""", 0, False