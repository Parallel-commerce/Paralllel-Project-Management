export function isOnlineStoreChannel(name: string | null | undefined) {
  const value = (name ?? "").trim().toLowerCase();
  return (
    value === "online store" ||
    value === "online store channel" ||
    value === "web"
  );
}

export function isPosChannel(name: string | null | undefined) {
  const value = (name ?? "").trim().toLowerCase();
  return value === "pos" || value.includes("point of sale");
}

export function isHeadlineOnlineOrder(name: string | null | undefined) {
  if (isPosChannel(name)) return false;
  if (!name?.trim()) return true;
  return isOnlineStoreChannel(name);
}
