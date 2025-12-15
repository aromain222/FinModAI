/**
 * Settings API
 * 
 * GET: Fetch user settings
 * POST: Save user settings
 */

import { NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/settings/store';
import { AppSettingsSchema } from '@/lib/settings/schema';

export const runtime = 'nodejs';

export async function GET() {
  try {
    // TODO: Extract userId from auth
    const userId = undefined;
    const settings = await getSettings(userId);
    return NextResponse.json(settings);
  } catch (error: any) {
    console.error('[settings] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Validate settings
    const validated = AppSettingsSchema.parse(body);
    
    // TODO: Extract userId from auth
    const userId = undefined;
    await saveSettings(userId, validated);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[settings] POST error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid settings data', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to save settings' },
      { status: 500 }
    );
  }
}
