import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';

import {
  getStoredThemeMode,
  setStoredThemeMode,
  ThemeMode,
} from '../services/storage/themeStorage';
import { logs } from '../services/logs';

type ResolvedScheme = 'light' | 'dark';

type ThemeContextValue = {
  mode: ThemeMode;
  scheme: ResolvedScheme;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Every screen in the Splash → Onboarding → Auth → Device Setup → Permissions
// flow has its dark variant wired up (verified against Figma's Dark Mode
// Dvaari page where a frame exists, derived from the same rules elsewhere).
//
// OFF: the app runs light regardless of the device's system setting or any
// theme mode stored from the Appearance dialog.
//
// It is off because most of the app has no dark variant — the V2 screens
// (Home 857:3978, Live Feed 607:2624) are light-only in Figma, as are the
// Notification, Language, Appearance, Notification-Preferences and Device
// Customization screens added since. 42 of 53 screens have no theme hook at
// all, so with this on they render light text and surfaces unchanged on a
// dark ground.
//
// Flip to true to audit that gap — it is the only way to SEE which screens
// still lack a dark variant, and the light-only ones are expected to look
// broken while you do. Leave it false for demos and for shipping.
const DARK_MODE_ENABLED = false;

function resolveScheme(mode: ThemeMode, systemScheme: ColorSchemeName | null): ResolvedScheme {
  if (!DARK_MODE_ENABLED) return 'light';
  if (mode === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
  return mode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName | null>(
    () => Appearance.getColorScheme() ?? null,
  );

  useEffect(() => {
    getStoredThemeMode()
      .then(stored => {
        if (stored) setModeState(stored);
      })
      .catch(error => {
        logs.error('[theme] failed to restore theme mode', String(error));
      });
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme ?? null);
    });
    return () => subscription.remove();
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    setStoredThemeMode(next).catch(error => {
      logs.error('[theme] failed to persist theme mode', String(error));
    });
  };

  const scheme = resolveScheme(mode, systemScheme);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, scheme, isDark: scheme === 'dark', setMode }),
    [mode, scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
