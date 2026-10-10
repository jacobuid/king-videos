param([string]$Batch = 'oct10-family')
$ErrorActionPreference = 'Stop'
if ($Batch -notmatch '^[a-z0-9-]+$') { throw 'Invalid batch name' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FamilyUploadPower {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint flags);
}
'@

# Prevent idle system sleep while this batch runs; allow the display to sleep.
try {
    $powerResult = [FamilyUploadPower]::SetThreadExecutionState([uint32]2147483649)
    if ($powerResult -eq 0) { throw 'Could not request upload power hold' }
    while ($true) {
        $supervisorPid = [int](Get-Content -LiteralPath "logs/$Batch-supervisor.pid")
        if (-not (Get-Process -Id $supervisorPid -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Seconds 30
    }
} finally {
    [void][FamilyUploadPower]::SetThreadExecutionState([uint32]2147483648)
}
