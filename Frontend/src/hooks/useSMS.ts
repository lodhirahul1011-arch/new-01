import {useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {
  consumePendingBackgroundSMS,
  fetchSMS,
  subscribeToSmsChanges,
} from '../services/sms/smsService';
import {
  loadSmsSyncState,
  getParsedSmsKey,
} from '../services/sms/smsSyncState';
import {
  explainDeliverySmsMatch,
  parseDeliverySMS,
  type ParsedDeliverySms,
} from '../utils/smsParser';
import {logs} from '../services/logs';

const INITIAL_BASELINE_LIMIT = 50;
const INCREMENTAL_LIMIT = 100;
const BACKLOG_FETCH_OVERLAP_MS = 60 * 1000;

export const useSMS = () => {
  const [data, setData] = useState<ParsedDeliverySms[]>([]);
  const isLoadingRef = useRef(false);
  const lastRunRef = useRef(0);
  const pendingForcedRefreshRef = useRef(false);
  const isBootstrappedRef = useRef(false);
  const seenSmsKeysRef = useRef<Set<string>>(new Set());
  const processedSmsKeysRef = useRef<Set<string>>(new Set());
  const latestSeenSmsDateRef = useRef(0);
  const debugEnabledRef = useRef(typeof __DEV__ !== 'undefined' && __DEV__);

  useEffect(() => {
    let isActive = true;
    let appState = AppState.currentState;
    const debugEnabled = debugEnabledRef.current;

    const getItemKey = (item: ParsedDeliverySms) => getParsedSmsKey(item);

    const mergeParsed = (
      current: ParsedDeliverySms[],
      incoming: ParsedDeliverySms[],
    ) => {
      const map = new Map<string, ParsedDeliverySms>();

      [...incoming, ...current].forEach(item => {
        map.set(getItemKey(item), item);
      });

      return Array.from(map.values()).sort(
        (a, b) => (b.smsDate ?? 0) - (a.smsDate ?? 0),
      );
    };

    const getLatestSmsDate = (messages: Awaited<ReturnType<typeof fetchSMS>>) =>
      messages.reduce<number | null>((latest, item) => {
        const dateValue =
          typeof item.date === 'number' && Number.isFinite(item.date)
            ? item.date
            : null;
        if (dateValue == null) return latest;
        return latest == null ? dateValue : Math.max(latest, dateValue);
      }, null);

    const dedupeRawMessages = (
      messages: Awaited<ReturnType<typeof fetchSMS>>,
    ) => {
      const map = new Map<string, (typeof messages)[number]>();
      messages.forEach(item => {
        const body = typeof item.body === 'string' ? item.body : String(item.body ?? '');
        const key =
          item.address != null && item.date != null && body.length > 0
            ? `msg:${item.address}:${item.date}:${body}`
            : typeof item.id === 'string' && item.id.trim().length > 0
              ? `id:${item.id}`
              : `fallback:${item.address ?? 'unknown'}:${item.date ?? 'nodate'}:${body}`;
        map.set(key, item);
      });
      return Array.from(map.values()).sort((a, b) => {
        const aDate = typeof a.date === 'number' ? a.date : 0;
        const bDate = typeof b.date === 'number' ? b.date : 0;
        return bDate - aDate;
      });
    };

    const pickUnprocessedParsed = (items: ParsedDeliverySms[]) =>
      items.filter(item => {
        const key = getItemKey(item);
        if (processedSmsKeysRef.current.has(key)) {
          return false;
        }
        if (seenSmsKeysRef.current.has(key)) {
          return false;
        }
        seenSmsKeysRef.current.add(key);
        return true;
      });

    const bootstrap = async () => {
      if (isBootstrappedRef.current) return;

      try {
        const syncState = await loadSmsSyncState();
        processedSmsKeysRef.current = new Set(syncState.processedKeys);
        seenSmsKeysRef.current = new Set(syncState.processedKeys);

        const pendingSms = dedupeRawMessages(await consumePendingBackgroundSMS());
        let initialLatestSeen = syncState.lastProcessedAt;
        let backlogSms: Awaited<ReturnType<typeof fetchSMS>> = [];

        if (syncState.lastProcessedAt > 0) {
          backlogSms = await fetchSMS({
            since: Math.max(0, syncState.lastProcessedAt - BACKLOG_FETCH_OVERLAP_MS),
            limit: INCREMENTAL_LIMIT,
          });
        } else {
          const latestInboxSms = await fetchSMS({limit: INITIAL_BASELINE_LIMIT});
          initialLatestSeen = Math.max(
            initialLatestSeen,
            getLatestSmsDate(latestInboxSms) ?? 0,
          );
          if (debugEnabled) {
            logs.info('[useSMS] bootstrap baseline complete', {
              initialLatestSeen,
              baselineCount: latestInboxSms.length,
            });
          }
        }

        const bootstrapCandidates = dedupeRawMessages([...pendingSms, ...backlogSms]);
        latestSeenSmsDateRef.current = Math.max(
          initialLatestSeen,
          getLatestSmsDate(bootstrapCandidates) ?? 0,
        );

        const bootParsed = parseDeliverySMS(bootstrapCandidates);
        const unseenBootParsed = pickUnprocessedParsed(bootParsed);
        setData(unseenBootParsed.sort((a, b) => (b.smsDate ?? 0) - (a.smsDate ?? 0)));
        isBootstrappedRef.current = true;

        if (debugEnabled) {
          logs.info('[useSMS] bootstrap complete', {
            lastProcessedAt: syncState.lastProcessedAt,
            pendingSms: pendingSms.length,
            backlogSms: backlogSms.length,
            bootParsed: bootParsed.length,
            unseenBootParsed: unseenBootParsed.length,
          });
        }
      } catch (error) {
        isBootstrappedRef.current = true;
        if (debugEnabled) {
          logs.error('[useSMS] bootstrap failed', error);
        }
      }
    };

    const refresh = async (force = false) => {
      if (!isBootstrappedRef.current) {
        await bootstrap();
      }
      if (isLoadingRef.current) {
        if (force) {
          pendingForcedRefreshRef.current = true;
          if (debugEnabled) {
            logs.info('[useSMS] refresh queued while loading');
          }
        }
        return;
      }
      const now = Date.now();
      if (!force && now - lastRunRef.current < 750) return;

      isLoadingRef.current = true;
      lastRunRef.current = now;
      try {
        if (debugEnabled) {
          logs.info('[useSMS] refresh start', {force});
        }

        const pendingSms = dedupeRawMessages(await consumePendingBackgroundSMS());
        const since =
          latestSeenSmsDateRef.current > 0
            ? Math.max(0, latestSeenSmsDateRef.current - 1000)
            : undefined;
        const sms = await fetchSMS(
          since != null ? {since, limit: INCREMENTAL_LIMIT} : {limit: 20},
        );
        const combined = dedupeRawMessages([...pendingSms, ...sms]);
        const latestFetchedDate = getLatestSmsDate(combined);
        if (latestFetchedDate != null) {
          latestSeenSmsDateRef.current = Math.max(
            latestSeenSmsDateRef.current,
            latestFetchedDate,
          );
        }

        if (debugEnabled) {
          logs.info('[useSMS] refresh fetched sms', {
            smsCount: sms.length,
            pendingCount: pendingSms.length,
            combinedCount: combined.length,
            since,
          });
          combined.slice(0, 5).forEach((item, index) => {
            const body =
              typeof item.body === 'string' ? item.body : String(item.body ?? '');
            const match = explainDeliverySmsMatch(body);
            logs.info('[useSMS] sms sample', {
              index,
              id: item.id ?? null,
              address: item.address ?? null,
              date: item.date ?? null,
              match,
              bodyPreview: body.slice(0, 180),
            });
          });
        }

        const parsed = parseDeliverySMS(combined);
        const unseenParsed = pickUnprocessedParsed(parsed);

        if (debugEnabled) {
          logs.info('[useSMS] refresh parsed', {
            parsed: parsed.length,
            unseenParsed: unseenParsed.length,
            latestSeenSmsDate: latestSeenSmsDateRef.current,
          });
        }
        if (isActive && unseenParsed.length > 0) {
          setData(current => mergeParsed(current, unseenParsed));
        }
      } finally {
        isLoadingRef.current = false;
        if (pendingForcedRefreshRef.current) {
          pendingForcedRefreshRef.current = false;
          void refresh(true);
        }
      }
    };

    void bootstrap();

    const unsubscribeSms = subscribeToSmsChanges(() => {
      if (debugEnabled) {
        logs.info('[useSMS] native smsChanged', {appState});
      }
      if (appState === 'active') {
        void refresh(true);
      }
    });

    const subscription = AppState.addEventListener('change', nextState => {
      appState = nextState;
      if (debugEnabled) {
        logs.info('[useSMS] AppState changed', {nextState});
      }
      if (nextState === 'active') {
        void refresh(true);
      }
    });

    const interval = setInterval(() => {
      if (debugEnabled) {
        logs.info('[useSMS] poll tick', {appState});
      }
      if (appState === 'active') {
        void refresh();
      }
    }, 5_000);

    return () => {
      isActive = false;
      unsubscribeSms();
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  return data;
};
