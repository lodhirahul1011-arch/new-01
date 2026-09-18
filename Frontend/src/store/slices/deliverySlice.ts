import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { DeliverySchedule } from '../../services/api/smsDeliveryService';

export type DeliveryState = {
  upcoming: {
    data: DeliverySchedule[];
    loading: boolean;
    error: string | null;
    total: number;
    skip: number;
    limit: number;
  };
  history: {
    data: DeliverySchedule[];
    loading: boolean;
    error: string | null;
    total: number;
    skip: number;
    limit: number;
  };
  selected: DeliverySchedule | null;
  stats: {
    totalSms: number;
    upcoming: number;
    delivered: number;
    failed: number;
    byCompany: Record<string, number>;
  } | null;
  lastRefresh: number | null;
};

const initialState: DeliveryState = {
  upcoming: {
    data: [],
    loading: false,
    error: null,
    total: 0,
    skip: 0,
    limit: 50,
  },
  history: {
    data: [],
    loading: false,
    error: null,
    total: 0,
    skip: 0,
    limit: 50,
  },
  selected: null,
  stats: null,
  lastRefresh: null,
};

const slice = createSlice({
  name: 'delivery',
  initialState,
  reducers: {
    // Upcoming deliveries
    upcomingLoadingStarted: state => {
      state.upcoming.loading = true;
      state.upcoming.error = null;
    },

    upcomingLoaded: (
      state,
      action: PayloadAction<{
        data: DeliverySchedule[];
        total: number;
        skip: number;
        limit: number;
      }>,
    ) => {
      state.upcoming.data = action.payload.data;
      state.upcoming.total = action.payload.total;
      state.upcoming.skip = action.payload.skip;
      state.upcoming.limit = action.payload.limit;
      state.upcoming.loading = false;
      state.lastRefresh = Date.now();
    },

    upcomingLoadingFailed: (state, action: PayloadAction<string>) => {
      state.upcoming.error = action.payload;
      state.upcoming.loading = false;
    },

    upcomingUpdated: (state, action: PayloadAction<DeliverySchedule>) => {
      const index = state.upcoming.data.findIndex(d => d._id === action.payload._id);
      if (index !== -1) {
        state.upcoming.data[index] = action.payload;
        state.lastRefresh = Date.now();
      }
    },

    // History
    historyLoadingStarted: state => {
      state.history.loading = true;
      state.history.error = null;
    },

    historyLoaded: (
      state,
      action: PayloadAction<{
        data: DeliverySchedule[];
        total: number;
        skip: number;
        limit: number;
      }>,
    ) => {
      state.history.data = action.payload.data;
      state.history.total = action.payload.total;
      state.history.skip = action.payload.skip;
      state.history.limit = action.payload.limit;
      state.history.loading = false;
    },

    historyLoadingFailed: (state, action: PayloadAction<string>) => {
      state.history.error = action.payload;
      state.history.loading = false;
    },

    // Selected delivery
    deliverySelected: (state, action: PayloadAction<DeliverySchedule>) => {
      state.selected = action.payload;
    },

    deliveryDeselected: state => {
      state.selected = null;
    },

    // Stats
    statsLoaded: (
      state,
      action: PayloadAction<{
        totalSms: number;
        upcoming: number;
        delivered: number;
        failed: number;
        byCompany: Record<string, number>;
      }>,
    ) => {
      state.stats = {
        totalSms: action.payload.totalSms,
        upcoming: action.payload.upcoming,
        delivered: action.payload.delivered,
        failed: action.payload.failed,
        byCompany: action.payload.byCompany,
      };
    },

    // Reset
    resetDeliveries: state => {
      state.upcoming = { ...initialState.upcoming };
      state.history = { ...initialState.history };
      state.selected = null;
      state.stats = null;
      state.lastRefresh = null;
    },
  },
});

export const deliveryReducer = slice.reducer;
export const deliveryActions = slice.actions;
