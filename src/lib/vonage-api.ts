/**
 * Vonage SMS + Voice via server proxy — credentials stay server-side.
 */

export async function vonageSendSms(to: string, text: string): Promise<string> {
  const res = await fetch('/api/vonage/sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, text }),
  })
  const data = await res.json().catch(() => ({})) as { ok?: boolean; messageId?: string; error?: { message?: string } }
  if (!res.ok || !data.ok) {
    throw new Error(data.error?.message || `Vonage SMS failed: ${String(res.status)}`)
  }
  const suffix = data.messageId ? ` (message id: ${data.messageId})` : ''
  return `SMS sent successfully${suffix}.`
}

/**
 * Outbound voice call: Vonage plays the text using TTS (text-to-speech).
 * Requires VONAGE_APPLICATION_ID + private key (Voice app). Not a live AI conversation — the callee hears this script only.
 */
export async function vonageVoiceCall(
  to: string,
  text: string,
  language?: string,
): Promise<string> {
  const res = await fetch('/api/vonage/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, text, language: language || 'en-GB' }),
  })
  const data = await res.json().catch(() => ({})) as { ok?: boolean; callUuid?: string; error?: { message?: string } }
  if (!res.ok || !data.ok) {
    throw new Error(data.error?.message || `Vonage Voice failed: ${String(res.status)}`)
  }
  const id = data.callUuid ? ` (call id: ${data.callUuid})` : ''
  return `Outbound call started — the person will hear your message spoken${id}.`
}

/**
 * Live two-way AI phone call: Vonage streams audio to your WebSocket bridge (STT → LLM → TTS).
 * Requires Voice app credentials, bridge running, and VONAGE_PUBLIC_WS_URL (e.g. ngrok → local bridge).
 */
export async function vonageAiVoiceCall(to: string): Promise<string> {
  const res = await fetch('/api/vonage/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, mode: 'ai_voice' }),
  })
  const data = await res.json().catch(() => ({})) as { ok?: boolean; callUuid?: string; error?: { message?: string } }
  if (!res.ok || !data.ok) {
    throw new Error(data.error?.message || `Vonage AI Voice failed: ${String(res.status)}`)
  }
  const id = data.callUuid ? ` (call id: ${data.callUuid})` : ''
  return `AI voice call started — audio is routed through the WebSocket bridge${id}.`
}
