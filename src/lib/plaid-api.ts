/**
 * Plaid API client for financial data.
 * All calls go through the server proxy to keep secrets server-side.
 */

export interface PlaidAccount {
  account_id: string
  name: string
  official_name: string | null
  type: string
  subtype: string | null
  mask: string | null
  balances: {
    available: number | null
    current: number | null
    limit: number | null
    iso_currency_code: string | null
  }
}

export interface PlaidTransaction {
  transaction_id: string
  account_id: string
  amount: number
  date: string
  name: string
  merchant_name: string | null
  category: string[] | null
  personal_finance_category: {
    primary: string
    detailed: string
    confidence_level: string
  } | null
  pending: boolean
  iso_currency_code: string | null
}

export interface SpendingSummary {
  period: string
  totalIncome: number
  totalExpenditure: number
  netFlow: number
  byCategory: Record<string, number>
  topMerchants: Array<{ name: string; total: number; count: number }>
  accountBalances: Array<{ name: string; available: number | null; current: number | null }>
}

export async function createLinkToken(): Promise<string> {
  const res = await fetch('/api/plaid/link-token', { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err.error?.message || `Plaid link token failed: ${res.status}`)
  }
  const data = await res.json() as { link_token: string }
  return data.link_token
}

export async function exchangePublicToken(publicToken: string): Promise<string> {
  const res = await fetch('/api/plaid/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_token: publicToken }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err.error?.message || `Token exchange failed: ${res.status}`)
  }
  const data = await res.json() as { access_token: string }
  return data.access_token
}

export async function getAccounts(): Promise<PlaidAccount[]> {
  const res = await fetch('/api/plaid/accounts', { method: 'POST' })
  if (!res.ok) throw new Error(`Get accounts failed: ${res.status}`)
  const data = await res.json() as { accounts: PlaidAccount[] }
  return data.accounts || []
}

export async function getBalances(): Promise<string> {
  const res = await fetch('/api/plaid/balances', { method: 'POST' })
  if (!res.ok) throw new Error(`Get balances failed: ${res.status}`)
  const data = await res.json() as { accounts: PlaidAccount[] }
  const accounts = data.accounts || []
  if (accounts.length === 0) return 'No accounts linked.'

  return accounts.map(a => {
    const currency = a.balances.iso_currency_code || 'GBP'
    const available = a.balances.available != null ? `${currency} ${a.balances.available.toFixed(2)}` : 'N/A'
    const current = a.balances.current != null ? `${currency} ${a.balances.current.toFixed(2)}` : 'N/A'
    const sub = a.subtype ? '/' + a.subtype : ''
    return `${a.name} (${a.type}${sub}, ****${a.mask || '??'}): Available: ${available}, Current: ${current}`
  }).join('\n')
}

export async function getTransactions(
  startDate?: string,
  endDate?: string,
): Promise<string> {
  const body: Record<string, string> = {}
  if (startDate) body.start_date = startDate
  if (endDate) body.end_date = endDate

  const res = await fetch('/api/plaid/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Get transactions failed: ${res.status}`)
  const data = await res.json() as { transactions: PlaidTransaction[] }
  const txns = data.transactions || []
  if (txns.length === 0) return 'No transactions found for the given period.'

  const lines = txns.slice(0, 50).map(t => {
    const cat = t.personal_finance_category?.primary || t.category?.[0] || 'Uncategorised'
    const sign = t.amount < 0 ? '+' : '-'
    const absAmt = Math.abs(t.amount).toFixed(2)
    return `${t.date} | ${sign}${t.iso_currency_code || 'GBP'} ${absAmt} | ${t.merchant_name || t.name} | ${cat}${t.pending ? ' (pending)' : ''}`
  })

  if (txns.length > 50) lines.push(`... and ${txns.length - 50} more transactions`)
  return lines.join('\n')
}

export async function getSpendingSummary(
  startDate?: string,
  endDate?: string,
): Promise<string> {
  const body: Record<string, string> = {}
  if (startDate) body.start_date = startDate
  if (endDate) body.end_date = endDate

  const res = await fetch('/api/plaid/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Get transactions failed: ${res.status}`)
  const txnData = await res.json() as { transactions: PlaidTransaction[] }
  const txns = txnData.transactions || []

  const balRes = await fetch('/api/plaid/balances', { method: 'POST' })
  const balData = await balRes.json() as { accounts: PlaidAccount[] }
  const accounts = balData.accounts || []

  let totalIncome = 0
  let totalExpenditure = 0
  const byCategory: Record<string, number> = {}
  const merchantMap = new Map<string, { total: number; count: number }>()

  for (const t of txns) {
    const cat = t.personal_finance_category?.primary || t.category?.[0] || 'OTHER'
    // Plaid uses negative amounts for income (credits), positive for expenses
    if (t.amount < 0) {
      totalIncome += Math.abs(t.amount)
    } else {
      totalExpenditure += t.amount
      byCategory[cat] = (byCategory[cat] || 0) + t.amount
    }
    const merchant = t.merchant_name || t.name
    const entry = merchantMap.get(merchant) || { total: 0, count: 0 }
    entry.total += Math.abs(t.amount)
    entry.count += 1
    merchantMap.set(merchant, entry)
  }

  const topMerchants = [...merchantMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([name, d]) => `  ${name}: £${d.total.toFixed(2)} (${d.count} transactions)`)

  const sortedCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => `  ${cat}: £${amt.toFixed(2)}`)

  const accountLines = accounts.map(a =>
    `  ${a.name}: Available £${a.balances.available?.toFixed(2) ?? 'N/A'}, Current £${a.balances.current?.toFixed(2) ?? 'N/A'}`
  )

  const period = `${startDate || '30 days ago'} to ${endDate || 'today'}`

  return [
    `=== Financial Summary (${period}) ===`,
    `Total Income: £${totalIncome.toFixed(2)}`,
    `Total Expenditure: £${totalExpenditure.toFixed(2)}`,
    `Net Flow: £${(totalIncome - totalExpenditure).toFixed(2)}`,
    '',
    'Spending by Category:',
    ...sortedCategories,
    '',
    'Top Merchants:',
    ...topMerchants,
    '',
    'Account Balances:',
    ...accountLines,
  ].join('\n')
}
