import { Github, Mail } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { DiscordSvg } from "@/components/svg/DiscordSvg";

export interface PortlandSignatureProps {
  className?: string;
}

const SOCIAL_LINKS = [
  {
    href: "https://github.com/acesarhernandez",
    icon: Github,
    label: "GitHub",
  },
  {
    href: "mailto:cesarhernandezl@proton.me",
    icon: Mail,
    label: "Email",
  },
  {
    href: "https://discordapp.com/users/628124631987126273",
    icon: DiscordSvg,
    label: "Discord",
  },
];

export function PortlandSignature({ className }: PortlandSignatureProps) {
  return (
    <div className={cn("pb-2 text-center", className)}>
      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Made with love in Portland, Oregon 🌹💚</p>
      <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">Powered by Leroy Cloud</p>

      <div className="mt-4 flex items-center justify-center gap-1.5">
        {SOCIAL_LINKS.map(({ href, icon: Icon, label }) => (
          <a
            aria-label={label}
            className="btn btn-ghost btn-xs btn-circle text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-gray-800/70"
            href={href}
            key={label}
            rel="noopener noreferrer"
            target={href.startsWith("http") ? "_blank" : undefined}
          >
            <Icon className="h-3.5 w-3.5" />
          </a>
        ))}
      </div>
    </div>
  );
}
