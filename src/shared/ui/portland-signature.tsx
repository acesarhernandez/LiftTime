import { cn } from "@/shared/lib/utils";

export interface PortlandSignatureProps {
  className?: string;
}

export function PortlandSignature({ className }: PortlandSignatureProps) {
  return (
    <p className={cn("pb-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400", className)}>
      Made with love in Portland, Oregon 🌹💚
    </p>
  );
}
