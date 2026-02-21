/**
 * Demo link for sharing – redirects straight to login so recipients
 * see the app gate (guest or sign in) in one click.
 */

import { redirect } from 'next/navigation';

export default function DemoPage() {
  redirect('/login');
}
