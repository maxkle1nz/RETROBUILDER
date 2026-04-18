import { useEffect, useRef } from 'react';
import { useBuildStore, type OMXBuildEvent } from '../store/useBuildStore';
import { fetchOmxStatus } from '../lib/api';

/**
 * useOMXStream — opens an SSE connection to the OMX build stream endpoint.
 * Auto-reconnects with exponential backoff on failure.
 * Feeds all events into useBuildStore.processBuildEvent.
 */
export function useOMXStream(sessionId: string | null, enabled: boolean) {
  const processBuildEvent = useBuildStore((s) => s.processBuildEvent);
  const stopBuild = useBuildStore((s) => s.stopBuild);
  const hydrateBuildLifecycle = useBuildStore((s) => s.hydrateBuildLifecycle);
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!enabled || !sessionId) return;

    let manuallyClosed = false;

    const recoverRemoteLifecycle = async () => {
      if (manuallyClosed || !sessionId) return;
      try {
        const remote = await fetchOmxStatus(sessionId);
        if (manuallyClosed) return;

        hydrateBuildLifecycle(remote);

        if (remote.status === 'queued' || remote.status === 'running' || remote.status === 'stopping') {
          const delay = Math.min(1000 * Math.pow(2, attemptRef.current), 16000);
          attemptRef.current += 1;
          reconnectRef.current = setTimeout(connect, delay);
          return;
        }

        manuallyClosed = true;
        stopBuild(remote.status);
      } catch {
        if (manuallyClosed) return;
        const delay = Math.min(1000 * Math.pow(2, attemptRef.current), 16000);
        attemptRef.current += 1;
        reconnectRef.current = setTimeout(connect, delay);
      }
    };

    const connect = () => {
      if (manuallyClosed) return;

      const es = new EventSource(`/api/omx/stream/${sessionId}`);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as OMXBuildEvent;
          processBuildEvent(event);
        } catch {
          console.warn('[OMXStream] Could not parse event:', e.data);
        }
      };

      es.onerror = () => {
        es.close();
        if (manuallyClosed) {
          return;
        }
        void recoverRemoteLifecycle();
      };

      // Server signals clean completion with a named 'done' event
      es.addEventListener('done', () => {
        manuallyClosed = true;
        es.close();
        stopBuild();
      });

      es.addEventListener('terminal', (e) => {
        try {
          const event = JSON.parse((e as MessageEvent).data) as Extract<OMXBuildEvent, { type: 'build_terminal' }>;
          processBuildEvent(event);
        } catch {
          console.warn('[OMXStream] Could not parse terminal event:', (e as MessageEvent).data);
        } finally {
          manuallyClosed = true;
          es.close();
        }
      });
    };

    attemptRef.current = 0;
    connect();

    return () => {
      manuallyClosed = true;
      esRef.current?.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [sessionId, enabled, processBuildEvent, stopBuild, hydrateBuildLifecycle]);
}
