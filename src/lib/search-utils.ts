const MULTI_LEVEL_PUBLIC_SUFFIXES = new Set([
  'ac.uk',
  'co.in',
  'co.jp',
  'co.kr',
  'co.nz',
  'co.uk',
  'co.za',
  'com.ar',
  'com.au',
  'com.br',
  'com.cn',
  'com.hk',
  'com.mx',
  'com.pl',
  'com.sg',
  'com.tr',
  'com.tw',
  'com.ua',
  'gov.uk',
  'net.au',
  'org.au',
  'org.uk',
])

function isIpLike(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    hostname.includes(':')
  )
}

export function getRegistrableDomain(url: string): string {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')

    if (!hostname || isIpLike(hostname)) {
      return hostname || url
    }

    const labels = hostname.split('.')
    if (labels.length <= 2) {
      return hostname.replace(/^www\./, '')
    }

    const lastTwo = labels.slice(-2).join('.')
    const lastThree = labels.slice(-3).join('.')
    const registrable = MULTI_LEVEL_PUBLIC_SUFFIXES.has(lastTwo)
      ? lastThree
      : lastTwo

    return registrable.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function normalizeSourceUrl(url: string): string {
  try {
    const parsed = new URL(url)

    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
    const port = parsed.port ? `:${parsed.port}` : ''

    // Trailing slash policy:
    // - strip all trailing slashes for non-root paths
    // - normalize the root path to no trailing slash
    const normalizedPath = parsed.pathname === '/'
      ? ''
      : parsed.pathname.replace(/\/+$/, '')

    return `${parsed.protocol}//${hostname}${port}${normalizedPath}${parsed.search}`
  } catch {
    return url.trim()
  }
}
