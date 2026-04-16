import { useEffect, useRef } from 'react';
import { useBuildStore, type OMXBuildEvent } from '../store/useBuildStore';

/**
 * useOMXStream — opens an SSE connection to the OMX build stream endpoint.
 * Auto-reconnects with exponential backoff on failure.
 * Feeds all events into useBuildStore.processBuildEvent.
 */
export function useOMXStream(sessionId: string | null, enabled: boolean) {
  const processBuildEvent = useBuildStore((s) => s.processBuildEvent);
  const stopBuild = useBuildStore((s) => s.stopBuild);
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const connect = () => {
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
        // Exponential backoff: 1s → 2s → 4s → 8s → max 16s
        const delay = Math.min(1000 * Math.pow(2, attemptRef.current), 16000);
        attemptRef.current += 1;
        reconnectRef.current = setTimeout(connect, delay);
      };

      // Server signals clean completion with a named 'done' event
      es.addEventListener('done', () => {
        es.close();
        stopBuild();
      });
    };

    attemptRef.current = 0;
    connect();

    return () => {
      esRef.current?.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [sessionId, enabled, processBuildEvent, stopBuild]);
}
