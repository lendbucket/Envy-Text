"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  Users,
  Megaphone,
  Settings,
} from "lucide-react";

const navItems = [
  { href: "/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-sidebar flex flex-col border-r border-border bg-panel h-screen shrink-0">
      <div className="px-5 py-6">
        <h1 className="font-display text-xl font-semibold text-primary">
          Envy Texts
        </h1>
      </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-secondary hover:text-primary hover:bg-canvas"
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-5 py-4 border-t border-border">
        <p className="text-xs text-secondary">Salon Envy USA</p>
      </div>
    </aside>
  );
}
