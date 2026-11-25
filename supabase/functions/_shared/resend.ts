export interface EmailMessage { from: string; to: string; subject: string; html: string; text: string; replyTo?: string; attachments?: { filename: string; content: string }[] }

export async function sendEmail(apiKey: string, m: EmailMessage, fetchImpl: typeof fetch = fetch): Promise<{ id: string }> {
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, html: m.html, text: m.text, reply_to: m.replyTo, attachments: m.attachments }),
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string };
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
