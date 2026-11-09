// Show a page with fresh data using one request. Calling push() and refresh() together sends
// two requests, and if the older one lands last the page shows stale data (seen as a character
// still marked "draft" just after approving).

export function goTo(router: { push: (href: string) => void; refresh: () => void }, search: string) {
  if (typeof window !== "undefined" && window.location.search === search) router.refresh();
  else router.push(search);
}
