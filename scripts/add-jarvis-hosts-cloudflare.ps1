#Requires -RunAsAdministrator
<#
  Pins jarvis/voice to Cloudflare anycast IPv4 so Windows stops using fd10:: only
  (fixes curl/Edge timeouts while system resolver returns tunnel ULA).

  IPs may change; re-fetch from: Resolve-DnsName jarvis.yorkiebrown.uk -Server 1.1.1.1 -Type A

  Run elevated:
    cd "c:\Users\conta\Per AI\perplexity-ai-clone"
    .\scripts\add-jarvis-hosts-cloudflare.ps1
#>
$ErrorActionPreference = 'Stop'
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$marker = '# perplexity-jarvis-tunnel'
$ipv4 = (Resolve-DnsName jarvis.yorkiebrown.uk -Server 1.1.1.1 -Type A -DnsOnly | Where-Object { $_.Type -eq 'A' } | Select-Object -First 1).IPAddress
if (-not $ipv4) { $ipv4 = '104.21.30.91'; Write-Warning "Using fallback IP $ipv4" }
$block = @"

$marker
$ipv4 jarvis.yorkiebrown.uk
$ipv4 voice.yorkiebrown.uk
"@
$raw = Get-Content $hostsPath -Raw
if ($raw -match [regex]::Escape($marker)) {
  Write-Host 'Jarvis/voice block already in hosts - remove old block manually if IPs changed.'
  exit 0
}
Add-Content -Path $hostsPath -Value $block -Encoding ascii
Clear-DnsClientCache
Write-Host "Appended to hosts using $ipv4 - flushed DNS. Test: curl https://jarvis.yorkiebrown.uk/"
