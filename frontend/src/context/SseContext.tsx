import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { getAccessToken, refreshAuthToken } from '../lib/api';
import { JobEvent, Job, PaginatedResult } from '../types';

export type SseConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

interface SseContextType {
  status: SseConnectionStatus;
}

const SseContext = createContext<SseContextType>({ status: 'disconnected' });

export const SseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SseConnectionStatus>('disconnected');
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);

  const refetchJobData = useCallback(() => {
    // Invalidate and refetch all job-related data:
    // the jobs list, any open job detail and its executions, the stats summary and timeseries
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    queryClient.invalidateQueries({ queryKey: ['job'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  }, [queryClient]);

  const connectSSE = useCallback(() => {
    const token = getAccessToken();
    if (!token) {
      setStatus('disconnected');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStatus('reconnecting');

    fetchEventSource('/api/events', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
      async onopen(response) {
        if (response.ok) {
          setStatus('connected');
          // On every successful (re)connection (onopen), invalidate and refetch all job-related TanStack Query data
          refetchJobData();
          return;
        }
        if (response.status === 401) {
          // Attempt token refresh on 401
          const newToken = await refreshAuthToken();
          if (!newToken) {
            setStatus('disconnected');
            controller.abort();
          }
        } else {
          setStatus('reconnecting');
        }
      },
      onmessage(msg) {
        if (msg.event === 'job' && msg.data) {
          try {
            const event: JobEvent = JSON.parse(msg.data);

            // 1. Update individual job cache if present
            queryClient.setQueryData<Job>(['job', event.jobId], (old) => {
              if (!old) return old;
              return {
                ...old,
                status: event.status,
                attempts: event.attempts,
                maxAttempts: event.maxAttempts,
              };
            });

            // 2. Update jobs list cache in-place across matching queries
            queryClient.setQueriesData<PaginatedResult<Job>>(
              { queryKey: ['jobs'] },
              (old) => {
                if (!old) return old;
                const items = old.items.map((j) =>
                  j.id === event.jobId
                    ? {
                        ...j,
                        status: event.status,
                        attempts: event.attempts,
                        maxAttempts: event.maxAttempts,
                      }
                    : j
                );
                return { ...old, items };
              }
            );

            // 3. Invalidate summary stats and queues
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'queues'] });
          } catch (e) {
            console.error('Error handling SSE job event', e);
          }
        }
      },
      onerror(err) {
        setStatus('reconnecting');
        console.debug('SSE stream error', err);
      },
      onclose() {
        setStatus('reconnecting');
      },
    }).catch(() => {
      // Stream aborted
      setStatus('disconnected');
    });
  }, [queryClient, refetchJobData]);

  // While the stream is disconnected or reconnecting, poll those same queries every 15 seconds; stop polling when it reconnects.
  useEffect(() => {
    if (status === 'connected') return;

    const interval = setInterval(() => {
      if (getAccessToken()) {
        refetchJobData();
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [status, refetchJobData]);

  useEffect(() => {
    const handleAuthChange = () => {
      const token = getAccessToken();
      if (token) {
        connectSSE();
      } else {
        abortControllerRef.current?.abort();
        setStatus('disconnected');
      }
    };

    window.addEventListener('auth:login', handleAuthChange);
    window.addEventListener('auth:unauthorized', handleAuthChange);

    // Initial check
    if (getAccessToken()) {
      connectSSE();
    }

    return () => {
      abortControllerRef.current?.abort();
      window.removeEventListener('auth:login', handleAuthChange);
      window.removeEventListener('auth:unauthorized', handleAuthChange);
    };
  }, [connectSSE]);

  return (
    <SseContext.Provider value={{ status }}>
      {children}
    </SseContext.Provider>
  );
};

export const useSse = () => useContext(SseContext);
