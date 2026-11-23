// File System Access bridge for a user-selected computer folder.
// Handles are structured-cloned into IndexedDB; Chrome may request renewed
// permission after restart. There is no unrestricted filesystem access.
globalThis.ZaifLocalFiles = (() => {
  const DB_NAME = "zaif-arc-directory-handles-v1";
  let pendingDb;
  function db() {
    if (pendingDb) return pendingDb;
    pendingDb = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("handles");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Directory settings unavailable."));
    }).catch(e => { pendingDb = null; throw e; });
    return pendingDb;
  }
  async function transact(mode, work) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("handles", mode);
      const request = work(transaction.objectStore("handles"));
      let value;
      request.onsuccess = () => { value = request.result; };
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error || new Error("Folder database error."));
      transaction.onabort = () => reject(transaction.error || new Error("Folder database transaction aborted."));
    });
  }
  const get = key => transact("readonly", store => store.get(key));
  const put = (key, value) => transact("readwrite", store => store.put(value, key));
  const del = key => transact("readwrite", store => store.delete(key));
  const canPick = () => typeof window.showDirectoryPicker === "function";

  async function selectFolder() {
    if (!canPick()) throw new Error("This version of Chrome does not support local folder selection.");
    // Picker must be launched directly from a user's click.
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("Read/write permission wasn't granted for that folder.");
    await put("primary", handle);
    return { name: handle.name, permission };
  }
  async function folderStatus() {
    const handle = await get("primary");
    if (!handle) return { configured: false, granted: false, name: "" };
    let permission = "prompt";
    try { permission = await handle.queryPermission({ mode: "readwrite" }); }
    catch { permission = "denied"; }
    return { configured: true, granted: permission === "granted", name: handle.name, permission };
  }
  async function reconnectFolder() {
    const handle = await get("primary");
    if (!handle) throw new Error("Select a folder first.");
    // Only call from a direct button click; requestPermission may show a prompt.
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("Chrome didn't grant access. Choose a folder again.");
    return { name: handle.name, permission };
  }
  async function clearFolder() { await del("primary"); }
  async function createFile(id, name) {
    const folder = await get("primary");
    if (!folder) return null;
    if (await folder.queryPermission({ mode: "readwrite" }) !== "granted") return null;
    if (!/^ZAIF-[\dTZ-]+-[a-f0-9]{8}\.webm$/.test(name)) throw new Error("Unsafe local recording filename.");
    const file = await folder.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await put("file:" + id, { file, folder, name });
    return { writable, name, folderName: folder.name };
  }
  async function getRecord(id) { return get("file:" + id); }
  async function openFile(id) {
    const entry = await getRecord(id);
    if (!entry) throw new Error("Linked recording file not found. Import the audio file instead.");
    return entry.file.getFile();
  }
  async function recordStatus(id) {
    const entry = await getRecord(id);
    if (!entry) return "missing";
    try {
      const permission = await entry.file.queryPermission({ mode: "read" });
      if (permission !== "granted") return "permission";
      await entry.file.getFile();
      return "saved";
    } catch (error) {
      return error?.name === "NotFoundError" ? "missing" : "permission";
    }
  }
  async function deleteFile(id) {
    const entry = await getRecord(id);
    if (!entry) throw new Error("The recording's folder reference is unavailable.");
    const permission = await entry.folder.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("Folder permission expired. Reconnect the folder before deleting this recording.");
    try { await entry.folder.removeEntry(entry.name); }
    catch (error) {
      if (error.name !== "NotFoundError") throw error;
    }
    await del("file:" + id);
  }
  async function forgetFile(id) { await del("file:" + id); }
  return { selectFolder, folderStatus, reconnectFolder, clearFolder, createFile, openFile,
    recordStatus, deleteFile, forgetFile };
})();
