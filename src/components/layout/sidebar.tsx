"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  ShoppingCart,
  Settings,
  LogOut,
  Menu,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";

const navItems = [
  {
    section: "Principal",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/dashboard/sales", label: "Vendas", icon: ShoppingCart },
    ],
  },
  {
    section: "Automação",
    items: [
      { href: "/dashboard/flows", label: "Fluxos", icon: ArrowLeftRight },
      { href: "/dashboard/products", label: "Produtos", icon: Package },
    ],
  },
  {
    section: "Configurações",
    items: [
      { href: "/dashboard/settings", label: "WhatsApp & PIX", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = (
    <>
      <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-accent shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground font-bold text-sm shrink-0">
          ez
        </div>
        <span className="font-semibold text-lg tracking-tight">ezflow</span>
        <button
          onClick={() => setMobileOpen(false)}
          className="ml-auto p-1 rounded-md hover:bg-sidebar-accent transition-colors lg:hidden"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {navItems.map((group) => (
          <div key={group.section}>
            <h3 className="px-3 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider mb-2">
              {group.section}
            </h3>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={clsx(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      <item.icon className="w-5 h-5 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-accent p-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary-foreground">
            {session?.user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{session?.user?.name || "Usuário"}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate">{session?.user?.email}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="p-1.5 rounded-md hover:bg-sidebar-accent transition-colors text-sidebar-foreground/50 hover:text-red-400"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 p-2 rounded-lg bg-sidebar text-sidebar-foreground lg:hidden shadow-lg"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col bg-sidebar text-sidebar-foreground h-screen sticky top-0 w-64 shrink-0">
        {navContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-sidebar text-sidebar-foreground flex flex-col shadow-2xl">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
