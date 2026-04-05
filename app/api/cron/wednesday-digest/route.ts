import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const XANO = process.env.XANO_CRON_API;
const CRON_SECRET = process.env.CRON_SECRET;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Email-safe pastel card colours — mirrors Wall of Love palette
const CARD_STYLES = [
  { bg: '#FFFDE7', border: '#EF5350', label: '#7B5E00' },  // warm yellow
  { bg: '#F1F8E9', border: '#4CAF50', label: '#2E7D32' },  // mint green
  { bg: '#FCE4EC', border: '#E91E63', label: '#880E4F' },  // soft pink
  { bg: '#EDE7F6', border: '#7B1FA2', label: '#4527A0' },  // lilac
  { bg: '#E1F5FE', border: '#0288D1', label: '#01579B' },  // sky blue
];

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get('secret');
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const res = await fetch(`${XANO}/cron/weekly-data?cron_secret=${CRON_SECRET}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Xano error: ${res.status}`);
    const data = await res.json();
    const { practices, managers, events, feedback, clinicians = [], sentiment_events = [] } = data.result ?? data;

    // Diagnostic logging — remove once field names are confirmed
    console.log('[wednesday-digest] Xano response top-level keys:', JSON.stringify(Object.keys(data.result ?? data)));
    console.log(`[wednesday-digest] practices: ${practices?.length}, feedback: ${(feedback as any[])?.length}`);
    if ((feedback as any[])?.length > 0) {
      console.log('[wednesday-digest] feedback[0] keys:', JSON.stringify(Object.keys((feedback as any[])[0])));
      console.log('[wednesday-digest] feedback[0] sample:', JSON.stringify((feedback as any[])[0]).slice(0, 300));
    }
    if (practices?.length > 0) {
      console.log('[wednesday-digest] practice[0] id:', practices[0].id, 'typeof:', typeof practices[0].id);
    }

    const results = await Promise.allSettled(
      practices.map(async (practice: any) => {
        const manager = managers.find((m: any) => m.practices_id === practice.id);
        if (!manager?.email) return 'skipped';

        const practiceName = practice.practice_name ?? practice.name ?? 'Your Practice';

        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

        console.log(`[wednesday-digest] practice ${practice.id} sentiment_events sample:`,
          (sentiment_events as any[]).slice(0, 2).map((e: any) => ({ practices_id: e.practices_id, typeof: typeof e.practices_id }))
        );

        const sentiments = (sentiment_events as any[]).filter((e: any) =>
          String(e.practices_id) === String(practice.id) &&
          e.sentiment &&
          e.sentiment.trim().length >= 3 &&
          e.created_at > cutoff
        );
        console.log(`[wednesday-digest] practice ${practice.id} (${practiceName}): ${sentiments.length} sentiment events`);

        // Skip practices with zero sentiment events — no email sent
        if (sentiments.length === 0) return 'skipped';

        const shown = sentiments.slice(0, 5);
        const overflow = sentiments.length - shown.length;

        const cardsHtml = shown.map((e: any, i: number) => {
          const style = CARD_STYLES[i % CARD_STYLES.length];
          const clinicianName = e.clinician_name ?? 'Your Clinician';
          return `
            <div style="background:${style.bg};border-left:4px solid ${style.border};border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:14px;">
              <p style="margin:0 0 10px;font-style:italic;color:#2A2A2A;font-size:14px;line-height:1.7;font-family:Georgia,serif;">&ldquo;${e.sentiment.trim()}&rdquo;</p>
              <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${style.label};">About ${clinicianName}</p>
              <p style="margin:0;font-size:10px;color:rgba(0,0,0,0.38);font-style:italic;">— Patient</p>
            </div>`;
        }).join('');

        const overflowHtml = overflow > 0
          ? `<p style="margin:16px 0 0;font-size:13px;color:#768692;text-align:center;">...and <strong>${overflow} more response${overflow !== 1 ? 's' : ''}</strong> on your dashboard</p>`
          : '';

        const SCAN_TARGET = 25;
        const totalScans = (events as any[]).filter(
          (e: any) => e.practice_id === practice.id && e.event_type === 'qr_scan'
        ).length;
        const scanPct = Math.min(Math.round((totalScans / SCAN_TARGET) * 100), 100);
        const scanStatus = totalScans >= SCAN_TARGET
          ? '🎯 Great work! You hit your scan target this week.'
          : totalScans >= 13
          ? "📈 You're on track — keep it up!"
          : "⚠️ You're behind target — try to get more scans before the week is out.";
        const barColor = totalScans >= SCAN_TARGET ? '#2E7D32' : totalScans >= 13 ? '#005EB8' : '#E65C00';

        const scanProgressHtml = `
          <div style="margin-top:28px;padding-top:24px;border-top:1px solid #D8E0E8;">
            <h2 style="font-size:15px;color:#003d7a;margin:0 0 4px;">📊 Scan Progress This Week</h2>
            <p style="margin:0 0 14px;font-size:13px;color:#768692;">${totalScans} / ${SCAN_TARGET} scans this week</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;border-radius:6px;overflow:hidden;">
              <tr>
                <td width="${scanPct}%" style="background:${barColor};height:10px;font-size:0;">&nbsp;</td>
                <td style="background:#F0F4F9;height:10px;font-size:0;">&nbsp;</td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;color:#425563;font-weight:600;">${scanStatus}</p>
          </div>`;

        const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F0F4F9;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,94,184,0.08);">
    <div style="background:#003d7a;padding:28px 32px;">
      <p style="margin:0;font-family:Georgia,serif;font-size:22px;color:#ffffff;">Feed<span style="color:#00A9CE;">backer</span></p>
      <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1.5px;">NHS Patient Feedback</p>
    </div>
    <div style="padding:32px;">
      <h1 style="margin:0 0 6px;font-size:20px;color:#003d7a;">Good morning, ${manager.name} 👋</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#768692;">Here's what your patients said about your team this week</p>
      ${cardsHtml}
      ${overflowHtml}
      ${scanProgressHtml}
      <p style="margin:24px 0 0;font-size:13px;color:#768692;">Your patients appreciate you — keep up the great work. 💙</p>
    </div>
    <div style="padding:20px 32px;border-top:1px solid #D8E0E8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#a0b0c0;">Feedbacker · NHS Patient Feedback Platform · <a href="https://feedbacker-app-m3re.vercel.app" style="color:#005EB8;text-decoration:none;">feedbacker-app-m3re.vercel.app</a></p>
    </div>
  </div>
</body>
</html>`;

        console.log(`[wednesday-digest] Sending to ${practiceName} (${manager.email}) — ${sentiments.length} sentiment(s)`);
        const { error: sendError } = await resend.emails.send({
          from: 'Feedbacker <noreply@getfeedbacker.com>',
          to: manager.email,
          subject: `💌 Your weekly feedback digest — ${practiceName}`,
          html,
        });
        if (sendError) throw new Error(`Resend: ${sendError.message}`);
        return 'sent';
      })
    );

    const sent    = results.filter(r => r.status === 'fulfilled' && r.value === 'sent').length;
    const skipped = results.filter(r => r.status === 'fulfilled' && r.value === 'skipped').length;
    const failed  = results.filter(r => r.status === 'rejected').length;
    return NextResponse.json({ success: true, sent, skipped, failed });

  } catch (err) {
    console.error('[wednesday-digest]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
