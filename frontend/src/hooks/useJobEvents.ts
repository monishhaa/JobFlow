import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { getAccessToken } from '../lib/api';
import { JobEvent } from '../types';

export function useJobEvents(onEvent?: (event: JobEvent) => void) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const controller = new AbortController();

    fetchEventSource('/api/events', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
      async onopen(response) {
        if (response.ok) {
          return; // connected
        }
        if (response.status === 401) {
          // Token expired or invalid
          controller.abort();
        }
      },
      onmessage(msg) {
        if (msg.event === 'job' && msg.data) {
          try {
            const data: JobEvent = JSON.parse(msg.data);
            if (onEvent) {
              onEvent(data);
            }
            // Invalidate react-query caches
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
            queryClient.invalidateQueries({ queryKey: ['job', data.jobId] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            queryClient.invalidateQueries({ queryKey: ['admin'] });
          } catch (e) {
            console.error('Error parsing SSE message', e);
          }
        }
      },
      onerror(err) {
        // Will retry automatically if not aborted
        console.debug('SSE connection error, retrying...', err);
      },
    }).catch(() => {
      // Stream closed or aborted
    });

    return () => {
      controller.abort();
    };
  }, [queryClient, onEvent]);
}
