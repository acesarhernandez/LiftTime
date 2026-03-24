"use client";

import { usePathname } from "next/navigation";
import { Github, Mail } from "lucide-react";

import { useI18n, TFunction } from "locales/client";
import { cn } from "@/shared/lib/utils";
import { paths } from "@/shared/constants/paths";
import { WorkoutSessionTimer } from "@/features/workout-session/ui/workout-session-timer";
import { useWorkoutSession } from "@/features/workout-session/model/use-workout-session";
import UserLeaderboardPosition from "@/features/leaderboard/ui/user-leaderboard-position";
import { Link } from "@/components/ui/link";
import { DiscordSvg } from "@/components/svg/DiscordSvg";

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

const NAVIGATION = (t: TFunction) => [
  // Kept as internal infrastructure, intentionally hidden until custom content is ready.
  { name: t("commons.donate"), href: paths.root, hidden: true },
  { name: t("commons.about"), href: "/about", hidden: true },
  { name: t("commons.privacy"), href: paths.privacy, hideOnMobile: true, hidden: true },
];

export const Footer = () => {
  const pathname = usePathname();
  const t = useI18n();
  const { isWorkoutActive } = useWorkoutSession();
  const isAuthPage = pathname?.includes("/auth/") ?? false;

  if (isAuthPage) {
    // Auth routes have their own branded footer content under the auth card.
    return null;
  }

  return (
    <footer
      className={cn(
        "relative border-t border-base-300 dark:border-gray-800 bg-base-100 dark:bg-black px-2 sm:px-6 py-2 rounded-b-lg",
        isWorkoutActive && "border-0 bg-transparent p-0 rounded-none"
      )}
    >
      <WorkoutSessionTimer />
      <UserLeaderboardPosition />
      {!isWorkoutActive && (
        <div className="flex sm:flex-row justify-between items-center gap-4">
          {/* Social Icons */}
          <div className="flex gap-0 sm:gap-2">
            {SOCIAL_LINKS.map(({ href, icon: Icon, label }) => (
              <a
                aria-label={label}
                className="btn btn-ghost btn-sm btn-circle text-gray-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-800"
                href={href}
                key={label}
                rel="noopener noreferrer"
                target="_blank"
              >
                <Icon className="h-5 w-5" />
              </a>
            ))}
          </div>

          {/* Navigation Links */}
          <div className="flex sm:flex-row gap-1 sm:gap-3 text-center text-gray-700 dark:text-gray-300">
            {NAVIGATION(t)
              .filter((item) => !item.hidden)
              .map(({ name, href, hideOnMobile }) => (
              <Link
                className={cn(
                  "hover:underline hover:text-blue-500 dark:hover:text-blue-400 text-xs sm:text-sm",
                  hideOnMobile && "hidden sm:block",
                )}
                href={href}
                key={name}
                size="sm"
                variant="footer"
                {...(href.startsWith("http") && { target: "_blank", rel: "noopener noreferrer" })}
              >
                {name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </footer>
  );
};
