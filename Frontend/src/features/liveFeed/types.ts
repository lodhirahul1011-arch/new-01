export type TabletIceCandidate = {
  from: 'tablet' | 'mobile';
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number | null;
  createdAt?: string;
};

export type TabletLiveFeedCall = {
  id: string;
  type: 'live_feed' | string;
  state: string;
  liveVideoRequested?: boolean;
  callStartedAt?: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  updatedAt?: string;
};

export type TabletLiveFeedSignaling = {
  callId: string;
  type: 'live_feed' | string;
  state: string;
  offerSdp: string;
  answerSdp: string;
  offerCreatedAt?: string | null;
  answerCreatedAt?: string | null;
  iceCandidates: TabletIceCandidate[];
  updatedAt?: string;
};

export type TabletLiveFeedTablet = {
  id?: string;
  deviceId?: string;
  name?: string;
  displayName?: string;
  onlineStatus?: string;
  lastSeenAt?: string | null;
  linkedHomeId?: string | null;
};

export type TabletLiveFeedSession = {
  status:
    | 'no_tablet_linked'
    | 'tablet_offline'
    | 'tablet_ready'
    | 'session_paused'
    | 'session_active';
  tablet?: TabletLiveFeedTablet | null;
  call?: TabletLiveFeedCall | null;
  signaling?: TabletLiveFeedSignaling | null;
};

export type TabletSignalPayload = {
  signalType: 'offer' | 'answer' | 'ice_candidate';
  sdp?: string;
  candidate?: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
};

export type LiveFeedViewerState =
  | 'idle'
  | 'starting'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'offline'
  | 'unavailable'
  | 'error';
