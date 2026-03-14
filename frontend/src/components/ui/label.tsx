import * as React from "react";

import { cn } from "@/lib/utils";

const Label = React.forwardRef<HTMLLabelElement, React.ComponentProps<"label">>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-sm font-medium text-[#132a52] leading-none", className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";

export { Label };
