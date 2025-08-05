Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\git\SetList"
WshShell.Run "npm start", 0, False