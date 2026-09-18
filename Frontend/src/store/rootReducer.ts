import { combineReducers } from '@reduxjs/toolkit';
import { authReducer } from './slices/authSlice';
import { deliveryReducer } from './slices/deliverySlice';
import { authApi } from '../services/api/authApi';
import { awayModeApi } from '../services/api/awayModeApi';
import { membersApi } from '../services/api/membersApi';
import { nfcApi } from '../services/api/nfcApi';
import { deviceSetupApi } from '../services/api/deviceSetupApi';
import { notificationsApi } from '../services/api/notificationsApi';
import { preferencesReducer } from './slices/preferencesSlice';

export const rootReducer = combineReducers({
  auth: authReducer,
  delivery: deliveryReducer,
  preferences: preferencesReducer,
  [authApi.reducerPath]: authApi.reducer,
  [awayModeApi.reducerPath]: awayModeApi.reducer,
  [membersApi.reducerPath]: membersApi.reducer,
  [nfcApi.reducerPath]: nfcApi.reducer,
  [deviceSetupApi.reducerPath]: deviceSetupApi.reducer,
  [notificationsApi.reducerPath]: notificationsApi.reducer,
});
