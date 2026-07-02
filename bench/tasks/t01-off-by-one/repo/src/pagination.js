export function paginate(items, page, pageSize) {
  const start = Math.max(0, (page - 1) * pageSize);
  const end = Math.min(items.length - 1, start + pageSize);
  return items.slice(start, end);
}
