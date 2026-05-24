"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Layers,
  FileText,
  Settings,
  MessageSquare,
  Newspaper,
  Radar,
  Briefcase,
  ShieldCheck,
} from "lucide-react";
import { CapitalBaseLogo } from "@/components/CapitalBaseLogo";
import { APP_CONSOLE_NAME, APP_NAME } from "@/lib/branding";
import { cn } from "@/lib/utils";

const navItems: Array<{ href: string; label: string; hint?: string; icon: React.ElementType; section: string; dim?: boolean }> = [
  { href: '/app',          label: 'Opportunities',  hint: 'Hedge Fund · Dexter · Analysis', icon: TrendingUp,    section: 'Workspace' },
  { href: '/portfolio',    label: 'Portfolio',       hint: 'Track ideas',                    icon: Briefcase,     section: 'Workspace' },
  { href: '/pm',           label: 'PM OS',           hint: 'Theses · Alerts · Decisions',    icon: ShieldCheck,   section: 'Workspace' },
  { href: '/models',       label: 'Models',          icon: Layers,          section: 'Workspace' },
  { href: '/news',         label: 'News',            icon: Newspaper,       section: 'Tools' },
  { href: '/events',       label: 'Events',          icon: Radar,           section: 'Tools' },
  { href: '/reports',      label: 'Reports',         icon: FileText,        section: 'Tools' },
  { href: '/analyst-chat', label: 'Analyst Chat',    icon: MessageSquare,   section: 'Tools',  dim: true },
  { href: '/dashboard/settings', label: 'Settings',  icon: Settings,        section: 'Settings' },
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

  return (
    <aside className="hidden w-[230px] border-r border-[var(--cb-border)] bg-[var(--cb-bg)] px-4 py-6 text-[var(--cb-text-body)] transition-colors md:flex md:flex-col">
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
                .filter(item => item.section === section)
                .map(({ href, label, hint, icon: Icon, dim }) => {
                  const isActive = isNavItemActive(href, pathname);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer",
                        isActive
                          ? "bg-[var(--cb-surface)] text-[var(--cb-text-primary)] border-l-2 border-[var(--cb-green)]"
                          : dim
                          ? "text-[var(--cb-text-muted)] opacity-60 hover:opacity-100 hover:bg-[var(--cb-surface-subtle)] hover:text-[var(--cb-text-secondary)] border-l-2 border-transparent"
                          : "text-[var(--cb-text-muted)] hover:bg-[var(--cb-surface-subtle)] hover:text-[var(--cb-text-secondary)] border-l-2 border-transparent"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          isActive
                            ? "text-[var(--cb-green)]"
                            : "text-[var(--cb-text-muted)] group-hover:text-[var(--cb-text-secondary)]"
                        )}
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate leading-snug">{label}</span>
                        {hint && !isActive && (
                          <span className="truncate text-[9px] font-normal leading-tight text-[var(--cb-text-muted)] opacity-80">
                            {hint}
                          </span>
                        )}
                        {hint && isActive && (
                          <span className="truncate text-[9px] font-normal leading-tight text-[var(--cb-green)] opacity-70">
                            {hint}
                          </span>
                        )}
                      </span>
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
