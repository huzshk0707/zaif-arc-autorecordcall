/* Shared IndexedDB store: one temporary audio copy per recording, and saved transcripts.
   Runs on the extension origin in the offscreen page, service worker, and dashboard. */
globalThis.ZaifAudioStore = (() => {
  const NAME = "zaif-arc-local-transcripts-v1";
  const VERSION = 1;
  let dbPromise;
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(NAME, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const table of ["audio", "transcripts"]) {
          if (!db.objectStoreNames.contains(table)) db.createObjectStore(table, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open local audio store."));
    }).catch(error => { dbPromise = null; throw error; });
    return dbPromise;
  }
  async function transaction(table, mode, work) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const txn = db.transaction(table, mode);
      const req = work(txn.objectStore(table));
      let result;
      if (req) {
        req.onsuccess = () => { result = req.result; };
      }
      txn.oncomplete = () => resolve(result);
      txn.onerror = () => reject(txn.error || new Error("Local storage operation failed."));
      txn.onabort = () => reject(txn.error || new Error("Local storage transaction aborted."));
    });
  }
  function putAudio(id, blob) {
    if (typeof id !== "string" || !(blob instanceof Blob)) throw new Error("Invalid audio cache entry.");
    return transaction("audio", "readwrite", store => store.put({ id, blob, bytes: blob.size, cachedAt: Date.now() }));
  }
  async function getAudio(id) {
    const item = await transaction("audio", "readonly", store => store.get(id));
    return item?.blob || null;
  }
  function deleteAudio(id) { return transaction("audio", "readwrite", store => store.delete(id)); }
  function putTranscript(item) {
    if (!item?.id || typeof item.text !== "string") throw new Error("Invalid transcript.");
    return transaction("transcripts", "readwrite", store => store.put(item));
  }
  function getTranscript(id) { return transaction("transcripts", "readonly", store => store.get(id)); }
  function deleteTranscript(id) { return transaction("transcripts", "readwrite", store => store.delete(id)); }
  function listTranscripts() { return transaction("transcripts", "readonly", store => store.getAll()); }
  async function deleteRecording(id) {
    await deleteAudio(id);
    await deleteTranscript(id);
  }
  return { putAudio, getAudio, deleteAudio, putTranscript, getTranscript, deleteTranscript, listTranscripts, deleteRecording };
})();
