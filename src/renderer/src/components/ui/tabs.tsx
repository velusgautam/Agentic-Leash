import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "~/lib/utils";

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root className={cn("flex flex-col gap-4", className)} data-slot="tabs" {...props} />;
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return <TabsPrimitive.List className={cn("inline-flex w-fit rounded-lg border border-border p-0.5", className)} data-slot="tabs-list" {...props} />;
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return <TabsPrimitive.Tab className={cn("rounded-md px-2.5 py-1 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-active:bg-accent data-active:font-medium data-active:text-foreground", className)} data-slot="tabs-tab" {...props} />;
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel className={cn("flex flex-col gap-6 outline-none", className)} data-slot="tabs-panel" {...props} />;
}

export { Tabs, TabsList, TabsTab, TabsPanel };
