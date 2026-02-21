/**
 * /demo – no UI. Redirects to /request-demo so the old "Try CapitalBase" / "Open demo"
 * page can never be served (single source of truth: request-demo).
 */

import { redirect } from 'next/navigation';

export default function DemoRedirectPage() {
  redirect('/request-demo');
}
