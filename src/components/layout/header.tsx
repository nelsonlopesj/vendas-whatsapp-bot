"use client";

import { useSession } from "next-auth/react";
import { Bell, Sun, Moon } from "lucide-react";
import { useState } from "react";

export function Header() {
  const { data: session } = useSession();
  const [dark, setDark] = useState(false);

  const toggleDark = () => {
    setDark(!dark);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <header className="flex items-center justify-between h-16 px-6 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Olá, {session?.user?.name?.split(" ")[0] || "bem-vindo"} 👋
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleDark}
          className="p-2 rounded-lg hover:bg-secondary transition-colors"
          title={dark ? "Modo claro" : "Modo escuro"}
        >
          {dark ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>

        <button
          className="p-2 rounded-lg hover:bg-secondary transition-colors relative"
          title="Notificações"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive" />
        </button>
      </div>
    </header>
  );
}
