import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('scenarios')
    .select('id, name, type, ticker, created_at, assumptions')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    console.error('scenarios list error', error);
    return NextResponse.json({ error: 'Failed to fetch scenarios' }, { status: 500 });
  }

  return NextResponse.json({ scenarios: data });
}
