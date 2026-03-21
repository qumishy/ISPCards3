import { useState, useEffect, useCallback } from 'react';
import { isOnline, addSyncListener, syncNow } from '../services/SyncService';
import { getSyncQueueCount } from '../services/database';

export function useSync() {
  const [online, setOnline] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try { setPending(await getSyncQueueCount()); } catch(e) { setPending(0); }
    setOnline(isOnline());
  }, []);

  useEffect(() => {
    refresh();
    const unsub = addSyncListener(refresh);
    return unsub;
  }, [refresh]);

  const manualSync = useCallback(async () => {
    if (!isOnline()) return;
    setSyncing(true);
    await syncNow();
    await refresh();
    setSyncing(false);
  }, [refresh]);

  return { online, pending, syncing, manualSync, refresh };
}
