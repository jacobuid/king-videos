$ErrorActionPreference = 'Stop'
$dest = 'C:\Users\jacob\Downloads\KINGFLIX\downloads'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$files = Get-Content -Raw "$PSScriptRoot\archive-selected.json" | ConvertFrom-Json
$jobs = @()
foreach ($file in $files) {
    while (@($jobs | Where-Object State -eq 'Running').Count -ge 3) {
        Start-Sleep -Seconds 2
    }
    $jobs += Start-Job -ArgumentList $file,$dest -ScriptBlock {
        param($file,$dest)
        $ErrorActionPreference = 'Stop'
        $target = Join-Path $dest $file.name
        function ValidFile($path) {
            if (!(Test-Path -LiteralPath $path)) { return $false }
            if ((Get-Item -LiteralPath $path).Length -ne [long]$file.size) { return $false }
            return (Get-FileHash -LiteralPath $path -Algorithm MD5).Hash -eq $file.md5
        }
        if (ValidFile $target) { return "VERIFIED $($file.name)" }
        if (Test-Path -LiteralPath $target) { throw "Existing file differs: $target" }
        $partial = "$target.part"
        $url = 'https://archive.org/download/the-suite-life-of-zack-cody-s-01-e-09-band-in-boston/' + [uri]::EscapeDataString($file.name)
        & curl.exe --location --fail --silent --show-error --retry 8 --retry-delay 5 --connect-timeout 30 --speed-limit 1024 --speed-time 120 --continue-at - --output $partial $url
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $($file.name)" }
        if (!(ValidFile $partial)) { throw "Checksum failed: $($file.name)" }
        Move-Item -LiteralPath $partial -Destination $target
        "VERIFIED $($file.name)"
    }
}
$jobs | Wait-Job | Receive-Job *>&1 | Out-File "$PSScriptRoot\hannah-download.log"
$failed = @($jobs | Where-Object State -ne 'Completed')
"Finished. Jobs: $($jobs.Count); failures: $($failed.Count)" | Add-Content "$PSScriptRoot\hannah-download.log"
