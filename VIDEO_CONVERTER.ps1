# VIDEO_CONVERTER.ps1
# Сжимает большое видео и режет его на MP4-части, которые можно загрузить в Supabase Free.
# Каждая часть рассчитана примерно на 40-49 МБ при длительности около 5 минут.

$ErrorActionPreference = "Stop"

function Write-Info($text) { Write-Host $text -ForegroundColor Cyan }
function Write-Ok($text) { Write-Host $text -ForegroundColor Green }
function Write-Warn($text) { Write-Host $text -ForegroundColor Yellow }
function Write-Bad($text) { Write-Host $text -ForegroundColor Red }

$inputPath = $args[0]
if (-not $inputPath) {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = "Выберите большое видео"
  $dialog.Filter = "Видео|*.mp4;*.mov;*.mkv;*.avi;*.webm|Все файлы|*.*"
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit }
  $inputPath = $dialog.FileName
}

if (-not (Test-Path $inputPath)) {
  Write-Bad "Файл не найден: $inputPath"
  exit 1
}

$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
$ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
if (-not $ffmpeg -or -not $ffprobe) {
  Write-Warn "FFmpeg не найден. Он нужен для сжатия и нарезки видео."
  Write-Host "Установи FFmpeg через winget: winget install Gyan.FFmpeg"
  Write-Host "Потом закрой PowerShell/командную строку и запусти VIDEO_CONVERTER.bat заново."
  exit 1
}

$source = Get-Item $inputPath
$base = [System.IO.Path]::GetFileNameWithoutExtension($source.Name)
$outDir = Join-Path $source.DirectoryName ($base + "_parts_for_site")
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Info "Исходное видео: $($source.FullName)"
Write-Info "Папка результата: $outDir"
Write-Info "Начинаю сжатие и нарезку на части..."

# 5 минут на часть. При bitrate ниже части обычно проходят лимит Supabase Free 50 МБ.
$segmentSeconds = 300
$outPattern = Join-Path $outDir ($base + "_part_%03d.mp4")

& ffmpeg -hide_banner -y -i "$($source.FullName)" `
  -vf "scale='min(1280,iw)':-2" `
  -c:v libx264 -preset veryfast -crf 27 -maxrate 1100k -bufsize 2200k `
  -c:a aac -b:a 96k -ar 44100 `
  -movflags +faststart `
  -f segment -segment_time $segmentSeconds -reset_timestamps 1 `
  "$outPattern"

$parts = Get-ChildItem $outDir -Filter "*.mp4" | Sort-Object Name
if (-not $parts -or $parts.Count -eq 0) {
  Write-Bad "Части не создались. Проверь файл видео."
  exit 1
}

Write-Ok "Готово. Создано частей: $($parts.Count)"
Write-Host ""
foreach($p in $parts){
  $mb = [math]::Round($p.Length / 1MB, 2)
  if ($p.Length -gt 50MB) {
    Write-Warn "$($p.Name) — $mb МБ. Если Supabase не примет, уменьши качество: в VIDEO_CONVERTER.ps1 поставь -maxrate 800k и запусти снова."
  } else {
    Write-Ok "$($p.Name) — $mb МБ"
  }
}

Write-Host ""
Write-Info "Что дальше:"
Write-Host "1. Открой админку сайта."
Write-Host "2. Открой нужный урок → Редактировать."
Write-Host "3. В блоке видео выбери все созданные части MP4 сразу."
Write-Host "4. Нажми 'Загрузить выбранные видео'."
Write-Host "5. Нажми 'Сохранить урок'."
Write-Host ""
Write-Ok "Ученик увидит все части в этом же уроке."
explorer.exe $outDir
