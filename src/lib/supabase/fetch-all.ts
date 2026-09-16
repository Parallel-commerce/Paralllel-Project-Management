const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  run: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<{ data: T[]; error: string | null }> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await run(from, to);
    if (error) return { data: rows, error: error.message };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { data: rows, error: null };
    from += PAGE_SIZE;
  }
}
