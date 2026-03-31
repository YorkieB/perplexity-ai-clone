# Start Jarvis Backend Services
Write-Host "Starting Jarvis Backend Services..." -ForegroundColor Cyan

$projectDir = "C:\Users\conta\AI Chat\perplexity-ai-clone"

# Terminal 1: Python Screen Agent (Port 8765)
Write-Host "Starting Python Screen Agent..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectDir'; python python/screen_agent.py"

# Wait for Python to start
Start-Sleep -Seconds 3

# Terminal 2: Express Dev Server (Port 5000)
Write-Host "Starting Express Dev Server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectDir'; npm run dev"

Write-Host "`nServices started in new windows!" -ForegroundColor Green
Write-Host "Wait 10 seconds for them to fully start..." -ForegroundColor Yellow
Write-Host "Then refresh your Electron app (F5 or Ctrl+R)" -ForegroundColor Cyan
