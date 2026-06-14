import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { Link } from "react-router";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Right-aligned account menu in the top bar — avatar trigger with a popover. */
export function UserMenu({
	name,
	email,
	image,
	initials,
	onSignOut,
}: {
	name: string;
	email: string;
	image?: string | null;
	initials: string;
	onSignOut: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Account menu"
					className="flex items-center gap-1 rounded-full pr-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
				>
					<Avatar className="size-7 rounded-full">
						<AvatarImage src={image ?? undefined} />
						<AvatarFallback className="text-[0.625rem]">{initials}</AvatarFallback>
					</Avatar>
					<ChevronDown className="size-3.5 text-muted-foreground" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<div className="flex items-center gap-2.5 px-1.5 py-1.5">
					<Avatar className="size-8 rounded-full">
						<AvatarImage src={image ?? undefined} />
						<AvatarFallback className="text-xs">{initials}</AvatarFallback>
					</Avatar>
					<div className="min-w-0">
						<div className="truncate text-sm font-medium">{name}</div>
						<div className="truncate text-xs text-muted-foreground">{email}</div>
					</div>
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/account">
						<UserRound />
						Account
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem variant="destructive" onClick={onSignOut}>
					<LogOut />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
