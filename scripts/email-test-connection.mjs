/**
 * Verify EMAIL_1 and (if set) EMAIL_2 IMAP + SMTP from root .env (does not print passwords).
 * Usage: node scripts/email-test-connection.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const envPath = path.join(root, '.env')

function loadDotEnv() {
  let raw = ''
  try {
    raw = fs.readFileSync(envPath, 'utf8')
  } catch {
    console.error('No .env file at project root.')
    process.exit(1)
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

loadDotEnv()

const imapHost = (process.env.EMAIL_IMAP_HOST || 'mail.livemail.co.uk').trim()
const imapPort = Number.parseInt(process.env.EMAIL_IMAP_PORT || '993', 10)
const smtpHost = (process.env.EMAIL_SMTP_HOST || 'smtp.livemail.co.uk').trim()
const smtpPort = Number.parseInt(process.env.EMAIL_SMTP_PORT || '465', 10)

/**
 * @param {string} label
 * @param {string} emailAddr
 * @param {string} emailPass
 */
async function testAccount(label, emailAddr, emailPass) {
  console.log(`\n── ${label} ──`)
  console.log(`Testing IMAP ${imapHost}:${String(imapPort)} as ${emailAddr} …`)

  const imapClient = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: true,
    auth: { user: emailAddr, pass: emailPass },
    logger: false,
  })

  try {
    await imapClient.connect()
    const lock = await imapClient.getMailboxLock('INBOX')
    try {
      const st = imapClient.mailbox
      console.log(`OK: IMAP connected. INBOX messages: ${String(st?.exists ?? '?')}`)
    } finally {
      lock.release()
    }
    await imapClient.logout()
  } catch (e) {
    console.error('FAIL: IMAP —', e instanceof Error ? e.message : String(e))
    process.exit(1)
  }

  console.log(`Testing SMTP ${smtpHost}:${String(smtpPort)} (verify only) …`)

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: true,
    auth: { user: emailAddr, pass: emailPass },
  })

  try {
    await transporter.verify()
    console.log('OK: SMTP verify succeeded.')
  } catch (e) {
    console.error('FAIL: SMTP —', e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}

const addr1 = (process.env.EMAIL_1_ADDRESS || '').trim()
const pass1 = (process.env.EMAIL_1_PASSWORD || '').trim()
if (!addr1 || !pass1) {
  console.error('FAIL: EMAIL_1_ADDRESS and EMAIL_1_PASSWORD must be set in .env')
  process.exit(1)
}

await testAccount('EMAIL_1', addr1, pass1)

const addr2 = (process.env.EMAIL_2_ADDRESS || '').trim()
const pass2 = (process.env.EMAIL_2_PASSWORD || '').trim()
if (addr2 && pass2) {
  await testAccount('EMAIL_2', addr2, pass2)
} else if (addr2 || pass2) {
  console.error('\nFAIL: EMAIL_2 is incomplete — set both EMAIL_2_ADDRESS and EMAIL_2_PASSWORD, or leave both empty.')
  process.exit(1)
} else {
  console.log('\n── EMAIL_2 ──')
  console.log('Skip: EMAIL_2_ADDRESS / EMAIL_2_PASSWORD not set.')
}

console.log('\nAll configured email checks passed.')
