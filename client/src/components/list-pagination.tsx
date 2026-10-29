import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PAGE_SIZES, type PaginationControl } from "@/hooks/use-pagination";
import { cn } from "@/lib/utils";

/**
 * Footer for a paginated list: "1–50 of 132", rows per page (25 / 50 / 100 / All)
 * and previous/next. Hidden while the whole list fits in the smallest page.
 */
export function ListPagination({ control, className }: { control: PaginationControl; className?: string }) {
  const { t } = useTranslation();
  const { page, pageSize, total, pageCount, setPage, setPageSize } = control;
  if (total <= PAGE_SIZES[0]) return null;

  const from = pageSize === "all" ? 1 : page * pageSize + 1;
  const to = pageSize === "all" ? total : Math.min(total, (page + 1) * pageSize);

  return (
    <div
      className={cn("flex flex-wrap items-center justify-between gap-3 px-2 py-3 text-sm text-muted-foreground", className)}
      data-testid="list-pagination"
    >
      <span data-testid="text-pagination-range">{t("pagination.range", { from, to, total })}</span>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1" role="group" aria-label={t("pagination.rowsPerPage")}>
          <span className="mr-1">{t("pagination.rowsPerPage")}</span>
          {PAGE_SIZES.map((size) => (
            <Button
              key={size}
              type="button"
              size="sm"
              variant={size === pageSize ? "secondary" : "ghost"}
              className="h-7 px-2"
              aria-pressed={size === pageSize}
              onClick={() => setPageSize(size)}
              data-testid={`button-page-size-${size}`}
            >
              {size === "all" ? t("pagination.all") : size}
            </Button>
          ))}
        </div>
        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              aria-label={t("pagination.previousPage")}
              data-testid="button-page-previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span data-testid="text-pagination-page">{t("pagination.page", { page: page + 1, pages: pageCount })}</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={page >= pageCount - 1}
              onClick={() => setPage(page + 1)}
              aria-label={t("pagination.nextPage")}
              data-testid="button-page-next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
