import { useCallback, useEffect, useRef, useState } from 'react';
import type { Issue, IssueSnapshot, UserId } from './domain';
import type { PublicProfile } from './profiles';
import { loadIssues } from './storage';

export function useSharedIssues(userId:UserId) {
  const [loadedFor,setLoadedFor]=useState<UserId>();
  const currentUser=useRef(userId); currentUser.current=userId;
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [snapshotRevision, setSnapshotRevision] = useState(-1);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const revision = useRef({viewerId:userId,value:-1});
  const refreshRef = useRef<() => void>(() => {});
  const applySnapshot = useCallback((snapshot: IssueSnapshot) => {
    if(snapshot.viewerId!==userId || currentUser.current!==userId)return;
    // Older HTTP responses cannot overwrite a more recent SSE-triggered update.
    if (revision.current.viewerId!==userId || snapshot.revision > revision.current.value) { revision.current = {viewerId:userId,value:snapshot.revision}; setLoadedFor(userId); setIssues(snapshot.issues); setProfiles(snapshot.profiles ?? []); setSnapshotRevision(snapshot.revision); }
    setHydrated(true); setLoadError(false);
  }, [userId]);

  useEffect(() => {
    let active = true; let fetching = false; let queued = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (fetching) { queued = true; return; }
      fetching = true;
      do {
        queued = false;
        try { const snapshot = await loadIssues(userId,controller.signal); if (active) applySnapshot(snapshot); }
        catch { if (active) setLoadError(true); }
      } while (queued && active);
      fetching = false;
    };
    refreshRef.current = () => { void refresh(); };
    void refresh();
    const events = new EventSource('/api/events');
    events.onopen = () => { if (active) setConnection('connected'); };
    events.onerror = () => { if (active) setConnection('reconnecting'); };
    events.addEventListener('change', () => { if (active) void refresh(); });
    return () => { active = false; controller.abort(); events.close(); refreshRef.current = () => {}; };
  }, [applySnapshot,userId]);

  const refresh = useCallback(() => refreshRef.current(), []);
  return { issues:loadedFor===userId?issues:[], profiles, revision:loadedFor===userId?snapshotRevision:-1, hydrated:loadedFor===userId && hydrated, loadError, connection, applySnapshot, refresh };
}
