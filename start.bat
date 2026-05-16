@echo off
chcp 65001 >nul
title Aqlli ChatBot - AI Yordamchi

echo.
echo  ============================================
echo    AQLLI CHATBOT - AI Yordamchi
echo  ============================================
echo.

:: Python mavjudligini tekshirish
python --version >nul 2>&1
if errorlevel 1 (
    echo  [XATO] Python topilmadi!
    echo  Python o'rnatish: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: .env faylini tekshirish
if not exist ".env" (
    if exist ".env.example" (
        echo  [MA'LUMOT] .env fayl topilmadi, .env.example dan nusxa olinmoqda...
        copy ".env.example" ".env" >nul
        echo  [MA'LUMOT] .env fayl yaratildi. API kalitingizni kiriting.
    )
)

:: Kutubxonalarni o'rnatish
echo  [1/3] Kutubxonalar tekshirilmoqda...
pip install -r requirements.txt -q --disable-pip-version-check
if errorlevel 1 (
    echo  [XATO] Kutubxonalar o'rnatilmadi!
    pause
    exit /b 1
)

echo  [2/3] Dastur ishga tushirilmoqda...
echo.
echo  ============================================
echo    Brauzerda oching: http://localhost:5000
echo    To'xtatish uchun: Ctrl+C
echo  ============================================
echo.

:: Brauzerda avtomatik ochish (3 soniyadan keyin)
timeout /t 2 >nul
start "" "http://localhost:5000"

echo  [3/3] Server ishlamoqda...
echo.
python app.py

pause
