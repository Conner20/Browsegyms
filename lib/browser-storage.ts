// Read old browser data during the brand migration so saved preferences survive.
function legacyKey(key: string) {
  return key.startsWith("browsegyms_") ? key.replace(/^browsegyms_/, "fittingin_") : key;
}
export function readStoredValue(storage: Storage, key: string) {
  const current = storage.getItem(key);
  if (current !== null) return current;
  const previous = legacyKey(key);
  const value = storage.getItem(previous);
  if (value !== null && previous !== key) {
    storage.setItem(key, value);
    storage.removeItem(previous);
  }
  return value;
}
export function writeStoredValue(storage: Storage, key: string, value: string) {
  storage.setItem(key, value);
  if (legacyKey(key) !== key) storage.removeItem(legacyKey(key));
}
export function removeStoredValue(storage: Storage, key: string) {
  storage.removeItem(key);
  if (legacyKey(key) !== key) storage.removeItem(legacyKey(key));
}
