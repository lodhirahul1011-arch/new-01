import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../store';
import { deliveryActions } from '../store/slices/deliverySlice';
import type { DeliverySchedule } from '../services/api/smsDeliveryService';
import {
  useLazyGetDeliveryScheduleDetailsQuery,
  useLazyGetDeliveryScheduleHistoryQuery,
  useLazyGetDeliveryStatsQuery,
  useLazyGetUpcomingSchedulesQuery,
  useLazySearchDeliverySchedulesQuery,
} from '../services/api/deliveryApi';
import { logs } from '../services/logs';

// Avoid multiplying polling if multiple screens mount this hook at once.
const DELIVERY_POLL_GUARD_KEY = '__DWAR_DELIVERY_SCHEDULES_POLL_STARTED__';
const DELIVERY_BOOTSTRAP_GUARD_KEY = '__DWAR_DELIVERY_SCHEDULES_BOOTSTRAPPED__';

function mergeDeliverySchedulePages(
  existing: DeliverySchedule[],
  incoming: DeliverySchedule[],
) {
  const schedulesById = new Map<string, DeliverySchedule>();
  existing.forEach(schedule => schedulesById.set(schedule._id, schedule));
  incoming.forEach(schedule => schedulesById.set(schedule._id, schedule));
  return Array.from(schedulesById.values());
}

type DeliveryScheduleWithSource = DeliverySchedule & {
  source?: string;
};

function hasRequiredDeliveryIdentity(schedule: DeliverySchedule) {
  return Boolean(
    String(schedule.referenceId || '').trim() &&
      (String(schedule.orderHint || '').trim() ||
        String(schedule.awbNumber || '').trim() ||
        String(schedule.productSummary || '').trim()),
  );
}

export function isUserBackedDeliverySchedule(schedule: DeliverySchedule) {
  const latestSmsId = schedule.latestSmsId as
    | DeliverySchedule['latestSmsId']
    | string;
  const hasLatestSms =
    typeof latestSmsId === 'string'
      ? latestSmsId.trim().length > 0
      : Boolean(latestSmsId?._id || latestSmsId?.rawText);
  const hasSmsHistory = Boolean(
    schedule.statusHistory?.some(entry => Boolean(entry.smsId)),
  );
  const hasManualHistory = Boolean(
    schedule.statusHistory?.some(entry =>
      String(entry.messageSummary || '')
        .toLowerCase()
        .includes('manually scheduled from dvari app'),
    ),
  );
  const isManualDelivery =
    String(schedule.deliveryCompany || '').trim().toLowerCase() === 'manual';
  const source = String(
    (schedule as DeliveryScheduleWithSource).source || '',
  ).trim().toLowerCase();
  const hasTabletSession = Boolean(
    schedule.arrivedByTablet || schedule.activeTabletDeliverySessionId,
  );

  if (isManualDelivery || hasManualHistory) {
    return hasRequiredDeliveryIdentity(schedule);
  }

  if (
    source === 'notification' ||
    source === 'integration' ||
    source === 'ecommerce'
  ) {
    return hasRequiredDeliveryIdentity(schedule);
  }

  const hasLinkedSmsEvidence =
    Number(schedule.smsCount || 0) > 0 && (hasLatestSms || hasSmsHistory);
  const hasTabletEvidence =
    hasTabletSession && hasRequiredDeliveryIdentity(schedule);

  return hasLinkedSmsEvidence || hasTabletEvidence;
}

function retainSourceBackedDeliveries(
  schedules: DeliverySchedule[],
  collection: 'upcoming' | 'history' | 'search',
) {
  const retained = schedules.filter(isUserBackedDeliverySchedule);
  const removedCount = schedules.length - retained.length;

  if (removedCount > 0) {
    logs.info('[delivery-schedules] untraceable delivery records suppressed', {
      collection,
      removedCount,
    });
  }

  logs.info('[delivery-schedules] source-backed records prepared', {
    collection,
    received: schedules.length,
    retained: retained.length,
  });

  return retained;
}

