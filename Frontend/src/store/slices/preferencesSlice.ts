import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type AppLanguage =
  | 'en'
  | 'hi'
  | 'ta'
  | 'te'
  | 'bn'
  | 'mr'
  | 'gu'
  | 'kn'
  | 'ml'
  | 'pa';

type PreferencesState = {
  language: AppLanguage;
  simpleModeEnabled: boolean;
  simpleModePromptPending: boolean;
};

const initialState: PreferencesState = {
  language: 'en',
  simpleModeEnabled: false,
  simpleModePromptPending: false,
};

const slice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {
    languageUpdated: (state, action: PayloadAction<AppLanguage>) => {
      state.language = action.payload;
    },
    simpleModeHydrated: (state, action: PayloadAction<boolean>) => {
      state.simpleModeEnabled = action.payload;
      state.simpleModePromptPending = action.payload;
    },
    simpleModeUpdated: (state, action: PayloadAction<boolean>) => {
      state.simpleModeEnabled = action.payload;
      state.simpleModePromptPending = action.payload;
    },
    simpleModePromptDismissed: state => {
      state.simpleModePromptPending = false;
    },
  },
});

export const preferencesReducer = slice.reducer;
export const preferencesActions = slice.actions;
