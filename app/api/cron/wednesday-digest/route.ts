import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const XANO = process.env.XANO_CRON_API;
const CRON_SECRET = process.env.CRON_SECRET;

const WEEKLY_SCAN_QUOTA = 25;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const { practices, managers, events, feedback } = data.result ?? data;

    const results = await Promise.allSettled(
      practices.map(async (practice: any) => {
        const manager = managers.find((m: any) => m.practices_id === practice.id);
        if (!manager?.email) return;

        const totalScans = events.filter(
          (e: any) => e.practice_id === practice.id && e.event_type === 'qr_scan'
        ).length;

        const belowQuota = totalScans < WEEKLY_SCAN_QUOTA;
        const remaining = WEEKLY_SCAN_QUOTA - totalScans;

        const practiceFeedback = (feedback as any[])
          .filter((f: any) =>
            f.practice_id === practice.id &&
            f.sentiment &&
            f.sentiment.trim().length >= 20
          )
          .slice(0, 3);

        const feedbackHtml = practiceFeedback.length > 0
          ? practiceFeedback.map((f: any) => `
              <div style="background:#F0F4F9;border-left:3px solid #00A9CE;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:12px;">
                <p style="margin:0 0 8px;font-style:italic;color:#425563;font-size:14px;line-height:1.6;">&ldquo;${f.sentiment.trim()}&rdquo;</p>
                <p style="margin:0;font-size:11px;color:#768692;text-transform:uppercase;letter-spacing:0.8px;">About ${f.clinician_name ?? 'your clinician'}</p>
              </div>`).join('')
          : `<p style="color:#768692;font-style:italic;font-size:14px;">No new feedback this week yet — keep sharing those QR codes!</p>`;

        const quotaHtml = belowQuota
          ? `<div style="background:#FFF3E0;border:1px solid #FFB74D;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
               <p style="margin:0 0 4px;font-weight:700;color:#E65C00;font-size:14px;">⚠️ Scan quota reminder</p>
               <p style="margin:0;font-size:13px;color:#425563;">You're at <strong>${totalScans} / ${WEEKLY_SCAN_QUOTA} scans</strong> this week. ${remaining} more scan${remaining !== 1 ? 's' : ''} to hit your weekly target — make sure your QR codes are visible in the practice!</p>
             </div>`
          : `<div style="background:#E8F5E9;border:1px solid #81C784;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
               <p style="margin:0 0 4px;font-weight:700;color:#2E7D32;font-size:14px;">✅ Weekly target hit!</p>
               <p style="margin:0;font-size:13px;color:#425563;">You've hit <strong>${totalScans} scans</strong> this week — above your ${WEEKLY_SCAN_QUOTA} scan target. Great work!</p>
             </div>`;

        const practiceName = practice.practice_name ?? practice.name ?? 'Your Practice';

        const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F0F4F9;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,94,184,0.08);">
    <div style="background:#003d7a;padding:28px 32px;">
      <p style="margin:0;font-family:Georgia,serif;font-size:22px;color:#ffffff;">Feed<span style="color:#00A9CE;">backer</span></p>
      <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1.5px;">NHS Patient Feedback</p>
    </div>
    <div style="padding:32px;">
      <h1 style="margin:0 0 6px;font-size:20px;color:#003d7a;">Mid-week digest 💌</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#768692;">Here's what's happening at <strong>${practiceName}</strong></p>
      ${quotaHtml}
      <h2 style="font-size:15px;color:#003d7a;margin:0 0 12px;">❤️ Recent patient feedback</h2>
      ${feedbackHtml}
      <p style="margin:24px 0 0;font-size:13px;color:#768692;">Keep up the great work — your patients appreciate you.</p>
    </div>
    <div style="padding:20px 32px;border-top:1px solid #D8E0E8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#a0b0c0;">Feedbacker · NHS Patient Feedback Platform · <a href="https://feedbacker-app-m3re.vercel.app" style="color:#005EB8;text-decoration:none;">feedbacker-app-m3re.vercel.app</a></p>
    </div>
  </div>
</body>
</html>`;

        const { error: sendError } = await resend.emails.send({
          from: 'Feedbacker <noreply@getfeedbacker.com>',
          to: manager.email,
          subject: `💌 Your mid-week digest — ${practiceName}`,
          html,
        });
        if (sendError) throw new Error(`Resend: ${sendError.message}`);
      })
    );

    const failed = results.filter(r => r.status === 'rejected').length;
    return NextResponse.json({ success: true, sent: practices.length - failed, failed });

  } catch (err) {
    console.error('[wednesday-digest]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