export function useDeliverySchedules() {
  const dispatch = useDispatch();
  const [isInitialized, setIsInitialized] = useState(false);
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);
  const cooldownUntilRef = useRef(0);
  const lastStatsAtRef = useRef(0);
  const lastHistoryAtRef = useRef(0);
  const [triggerUpcoming] = useLazyGetUpcomingSchedulesQuery();
  const [triggerHistory] = useLazyGetDeliveryScheduleHistoryQuery();
  const [triggerStats] = useLazyGetDeliveryStatsQuery();

  const upcoming = useSelector((state: RootState) => state.delivery?.upcoming);
  const history = useSelector((state: RootState) => state.delivery?.history);
  const stats = useSelector((state: RootState) => state.delivery?.stats);
  const lastRefresh = useSelector((state: RootState) => state.delivery?.lastRefresh);
  const historyDataRef = useRef<DeliverySchedule[]>(history?.data ?? []);

  useEffect(() => {
    historyDataRef.current = history?.data ?? [];
  }, [history?.data]);

  /**
   * Load upcoming deliveries
   */
  const loadUpcoming = useCallback(async (skip = 0, limit = 50) => {
    try {
      dispatch(deliveryActions.upcomingLoadingStarted());
      const response = await triggerUpcoming({ skip, limit }).unwrap();
      
      if (response.success && response.data) {
        const sourceBackedDeliveries = retainSourceBackedDeliveries(
          response.data,
          'upcoming',
        );
        dispatch(
          deliveryActions.upcomingLoaded({
            data: sourceBackedDeliveries,
            total: Math.max(
              sourceBackedDeliveries.length,
              (response.pagination?.total || 0) -
                (response.data.length - sourceBackedDeliveries.length),
            ),
            skip: response.pagination?.skip || 0,
            limit: response.pagination?.limit || 50,
          })
        );
      } else {
        logs.error('[delivery-schedules] upcoming response missing data', {
          success: response.success,
        });
        dispatch(deliveryActions.upcomingLoadingFailed('Failed to load deliveries'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logs.error('[delivery-schedules] upcoming load failed', {error});
      dispatch(deliveryActions.upcomingLoadingFailed(message));
    }
  }, [dispatch, triggerUpcoming]);

  /**
   * Load delivery history
   */
  const loadHistory = useCallback(async (skip = 0, limit = 50) => {
    try {
      dispatch(deliveryActions.historyLoadingStarted());
      const response = await triggerHistory({ skip, limit }).unwrap();
      
      if (response.success && response.data) {
        const sourceBackedDeliveries = retainSourceBackedDeliveries(
          response.data,
          'history',
        );
        const nextHistory =
          skip > 0
            ? mergeDeliverySchedulePages(
                historyDataRef.current,
                sourceBackedDeliveries,
              )
            : sourceBackedDeliveries;
        historyDataRef.current = nextHistory;

        dispatch(
          deliveryActions.historyLoaded({
            data: nextHistory,
            total: Math.max(
              nextHistory.length,
              (response.pagination?.total || 0) -
                (response.data.length - sourceBackedDeliveries.length),
            ),
            skip: response.pagination?.skip || 0,
            limit: response.pagination?.limit || 50,
          })
        );
        logs.info('[delivery-schedules] history page loaded', {
          skip,
          received: sourceBackedDeliveries.length,
          retained: nextHistory.length,
        });
        lastHistoryAtRef.current = Date.now();
      } else {
        logs.error('[delivery-schedules] history response missing data', {
          success: response.success,
        });
        dispatch(deliveryActions.historyLoadingFailed('Failed to load history'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logs.error('[delivery-schedules] history load failed', {error});
      dispatch(deliveryActions.historyLoadingFailed(message));
    }
  }, [dispatch, triggerHistory]);

  /**
   * Load statistics
   */
  const loadStats = useCallback(async () => {
    try {
      const response = await triggerStats().unwrap();
      
      if (response.success && response.data) {
        dispatch(
          deliveryActions.statsLoaded({
            totalSms: response.data.totalSms,
            upcoming: response.data.statistics.upcoming,
            delivered: response.data.statistics.delivered,
               failed: response.data.statistics.failed,
            byCompany: response.data.byCompany,
          })
        );
        lastStatsAtRef.current = Date.now();
      }
    } catch (error) {
      const anyErr: any = error as any;
      const status = anyErr?.originalStatus ?? anyErr?.status;
      if (status === 429 || String(anyErr?.data || '').toLowerCase().includes('too many')) {
        // Cool down to avoid hammering the backend when rate-limited.
        cooldownUntilRef.current = Date.now() + 30_000;
        return;
      }
      logs.error('Error loading stats', error);
    }
  }, [dispatch, triggerStats]);

  /**
   * Refresh all data
   */
  const refresh = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now < cooldownUntilRef.current) {
      return;
    }
    if (refreshInFlightRef.current) {
      return;
    }
    // Global debounce for this hook instance.
    if (!force && now - lastRefreshStartedAtRef.current < 12_000) {
      return;
    }

    refreshInFlightRef.current = true;
    lastRefreshStartedAtRef.current = now;
    try {
      // Upcoming drives the "Visitor at Door" card; keep it fresh.
      await loadUpcoming(0, 50);

      // Stats + History are heavier and don't need to be hit on every poll.
      if (force || now - lastStatsAtRef.current > 60_000) {
        await loadStats();
      }
      if (force || now - lastHistoryAtRef.current > 60_000) {
        await loadHistory(0, 50);
      }
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [loadHistory, loadUpcoming, loadStats]);

  /**
   * Auto-refresh periodically so Home can react quickly to tablet scan events.
   */
  useEffect(() => {
    if (!isInitialized) return;

    const g = globalThis as any;
    if (g[DELIVERY_POLL_GUARD_KEY]) return;
    g[DELIVERY_POLL_GUARD_KEY] = true;

    const interval = setInterval(() => {
      void refresh();
    }, 45 * 1000);

    return () => clearInterval(interval);
  }, [isInitialized, refresh]);

 
  useEffect(() => {
    if (isInitialized) return;

    const g = globalThis as any;
    if (!g[DELIVERY_BOOTSTRAP_GUARD_KEY]) {
      g[DELIVERY_BOOTSTRAP_GUARD_KEY] = true;
      void refresh(true);
    }
    setIsInitialized(true);
  }, [isInitialized, refresh]);

  return {
    upcoming: upcoming || {
      data: [],
      loading: false,
      error: null,
      total: 0,
      skip: 0,
      limit: 50,
    },
    history: history || {
      data: [],
      loading: false,
      error: null,
      total: 0,
      skip: 0,
      limit: 50,
    },
    loadUpcoming,
    loadHistory,
    stats,
    loadStats,
    refresh,
    lastRefresh,
  };
}

/**
 * Hook for getting delivery details
 */
export function useDeliveryDetails(scheduleId: string | null) {
  const [delivery, setDelivery] = useState<DeliverySchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const lastLoadedScheduleIdRef = useRef<string | null>(null);
  const [triggerDetails] = useLazyGetDeliveryScheduleDetailsQuery();

  const load = useCallback(async (force = false) => {
    if (!scheduleId) return;
    if (inFlightRef.current) return;
    if (!force && lastLoadedScheduleIdRef.current === scheduleId) return;

    try {
      inFlightRef.current = true;
      setLoading(true);
      setError(null);
      const response = await triggerDetails({ scheduleId }).unwrap();
      
      if (
        response.success &&
        response.data &&
        isUserBackedDeliverySchedule(response.data)
      ) {
        setDelivery(response.data);
        lastLoadedScheduleIdRef.current = scheduleId;
      } else {
        logs.error('[delivery-schedules] detail record has no user provenance', {
          scheduleId,
        });
        setError('Failed to load delivery details');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logs.error('[delivery-schedules] detail load failed', {
        scheduleId,
        error: err,
      });
      setError(message);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [scheduleId, triggerDetails]);

  useEffect(() => {
    lastLoadedScheduleIdRef.current = null;
    void load();
  }, [scheduleId, load]);

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  return { delivery, loading, error, refresh };
}


export function useSearchDeliveries() {
  const [results, setResults] = useState<DeliverySchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggerSearch] = useLazySearchDeliverySchedulesQuery();

  const search = useCallback(async (referenceId?: string, company?: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await triggerSearch({ referenceId, company }).unwrap();
      
      if (response.success && response.data) {
        setResults(retainSourceBackedDeliveries(response.data, 'search'));
      } else {
        logs.error('[delivery-schedules] search response missing data', {
          success: response.success,
        });
        setError('Search failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logs.error('[delivery-schedules] search failed', {error: err});
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [triggerSearch]);

  return { results, loading, error, search };
}
