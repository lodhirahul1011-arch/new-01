import { API_BASE_URL } from '../../config/env';

type TabletRealtimeEvent = {
  id?: string;
  event: string;
  data: any;
};

type SubscribeOptions = {
  accessToken: string;
  onEvent: (event: TabletRealtimeEvent) => void;
  onError?: (error: string) => void;
};

function parseEventBlock(block: string): TabletRealtimeEvent | null {
  const lines = block.split(/\r?\n/);
  let id = '';
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue;
    }

    if (line.startsWith('id:')) {
      id = line.slice(3).trim();
      continue;
    }

    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message';
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  const rawData = dataLines.join('\n');
  try {
    return {
      id,
      event,
      data: JSON.parse(rawData),
    };
  } catch {
    return {
      id,
      event,
      data: rawData,
    };
  }
}

export function subscribeToUserTabletEvents({
  accessToken,
  onEvent,
  onError,
}: SubscribeOptions) {
  const xhr = new XMLHttpRequest();
  let closed = false;
  let buffer = '';
  let processedLength = 0;

  const processIncoming = () => {
    const responseText = xhr.responseText || '';
    if (responseText.length <= processedLength) {
      return;
    }

    buffer += responseText.slice(processedLength);
    processedLength = responseText.length;

    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || '';

    parts.forEach(block => {
      const parsed = parseEventBlock(block);
      if (parsed) {
        onEvent(parsed);
      }
    });
  };

  xhr.open('GET', `${API_BASE_URL}/api/v1/tablet/realtime/events`, true);
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
  xhr.timeout = 0;

  xhr.onreadystatechange = () => {
    if (closed) {
      return;
    }

    if (xhr.readyState >= 3) {
      processIncoming();
    }

    if (xhr.readyState === 4 && !closed) {
      onError?.(`realtime_closed_${xhr.status || 0}`);
    }
  };

  xhr.onprogress = processIncoming;
  xhr.onerror = () => {
    if (!closed) {
      onError?.('realtime_network_error');
    }
  };
  xhr.send();

  return () => {
    closed = true;
    try {
      xhr.abort();
    } catch {
      // ignore abort errors
    }
  };
}
