import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const { action, email, password } = await request.json();
  const supabase = createRouteHandlerClient({ cookies });

  if (action === 'sign-in') {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ user: data.user }, { status: 200 });
  }

  if (action === 'sign-out') {
    await supabase.auth.signOut();
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}

