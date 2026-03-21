import NetInfo from '@react-native-community/netinfo';
import { setOnlineStatus, processSyncQueue, getSyncQueueCount } from './database';

let _isOnline = false;
let _unsubscribe = null;
let _interval = null;
let _listeners = [];

export function startNetworkMonitor(onStatusChange) {
  _unsubscribe = NetInfo.addEventListener(async state => {
    const online = !!(state.isConnected && state.isInternetReachable !== false);
    const changed = online !== _isOnline;
    _isOnline = online;
    setOnlineStatus(online);
    if (changed) {
      onStatusChange?.(online);
      if (online) {
        await processSyncQueue();
        notifyListeners();
      }
    }
  });
  _interval = setInterval(async () => {
    if (_isOnline) {
      await processSyncQueue();
      notifyListeners();
    }
  }, 30000);
}

export function stopNetworkMonitor() {
  _unsubscribe?.();
  if (_interval) clearInterval(_interval);
}

export const isOnline = () => _isOnline;

export function addSyncListener(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}
function notifyListeners() { _listeners.forEach(fn => fn()); }

export async function syncNow() {
  if (!_isOnline) return 0;
  const synced = await processSyncQueue();
  notifyListeners();
  return synced;
}
