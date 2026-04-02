#Requires -RunAsAdministrator
<#
  One-time: set active adapter DNS to Cloudflare (1.1.1.1) so Windows resolves
  tunnel hostnames to Cloudflare anycast (104/172), not fd10:: only — fixes
  browser/curl timeouts to https://jarvis.* without manual hosts entries.

  Right-click PowerShell > Run as administrator, then:
    cd "path\to\perplexity-ai-clone"
    .\scripts\set-windows-dns-cloudflare.ps1
#>
$ErrorActionPreference = 'Stop'
$up = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.PhysicalMediaType -ne 'Unknown' } | Select-Object -First 1
if (-not $up) { $up = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1 }
if (-not $up) { Write-Error 'No active network adapter found.' }
Set-DnsClientServerAddress -InterfaceAlias $up.Name -ServerAddresses @('1.1.1.1', '1.0.0.1')
Clear-DnsClientCache
Write-Host "Set DNS on '$($up.Name)' to 1.1.1.1 / 1.0.0.1 and cleared cache."
Write-Host "Test: https://jarvis.yorkiebrown.uk (with tunnel + npm run dev:tunnel running)."
