import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser } from '../../services/api/authApi';

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isBootstrapped: boolean;
};

const initialState: AuthState = {
  accessToken: null,
  refreshToken: null,
  user: null,
  isBootstrapped: false,
};

const slice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signedIn: (
      state,
      action: PayloadAction<{
        accessToken: string;
        refreshToken: string;
        user: AuthUser;
      }>,
    ) => {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.user = action.payload.user;
      state.isBootstrapped = true;
    },

    tokensUpdated: (
      state,
      action: PayloadAction<{
        accessToken: string;
        refreshToken: string;
      }>,
    ) => {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
    },

    userUpdated: (state, action: PayloadAction<AuthUser>) => {
      state.user = action.payload;
    },

    restoredTokens: (
      state,
      action: PayloadAction<{
        accessToken: string | null;
        refreshToken: string | null;
      }>,
    ) => {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
    },

    bootstrapCompleted: state => {
      state.isBootstrapped = true;
    },

    signedOut: state => {
      state.accessToken = null;
      state.refreshToken = null;
      state.user = null;
      state.isBootstrapped = true;
    },
  },
});

export const authReducer = slice.reducer;
export const authActions = slice.actions;