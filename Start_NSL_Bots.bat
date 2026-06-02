@echo off
echo ==========================================
echo       KHOI DONG HE THONG BOT NSL
echo ==========================================
echo.

echo [1/2] Dang khoi dong Summary Master...
start "Summary Master Bot" cmd /k "cd /d ""D:\NSLClick\NSL Bot\summary_master"" && node index.js"

echo [2/2] Dang khoi dong Workflow Enforcer...
start "Workflow Enforcer Bot" cmd /k "cd /d ""D:\NSLClick\NSL Bot\workflow_enforcer"" && node index.js"

echo.
echo Hoan tat! Hai cua so Bot da duoc mo.
echo Luu y: Khong tat 2 cua so mau den do neu ban van muon Bot hoat dong.
echo.
pause
