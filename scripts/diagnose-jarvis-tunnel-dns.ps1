#Requires -Version 5.1
<#
  Diagnoses why https://jarvis.* may time out: external DNS must not resolve
  tunnel hostnames only to cfargotunnel AAAA (fd10::) without Cloudflare edge A/AAAA.

  Run: pwsh -File scripts/diagnose-jarvis-tunnel-dns.ps1
#>
$ErrorActionPreference = 'Continue'
$domain = 'yorkiebrown.uk'
$hostn = 'jarvis.yorkiebrown.uk'

Write-Host '=== NS (authoritative) ===' -ForegroundColor Cyan
$ns = Resolve-DnsName $domain -Type NS -Server 1.1.1.1 -DnsOnly -ErrorAction SilentlyContinue
if (-not $ns) { Write-Host 'Could not resolve NS.' -ForegroundColor Red; exit 1 }
$ns | ForEach-Object { Write-Host ('  ' + $_.NameHost) }
$cfNs = ($ns | Where-Object { $_.NameHost -match 'cloudflare\.com$' }).Count -gt 0
if (-not $cfNs) {
  Write-Host ''
  Write-Host 'PROBLEM: Domain is NOT delegated to Cloudflare nameservers.' -ForegroundColor Red
  Write-Host 'Tunnel CNAMEs at another DNS host resolve to fd10:: only (no public IPv4).' -ForegroundColor Yellow
  Write-Host 'Browsers/curl then try fd10::443 and time out.' -ForegroundColor Yellow
  Write-Host ''
  Write-Host 'FIX: At your registrar (Fasthosts), set nameservers ONLY to the pair shown in' -ForegroundColor Green
  Write-Host '  Cloudflare > yorkiebrown.uk > Overview > Cloudflare Nameservers' -ForegroundColor Green
  Write-Host '  (e.g. amber.ns.cloudflare.com and eric.ns.cloudflare.com — use YOUR pair).' -ForegroundColor Green
  Write-Host 'Wait for propagation, then jarvis should get Cloudflare anycast A/AAAA.' -ForegroundColor Green
  Write-Host ''
}

Write-Host '=== DoH: jarvis A/AAAA (public) ===' -ForegroundColor Cyan
try {
  $doh = Invoke-RestMethod "https://cloudflare-dns.com/dns-query?name=$hostn&type=A" -Headers @{ Accept = 'application/dns-json' }
  if ($doh.Answer) { $doh.Answer | ForEach-Object { Write-Host ('  A ' + $_.data) } } else { Write-Host '  (no A record at apex of chain)' }
  $doh2 = Invoke-RestMethod "https://cloudflare-dns.com/dns-query?name=$hostn&type=AAAA" -Headers @{ Accept = 'application/dns-json' }
  if ($doh2.Answer) { $doh2.Answer | ForEach-Object { Write-Host ('  AAAA ' + $_.data) } } else { Write-Host '  (no AAAA on name)' }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host '=== Local origin (must be up) ===' -ForegroundColor Cyan
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 3
  Write-Host ('  http://127.0.0.1:5173 -> ' + $r.StatusCode) -ForegroundColor Green
} catch {
  Write-Host '  http://127.0.0.1:5173 not reachable — run: npm run dev:tunnel' -ForegroundColor Red
}

if (-not $cfNs) { exit 1 }
exit 0
