"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { 
  LayoutDashboard, 
  Layers, 
  SlidersHorizontal, 
  FileText, 
  Settings, 
  MessageSquare,
  Rocket,
  BarChart3,
  Globe,
  Bot
} from "lucide-react";
import { CapitalBaseLogo } from "@/components/CapitalBaseLogo";
import { APP_CONSOLE_NAME, APP_NAME } from "@/lib/branding";
import { cn } from "@/lib/utils";

const DEMO_HIDE_MA = true;
const DEMO_HIDE_AGENT = true;

const navItems = [
  { href: '/app', label: 'Overview', icon: LayoutDashboard, section: 'Workspace' },
  { href: '/models', label: 'Models', icon: Layers, section: 'Workspace' },
  { href: '/startups', label: 'Startups', icon: Rocket, section: 'Workspace' },
  { href: '/market-brief', label: 'Market Brief', icon: BarChart3, section: 'Tools' },
  { href: '/macro-iq', label: 'Macro IQ', icon: Globe, section: 'Tools' },
  { href: '/scenario-engine', label: 'Scenario Engine', icon: SlidersHorizontal, section: 'Tools' },
  { href: '/reports', label: 'Reports', icon: FileText, section: 'Tools' },
  { href: '/agent', label: 'Agent', icon: Bot, section: 'AI' },
  { href: '/analyst-chat', label: 'Analyst Chat', icon: MessageSquare, section: 'AI' },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, section: 'Settings' }
];

/**
 * Determine if a nav item should be active based on current pathname
 */
function isNavItemActive(href: string, pathname: string): boolean {
  // Exact match for root/home route
  if (href === '/app') {
    return pathname === '/app';
  }
  
  // For all other routes, check exact match OR pathname starts with href + '/'
  // This ensures /dashboard/settings matches /dashboard/settings but not /dashboard
  if (pathname === href) {
    return true;
  }
  
  // Prefix match for section routes (e.g., /models matches /models/create)
  // But only if pathname actually starts with href + '/'
  if (pathname.startsWith(`${href}/`)) {
    return true;
  }
  
  return false;
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const hideForModelDetail = /^\/models\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    pathname
  );

  // Prefetch all navigation routes on mount for instant navigation
  useEffect(() => {
    if (hideForModelDetail) return;
    navItems.forEach(({ href }) => {
      router.prefetch(href);
    });
  }, [router, hideForModelDetail]);

  if (hideForModelDetail) return null;

  return (
    <aside className="hidden w-64 border-r border-[var(--cb-border)] bg-[var(--cb-bg)] px-5 py-6 text-[var(--cb-text-body)] transition-colors md:flex md:flex-col">
      <div className="mb-8 space-y-2">
        <CapitalBaseLogo />
        <div className="pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[var(--cb-text-muted)]">
            {APP_NAME}
          </p>
          <h2 className="text-sm font-semibold text-[var(--cb-text-primary)]">{APP_CONSOLE_NAME}</h2>
        </div>
      </div>
      <nav className="space-y-3">
        {(() => {
          const sections = Array.from(new Set(navItems.map(item => item.section)));
          return sections.map((section) => (
            <div key={section} className="space-y-1.5">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">
                {section}
              </p>
              {navItems
                .filter(item => {
                  if (DEMO_HIDE_AGENT && item.href === '/agent') return false;
                  return item.section === section;
                })
                .map(({ href, label, icon: Icon }) => {
                  const isActive = isNavItemActive(href, pathname);
                  return (
                    <Link
                      key={href}
                      href={href}
                      prefetch={true}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-[var(--cb-surface)] text-[var(--cb-text-primary)] shadow-panel"
                          : "text-[var(--cb-text-muted)] hover:bg-[var(--cb-surface-subtle)] hover:text-[var(--cb-text-secondary)]"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-7 w-1 rounded-full transition-colors",
                          isActive ? "bg-[var(--cb-green)]" : "bg-transparent"
                        )}
                      />
                      <Icon
                        className={cn(
                          "h-4 w-4 transition-colors",
                          isActive
                            ? "text-[var(--cb-green)]"
                            : "text-[var(--cb-text-muted)] group-hover:text-[var(--cb-text-secondary)]"
                        )}
                      />
                      <span>{label}</span>
                    </Link>
                  );
                })}
            </div>
          ));
        })()}
      </nav>
    </aside>
  );
}
