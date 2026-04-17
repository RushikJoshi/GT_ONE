const STORAGE_KEY = "gtone_activity_log_v1";
const MAX_ITEMS = 500;

export function readActivities() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeActivities(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items || []));
  } catch {
    // ignore storage failures
  }
}

export function appendActivity(activity) {
  const now = new Date().toISOString();
  const item = {
    id: activity?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: activity?.type || "info",
    title: activity?.title || "Activity",
    description: activity?.description || "",
    time: activity?.time || now,
    meta: activity?.meta || {},
    details: activity?.details || null
  };

  const existing = readActivities();
  const next = [item, ...existing].slice(0, MAX_ITEMS);
  writeActivities(next);
  return item;
}

export function clearActivities() {
  writeActivities([]);
}

