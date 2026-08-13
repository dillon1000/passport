/** Kumo LayerCard slots for the example client. */
import * as React from "react";
import { LayerCard, cn } from "@cloudflare/kumo";

const Card = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof LayerCard>>(({ className, ...props }, ref) => <LayerCard ref={ref} className={cn("p-0", className)} {...props} />);
Card.displayName = "Card";
const CardHeader = ({ className, ...props }: React.ComponentProps<"div">) => <div className={cn("px-5 pt-5", className)} {...props} />;
const CardTitle = ({ className, ...props }: React.ComponentProps<"div">) => <div className={cn("font-medium text-kumo-default", className)} {...props} />;
const CardDescription = ({ className, ...props }: React.ComponentProps<"div">) => <div className={cn("mt-1 text-sm text-kumo-subtle", className)} {...props} />;
const CardContent = ({ className, ...props }: React.ComponentProps<"div">) => <div className={cn("px-5 py-5", className)} {...props} />;
export { Card, CardContent, CardDescription, CardHeader, CardTitle };
