param(
  [Parameter(Mandatory=$true)][string]$InputFolder,
  [Parameter(Mandatory=$true)][string]$OutputFolder,
  [ValidateSet('mono','stereo','dpl1','dpl2','5point1','7point1')][string]$Mixdown = 'stereo'
)

$ErrorActionPreference = 'Stop'
$handBrake = (Get-Command HandBrakeCLI.exe -ErrorAction SilentlyContinue).Source
if (-not $handBrake) {
  $handBrake = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter HandBrakeCLI.exe -File |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $handBrake) { throw 'HandBrakeCLI is not installed.' }

New-Item -ItemType Directory -Path $OutputFolder -Force | Out-Null
$videoExtensions = @('.mp4', '.m4v', '.mkv', '.avi')
$videos = Get-ChildItem -LiteralPath $InputFolder -File |
  Where-Object { $_.Extension.ToLowerInvariant() -in $videoExtensions } |
  Where-Object { $_.Name -notmatch '\(1\)|\(AUSLAN\)' } |
  Sort-Object Name

$index = 0
foreach ($video in $videos) {
  $index++
  $output = Join-Path $OutputFolder "$($video.BaseName).mp4"
  $temporary = "$output.partial.mp4"
  if ((Test-Path -LiteralPath $output) -and (Get-Item -LiteralPath $output).Length -gt 0) {
    Write-Host "[$index/$($videos.Count)] Skipping completed: $($video.Name)"
    continue
  }
  Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
  Write-Host "[$index/$($videos.Count)] Compressing: $($video.Name)"
  & $handBrake -i $video.FullName -o $temporary -f av_mp4 -e x264 -q 23 --encoder-preset slow --optimize -a 1 -E av_aac -B 96 --mixdown $Mixdown
  if ($LASTEXITCODE -ne 0) { throw "HandBrake failed for $($video.Name)" }
  Move-Item -LiteralPath $temporary -Destination $output
}

Get-ChildItem -LiteralPath $InputFolder -File |
  Where-Object { $_.Extension.ToLowerInvariant() -notin $videoExtensions } |
  Copy-Item -Destination $OutputFolder -Force
Write-Host "Compressed $($videos.Count) videos into $OutputFolder"
