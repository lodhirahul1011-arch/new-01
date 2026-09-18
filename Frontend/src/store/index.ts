import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from './rootReducer';
import { authApi } from '../services/api/authApi';
import { awayModeApi } from '../services/api/awayModeApi';
import { membersApi } from '../services/api/membersApi';
import { nfcApi } from '../services/api/nfcApi';
import { deviceSetupApi } from '../services/api/deviceSetupApi';
import { notificationsApi } from '../services/api/notificationsApi';

export const store = configureStore({
  reducer: rootReducer,
  middleware: getDefault =>
    getDefault().concat(
      authApi.middleware,
      awayModeApi.middleware,
      membersApi.middleware,
      nfcApi.middleware,
      deviceSetupApi.middleware,
      notificationsApi.middleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
