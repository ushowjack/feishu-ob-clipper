const DATABASE_NAME = "caizhai-to-obsidian";
const STORE_NAME = "handles";
const VAULT_KEY = "vault";

export async function saveDirectoryHandle(handle) {
  if (!handle || handle.kind !== "directory") throw new Error("只能保存目录授权");
  const database = await openDatabase();
  await requestToPromise(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(handle, VAULT_KEY));
  database.close();
}

export async function loadDirectoryHandle() {
  const database = await openDatabase();
  const handle = await requestToPromise(database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(VAULT_KEY));
  database.close();
  return handle ?? null;
}

export async function clearDirectoryHandle() {
  const database = await openDatabase();
  await requestToPromise(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(VAULT_KEY));
  database.close();
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("当前浏览器不支持 IndexedDB"));
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("打开授权存储失败")));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("保存授权失败")));
  });
}
