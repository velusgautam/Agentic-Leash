import { useEffect, useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useSetup } from "~/components/useSetup";

const KEY = "agentic-leash:welcome-shown";
const POINTS = [
  "Agents ask before touching new folders — answer in the popup.",
  "Sensitive reads like ~/.ssh show in red on Live.",
  "Revoke all (⌃⌥⌘L) blocks every agent until you end lockdown.",
];

export function WelcomeDialog() {
  const { completedThisSession } = useSetup();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (completedThisSession && !localStorage.getItem(KEY)) setOpen(true);
  }, [completedThisSession]);
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) localStorage.setItem(KEY, "1");
  };
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <AlertDialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-6">
          <AlertDialog.Popup className="dialog-glass w-full max-w-md overflow-hidden rounded-2xl border border-border text-popover-foreground shadow-2xl transition-[opacity,scale] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <div className="flex gap-3.5 px-6 pt-6 pb-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShieldCheck className="size-4.5" aria-hidden />
              </span>
              <AlertDialog.Title className="self-center text-base font-semibold tracking-tight">You're protected</AlertDialog.Title>
            </div>
            <ul className="mx-6 mb-5 space-y-2 rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm">
              {POINTS.map((point) => (
                <li key={point} className="flex gap-2.5">
                  <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end border-t border-border/60 bg-muted/50 px-6 py-3.5">
              <AlertDialog.Close render={<Button size="sm" />}>Got it</AlertDialog.Close>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
