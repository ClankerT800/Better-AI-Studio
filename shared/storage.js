const withFallback = (value, fallback) =>
  value === undefined ? fallback : value;

const handleError = (error) => {
  console.error("Storage operation failed", error);
  throw error;
};

const areaFactory = (area) => {
  const storage = chrome.storage[area];

  const get = async (keys, fallback) => {
    try {
      const result = await storage.get(keys);
      if (fallback === undefined) {
        return result;
      }
      if (typeof keys === "string") {
        return withFallback(result[keys], fallback);
      }
      return { ...fallback, ...result };
    } catch (error) {
      return handleError(error);
    }
  };

  const set = async (items) => {
    try {
      await storage.set(items);
    } catch (error) {
      handleError(error);
    }
  };

  const remove = async (keys) => {
    try {
      await storage.remove(keys);
    } catch (error) {
      handleError(error);
    }
  };

  const clear = async () => {
    try {
      await storage.clear();
    } catch (error) {
      handleError(error);
    }
  };

  const merge = async (key, updater, fallback) => {
    const current = await get(key, fallback);
    const updated = await updater(current);
    await set({ [key]: updated });
    return updated;
  };

  return {
    get,
    set,
    remove,
    clear,
    merge,
  };
};

export const storageSync = areaFactory("sync");
export const storageLocal = areaFactory("local");

export const observeStorage = (areaName, handler) => {
  const listener = (changes, namespace) => {
    if (namespace === areaName) {
      handler(changes);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
};
