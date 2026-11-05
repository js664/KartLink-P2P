param([string]$Executable = (Join-Path $env:LOCALAPPDATA 'Programs\KartLink P2P\KartLink P2P.exe'))
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $Executable -PathType Leaf)) { throw 'KartLink executable not found. Provide its path with -Executable.' }
$existing = Get-CimInstance Win32_Process -Filter "Name='KartLink P2P.exe'" | Where-Object { $_.ExecutablePath -eq $Executable }
if ($existing) { throw 'Close KartLink and stop your room before running this measurement, so it measures a fresh launch.' }
$watch = [Diagnostics.Stopwatch]::StartNew()
$process = Start-Process -FilePath $Executable -PassThru
$deadline = $watch.ElapsedMilliseconds + 60000
while ($watch.ElapsedMilliseconds -lt $deadline) {
  Start-Sleep -Milliseconds 50
  $process.Refresh()
  if ($process.HasExited) { throw 'KartLink exited before its window appeared.' }
  if ($process.MainWindowHandle -ne 0) { break }
}
$elapsed=$watch.ElapsedMilliseconds
if ($process.MainWindowHandle -eq 0) { throw 'No KartLink window appeared within 60 seconds.' }
$version=(Get-Item -LiteralPath $Executable).VersionInfo.FileVersion
$output=Join-Path ([Environment]::GetFolderPath('Desktop')) ("KartLink-startup-{0}.txt" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
@("KartLink version: $version", "Time until window: $elapsed ms", 'The running app was left open. This measurement contains no Playit credentials or room data.') | Set-Content -LiteralPath $output -Encoding utf8
Write-Host "KartLink window appeared after $elapsed ms. Result saved to $output"
