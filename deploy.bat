@echo off
echo 正在部署Queue System...

REM 创建目录
if not exist "C:\QueueSystem" mkdir "C:\QueueSystem"
if not exist "C:\QueueSystem\data" mkdir "C:\QueueSystem\data"

REM 复制应用文件
copy dist\queue-system.exe "C:\QueueSystem\"

REM 创建桌面快捷方式
echo 创建桌面快捷方式...
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%userprofile%\Desktop\取号机.lnk'); $s.TargetPath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'; $s.Arguments = '--kiosk http://localhost/ticket'; $s.Save()"
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%userprofile%\Desktop\显示屏.lnk'); $s.TargetPath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'; $s.Arguments = '--kiosk http://localhost/display'; $s.Save()"
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%userprofile%\Desktop\叫号机.lnk'); $s.TargetPath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'; $s.Arguments = '--app=http://localhost/counter'; $s.Save()"

echo 部署完成!
