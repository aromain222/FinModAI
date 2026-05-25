import { NextResponse } from 'next/server';
import { notifyTest } from '@/lib/pm/notifications/notifier';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
  const configured = Boolean(process.env.DISCORD_WEBHOOK_URL);
  if (!configured) {
    return NextResponse.json(
      { error: 'DISCORD_WEBHOOK_URL is not set in environment variables.' },
      { status: 400 },
    );
  }
  await notifyTest();
  return NextResponse.json({ ok: true, message: 'Test notification sent to Discord.' });
}
