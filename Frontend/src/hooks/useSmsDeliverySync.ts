import {useEffect, useRef, useCallback} from 'react';
import {useSelector} from 'react-redux';
import {useSMS} from './useSMS';
import type {RootState} from '../store';
import {useReceiveDeliverySmsMutation} from '../services/api/deliveryApi';
import {getBackendMessageId, markSmsProcessed} from '../services/sms/smsSyncState';
import {logs} from '../services/logs';

const SYNC_INTERVAL = 5 * 1000;

function getSyncErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (error instanceof Error) return error.message;

  const maybeError = error as {
    status?: number | string;
    error?: string;
    data?: {message?: string; error?: string};
  };

  if (maybeError.data?.error) return maybeError.data.error;
  if (maybeError.data?.message) return maybeError.data.message;
  if (maybeError.error) return maybeError.error;
  if (maybeError.status) return `Request failed with status ${maybeError.status}`;

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

export function useSmsDeliverySync() {
  const detectedSms = useSMS();
  const [receiveDeliverySms] = useReceiveDeliverySmsMutation();
  const accessToken = useSelector((state: RootState) => state.auth?.accessToken);
  const authBootstrapped = useSelector(
    (state: RootState) => state.auth?.isBootstrapped,
  );
  const syncedIdsRef = useRef<Set<string>>(new Set());
  const lastSyncRef = useRef<number>(0);
  const syncInProgressRef = useRef<boolean>(false);
  const isInitializedRef = useRef<boolean>(false);

  const generateSmsId = useCallback(
    (
      smsId?: string | null,
      smsText?: string,
      senderPhone?: string | null,
    ): string =>
      getBackendMessageId({
        smsId,
        text: smsText,
        sender: senderPhone,
      }),
    [],
  );

  const syncSmsWithBackend = useCallback(async () => {
    if (!authBootstrapped || !accessToken) {
      return;
    }

    if (syncInProgressRef.current) {
      logs.info('[SmsSyncHook] Sync already in progress, skipping');
      return;
    }

    if (!detectedSms || detectedSms.length === 0) {
      return;
    }

    const now = Date.now();
    if (now - lastSyncRef.current < SYNC_INTERVAL) {
      return;
    }

    syncInProgressRef.current = true;
    lastSyncRef.current = now;

    try {
      let syncedCount = 0;

      for (const sms of detectedSms) {
        const smsId = generateSmsId(sms.smsId, sms.text, sms.sender);
        if (syncedIdsRef.current.has(smsId)) {
          continue;
        }

        try {
          logs.info('[SmsSyncHook] Sending SMS to backend', {
            sender: sms.sender || 'unknown',
          });
          await receiveDeliverySms({
            smsText: sms.text,
            senderPhone: sms.sender || undefined,
            messageId: smsId,
          }).unwrap();
          await markSmsProcessed(sms);
          syncedIdsRef.current.add(smsId);
          syncedCount += 1;
          logs.info('[SmsSyncHook] Synced SMS', {smsId});
        } catch (error) {
          logs.error('[SmsSyncHook] Error syncing SMS', {
            message: getSyncErrorMessage(error),
            error,
          });
        }
      }

      if (syncedCount > 0) {
        logs.info('[SmsSyncHook] Successfully synced SMS to backend', {
          syncedCount,
        });
      }
    } finally {
      syncInProgressRef.current = false;
    }
  }, [accessToken, authBootstrapped, detectedSms, generateSmsId, receiveDeliverySms]);

  useEffect(() => {
    if (!accessToken) {
      syncedIdsRef.current.clear();
      lastSyncRef.current = 0;
    }
  }, [accessToken]);

  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      logs.info('[SmsSyncHook] SMS delivery sync initialized');
    }
    if (!authBootstrapped || !accessToken) {
      return;
    }
    void syncSmsWithBackend();
  }, [accessToken, authBootstrapped, detectedSms, syncSmsWithBackend]);

  return {
    syncedCount: syncedIdsRef.current.size,
    isInitialized: isInitializedRef.current,
    manualSync: syncSmsWithBackend,
  };
}
