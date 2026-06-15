export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  hasMore: boolean;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export function paginate(page = 1, limit = 50, maxLimit = 200): { page: number; limit: number; skip: number } {
  const p = Math.max(1, Math.floor(page));
  const l = Math.min(maxLimit, Math.max(1, Math.floor(limit)));
  return { page: p, limit: l, skip: (p - 1) * l };
}

export function toPaginatedResult<T>(data: T[], total: number, page: number, limit: number): PaginatedResult<T> {
  const pages = Math.max(1, Math.ceil(total / limit));
  return { data, total, page, limit, pages, hasMore: page < pages };
}