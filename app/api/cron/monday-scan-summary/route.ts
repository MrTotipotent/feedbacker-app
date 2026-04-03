import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const XANO = process.env.XANO_CRON_API;
const CRON_SECRET = process.env.CRON_SECRET;

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
    const { practices, managers, events } = data;

    const results = await Promise.allSettled(
      practices.map(async (practice: any) => {
        const manager = managers.find((m: any) => m.practices_id === practice.id);
        if (!manager?.email) return;

        const practiceEvents = events.filter(
          (e: any) => e.practice_id === practice.id && e.event_type === 'qr_scan'
        );
        const totalScans = practiceEvents.length;

        const scansByClinician: Record<string, { name: string; count: number }> = {};
        for (const event of practiceEvents) {
          if (!event.clinician_id) continue;
          if (!scansByClinician[event.clinician_id]) {
            scansByClinician[event.clinician_id] = { name: event.clinician_name ?? event.clinician_id, count: 0 };
          }
          scansByClinician[event.clinician_id].count += 1;
        }
        const top3 = Object.values(scansByClinician)
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        const top3Html = top3.length > 0
          ? top3.map((c, i) => `
              <tr>
                <td style="padding:10px 16px;font-weight:600;color:#003d7a;">${i + 1}.</td>
                <td style="padding:10px 16px;color:#425563;">${c.name}</td>
                <td style="padding:10px 16px;font-weight:700;color:#005EB8;">${c.count} scans</td>
              </tr>`).join('')
          : `<tr><td colspan="3" style="padding:10px 16px;color:#768692;font-style:italic;">No scan data yet this week</td></tr>`;

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
      <h1 style="margin:0 0 6px;font-size:20px;color:#003d7a;">Good morning, ${manager.name} 👋</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#768692;">Here's your weekly scan summary for <strong>${practiceName}</strong></p>
      <div style="background:#F0F4F9;border-radius:10px;padding:20px 24px;margin-bottom:24px;text-align:center;">
        <p style="margin:0 0 4px;font-size:13px;color:#768692;text-transform:uppercase;letter-spacing:1px;">Total QR Scans — Past 7 Days</p>
        <p style="margin:0;font-size:48px;font-weight:700;color:#005EB8;">${totalScans}</p>
      </div>
      <h2 style="font-size:15px;color:#003d7a;margin:0 0 12px;">🏆 Top Performers This Week</h2>
      <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #D8E0E8;">
        <thead>
          <tr style="background:#F0F4F9;">
            <th style="padding:10px 16px;text-align:left;font-size:11px;color:#768692;text-transform:uppercase;letter-spacing:1px;">#</th>
            <th style="padding:10px 16px;text-align:left;font-size:11px;color:#768692;text-transform:uppercase;letter-spacing:1px;">Clinician</th>
            <th style="padding:10px 16px;text-align:left;font-size:11px;color:#768692;text-transform:uppercase;letter-spacing:1px;">Scans</th>
          </tr>
        </thead>
        <tbody>${top3Html}</tbody>
      </table>
      <p style="margin:24px 0 0;font-size:13px;color:#768692;">Have a great week — let's get those numbers up! 💪</p>
    </div>
    <div style="padding:20px 32px;border-top:1px solid #D8E0E8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#a0b0c0;">Feedbacker · NHS Patient Feedback Platform · <a href="https://feedbacker-app-m3re.vercel.app" style="color:#005EB8;text-decoration:none;">feedbacker-app-m3re.vercel.app</a></p>
    </div>
  </div>
</body>
</html>`;

        await resend.emails.send({
          from: 'Feedbacker <noreply@feedbacker.co.uk>',
          to: manager.email,
          subject: `📊 Your weekly scan summary — ${practiceName}`,
          html,
        });
      })
    );

    const failed = results.filter(r => r.status === 'rejected').length;
    return NextResponse.json({ success: true, sent: practices.length - failed, failed });

  } catch (err) {
    console.error('[monday-scan-summary]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
