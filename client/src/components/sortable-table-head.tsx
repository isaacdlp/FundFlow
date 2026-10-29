import type { ReactNode, ThHTMLAttributes } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import type { SortControl } from "@/hooks/use-sort";
import { cn } from "@/lib/utils";

interface SortHeaderProps<K extends string> {
  control: SortControl<K>;
  column: K;
  children: ReactNode;
  className?: string;
}

/** Clickable header content: label + direction arrow. Use inside any <th>. */
export function SortButton<K extends string>({ control, column, children, className }: SortHeaderProps<K>) {
  const active = control.sort?.key === column ? control.sort.direction : null;
  const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => control.toggle(column)}
      className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground", className)}
      data-testid={`sort-${column}`}
    >
      {children}
      <Icon className={cn("h-3.5 w-3.5 shrink-0", !active && "opacity-40")} />
    </button>
  );
}

/** `<TableHead>` that sorts its list (see `useSort`) when clicked. */
export function SortableTableHead<K extends string>({
  control, column, children, className, ...props
}: SortHeaderProps<K> & Omit<ThHTMLAttributes<HTMLTableCellElement>, "children">) {
  const active = control.sort?.key === column ? control.sort.direction : null;
  return (
    <TableHead
      className={className}
      aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}
      {...props}
    >
      <SortButton control={control} column={column}>{children}</SortButton>
    </TableHead>
  );
}
