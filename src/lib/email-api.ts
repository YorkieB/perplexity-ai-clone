/**
 * Email API client — Fasthost IMAP/SMTP via server proxy.
 * All calls go through /api/email/* to keep credentials server-side.
 */

export interface EmailMessage {
  uid: number
  messageId: string
  from: string
  to: string
  subject: string
  date: string
  snippet: string
  seen: boolean
  hasAttachments: boolean
}

export interface EmailFull extends EmailMessage {
  body: string
  cc?: string
  replyTo?: string
}

export interface EmailFolder {
  name: string
  path: string
  messageCount: number
  unseen: number
}

export interface EmailSearchResult {
  account: string
  results: EmailMessage[]
  total: number
}

async function emailFetch<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/email/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err.error?.message || `Email API error: ${String(res.status)}`)
  }
  return res.json() as Promise<T>
}

export async function emailListInbox(
  account?: string,
  folder?: string,
  limit?: number,
): Promise<string> {
  const data = await emailFetch<{ messages: EmailMessage[] }>('inbox', { account, folder, limit })
  const msgs = data.messages ?? []
  if (msgs.length === 0) return 'No emails found.'
  return msgs.map((m) => {
    const read = m.seen ? '' : ' [UNREAD]'
    const attach = m.hasAttachments ? ' [ATTACHMENTS]' : ''
    return `#${String(m.uid)} | ${m.date} | From: ${m.from} | ${m.subject}${read}${attach}\n  ${m.snippet}`
  }).join('\n\n')
}

export async function emailReadMessage(
  account: string,
  uid: number,
): Promise<string> {
  const data = await emailFetch<{ message: EmailFull }>('read', { account, uid })
  const m = data.message
  if (!m) return 'Message not found.'
  const cc = m.cc ? `\nCC: ${m.cc}` : ''
  const replyTo = m.replyTo ? `\nReply-To: ${m.replyTo}` : ''
  return `From: ${m.from}\nTo: ${m.to}${cc}${replyTo}\nDate: ${m.date}\nSubject: ${m.subject}\n${'─'.repeat(40)}\n${m.body}`
}

export async function emailSend(
  account: string,
  to: string,
  subject: string,
  body: string,
  replyToMessageId?: string,
): Promise<string> {
  const data = await emailFetch<{ ok: boolean; messageId?: string }>('send', {
    account, to, subject, body, replyToMessageId,
  })
  return data.ok ? `Email sent successfully (ID: ${data.messageId ?? 'unknown'}).` : 'Failed to send email.'
}

export async function emailSearch(
  account: string,
  query: string,
  folder?: string,
  limit?: number,
): Promise<string> {
  const data = await emailFetch<{ messages: EmailMessage[] }>('search', { account, query, folder, limit })
  const msgs = data.messages ?? []
  if (msgs.length === 0) return `No emails matching "${query}".`
  return `Found ${String(msgs.length)} result(s):\n\n` + msgs.map((m) => {
    const read = m.seen ? '' : ' [UNREAD]'
    return `#${String(m.uid)} | ${m.date} | From: ${m.from} | ${m.subject}${read}\n  ${m.snippet}`
  }).join('\n\n')
}

export async function emailListFolders(account?: string): Promise<string> {
  const data = await emailFetch<{ folders: EmailFolder[] }>('folders', { account })
  const folders = data.folders ?? []
  if (folders.length === 0) return 'No folders found.'
  return folders.map((f) =>
    `${f.path} — ${String(f.messageCount)} messages (${String(f.unseen)} unread)`
  ).join('\n')
}

export async function emailMove(
  account: string,
  uid: number,
  targetFolder: string,
): Promise<string> {
  const data = await emailFetch<{ ok: boolean }>('move', { account, uid, targetFolder })
  return data.ok ? `Email moved to ${targetFolder}.` : 'Failed to move email.'
}

export async function emailDelete(
  account: string,
  uid: number,
): Promise<string> {
  const data = await emailFetch<{ ok: boolean }>('delete', { account, uid })
  return data.ok ? 'Email deleted.' : 'Failed to delete email.'
}

export async function emailMarkRead(
  account: string,
  uid: number,
  read: boolean,
): Promise<string> {
  const data = await emailFetch<{ ok: boolean }>('mark-read', { account, uid, read })
  if (!data.ok) return 'Failed to update email.'
  const label = read ? 'read' : 'unread'
  return `Email marked as ${label}.`
}
