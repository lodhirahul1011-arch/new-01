import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { useEffect, useMemo } from 'react';
import React from 'react';
import { Platform, Text, TextInput } from 'react-native';
import type { AppLanguage } from '../store/slices/preferencesSlice';
import { useAppSelector } from '../store/hooks';
import { appTranslations, translateLiteral } from '../i18n/appTranslations';
import { logs } from './logs';

const en = require('../i18n/locales/en.json');
const hi = require('../i18n/locales/hi.json');
const ta = require('../i18n/locales/ta.json');
const te = require('../i18n/locales/te.json');
const bn = require('../i18n/locales/bn.json');
const mr = require('../i18n/locales/mr.json');
const gu = require('../i18n/locales/gu.json');
const kn = require('../i18n/locales/kn.json');
const ml = require('../i18n/locales/ml.json');
const pa = require('../i18n/locales/pa.json');

export const supportedLanguages: AppLanguage[] = [
  'en',
  'hi',
  'ta',
  'te',
  'bn',
  'mr',
  'gu',
  'kn',
  'ml',
  'pa',
];

const resources = {
  en: { translation: { ...en, ...appTranslations.en } },
  hi: { translation: { ...hi, ...appTranslations.hi } },
  ta: { translation: { ...ta, ...appTranslations.ta } },
  te: { translation: { ...te, ...appTranslations.te } },
  bn: { translation: { ...bn, ...appTranslations.bn } },
  mr: { translation: { ...mr, ...appTranslations.mr } },
  gu: { translation: { ...gu, ...appTranslations.gu } },
  kn: { translation: { ...kn, ...appTranslations.kn } },
  ml: { translation: { ...ml, ...appTranslations.ml } },
  pa: { translation: { ...pa, ...appTranslations.pa } },
} as const;

let literalPatchInstalled = false;
const reportedMissingTranslationKeys = new Set<string>();

const DISPLAY_ACRONYMS: Record<string, string> = {
  awb: 'AWB',
  cod: 'COD',
  id: 'ID',
  nfc: 'NFC',
  otp: 'OTP',
  pdf: 'PDF',
  qr: 'QR',
  sms: 'SMS',
};

function isTranslationKey(value: string) {
  return /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/.test(value);
}

function getReadableTranslationFallback(key: string) {
  const configuredEnglishValue = appTranslations.en[key];
  if (configuredEnglishValue) return configuredEnglishValue;
  if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(key)) return key;

  try {
    const finalSegment = key.split('.').pop() || key;
    const words = finalSegment.split(/[_-]+/).filter(Boolean);
    if (!words.length) return key;

    const fallback = words
      .map((word, index) => {
        const acronym = DISPLAY_ACRONYMS[word.toLowerCase()];
        if (acronym) return acronym;
        return index === 0
          ? `${word.charAt(0).toUpperCase()}${word.slice(1)}`
          : word;
      })
      .join(' ');

    if (!reportedMissingTranslationKeys.has(key)) {
      reportedMissingTranslationKeys.add(key);
      logs.error('[i18n] missing translation key; using readable fallback', {
        key,
        fallback,
      });
    }

    return fallback;
  } catch (error) {
    logs.error('[i18n] failed to prepare readable translation fallback', {
      key,
      error,
    });
    return key;
  }
}

function localizeDisplayText(language: AppLanguage, value: string) {
  const literal = translateLiteral(language, value);
  if (literal !== value) return literal;

  const trimmed = value.trim();
  if (!isTranslationKey(trimmed)) return value;

  const translated = i18n.t(trimmed, {
    lng: language,
    defaultValue: getReadableTranslationFallback(trimmed),
  });
  return typeof translated === 'string'
    ? value.replace(trimmed, translated)
    : value;
}

const textRenderingDefaults = {
  includeFontPadding: Platform.OS === 'android',
};

function withTextRenderingDefaults(
  props?: Record<string, unknown> | null,
  type?: unknown,
) {
  if (!props) return props;

  const nextProps = { ...props };
  nextProps.maxFontSizeMultiplier =
    typeof nextProps.maxFontSizeMultiplier === 'number'
      ? nextProps.maxFontSizeMultiplier
      : 1.15;

  if (type === Text || type === TextInput) {
    nextProps.style = [textRenderingDefaults, nextProps.style];
  }

  if (type === Text) {
    nextProps.textBreakStrategy = nextProps.textBreakStrategy || 'highQuality';
  }

  return nextProps;
}

function localizeChild(child: React.ReactNode): React.ReactNode {
  if (typeof child === 'string') {
    return localizeDisplayText(i18n.language as AppLanguage, child);
  }

  if (Array.isArray(child)) {
    return child.map(localizeChild);
  }

  return child;
}

function localizeTextProps(props?: Record<string, unknown> | null, type?: unknown) {
  const nextProps = withTextRenderingDefaults(props, type);
  if (!nextProps) return nextProps;

  if (typeof nextProps.children === 'string' || Array.isArray(nextProps.children)) {
    nextProps.children = localizeChild(nextProps.children as React.ReactNode);
  }

  if (typeof nextProps.placeholder === 'string') {
    nextProps.placeholder = localizeDisplayText(
      i18n.language as AppLanguage,
      nextProps.placeholder,
    );
  }

  return nextProps;
}

function patchRuntimeModule(
  jsxRuntime: Record<string, any>,
  methods: readonly string[],
) {
  methods.forEach(method => {
    const original = jsxRuntime?.[method];
    if (typeof original !== 'function' || original.__dvaariI18nPatched) {
      return;
    }

    const patched = function patchedJsx(
      type: unknown,
      props?: Record<string, unknown> | null,
      ...args: unknown[]
    ) {
      const nextProps =
        type === Text || type === TextInput ? localizeTextProps(props, type) : props;
      return original(type, nextProps, ...args);
    };

    patched.__dvaariI18nPatched = true;
    jsxRuntime[method] = patched;
  });
}

function patchJsxRuntime() {
  try {
    patchRuntimeModule(require('react/jsx-runtime'), ['jsx', 'jsxs']);
  } catch {
    logs.error('[i18n] failed to patch jsx runtime');
  }

  try {
    patchRuntimeModule(require('react/jsx-dev-runtime'), ['jsxDEV']);
  } catch {
    logs.error('[i18n] failed to patch jsx dev runtime');
  }
}

function installLiteralLocalizationPatch() {
  if (literalPatchInstalled) return;

  literalPatchInstalled = true;
  patchJsxRuntime();
  const originalCreateElement = React.createElement;

  (React as any).createElement = function patchedCreateElement(
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: React.ReactNode[]
  ) {
    const isTextLike = type === Text || type === TextInput;

    if (isTextLike) {
      return originalCreateElement(
        type as React.ElementType,
        localizeTextProps(props, type),
        ...children.map(localizeChild),
      );
    }

    return originalCreateElement(type as React.ElementType, props, ...children);
  };
}

function synchronizeTranslationResources() {
  try {
    supportedLanguages.forEach(language => {
      i18next.addResourceBundle(
        language,
        'translation',
        resources[language].translation,
        true,
        true,
      );
    });
    logs.info('[i18n] translation resources synchronized', {
      languages: supportedLanguages.length,
    });
  } catch (error) {
    logs.error('[i18n] failed to synchronize translation resources', error);
  }
}

if (!i18next.isInitialized) {
  i18next.use(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
    compatibilityJSON: 'v4',
  }).then(synchronizeTranslationResources).catch(error => {
    logs.error('[i18n] initialization failed', error);
  });
} else {
  synchronizeTranslationResources();
}

export const i18n = i18next;

installLiteralLocalizationPatch();
logs.info('[i18n] text rendering defaults installed', {
  maxFontSizeMultiplier: 1.15,
  includeFontPadding: Platform.OS === 'android',
});

export function translate(
  language: AppLanguage,
  key: string,
  options?: Record<string, unknown>,
) {
  const defaultValue =
    typeof options?.defaultValue === 'string'
      ? options.defaultValue
      : getReadableTranslationFallback(key);
  const value = i18n.t(key, { ...options, lng: language, defaultValue });
  return typeof value === 'string' ? translateLiteral(language, value) : value;
}

export function useAppTranslation() {
  const language = useAppSelector(state => state.preferences.language);
  const { t: i18nT } = useTranslation();

  useEffect(() => {
    if (i18n.language !== language) {
      i18n.changeLanguage(language).then(() => {
        logs.info('[i18n] language changed', { language });
      }).catch(error => {
        logs.error('[i18n] language change failed', { language, error });
      });
    }
  }, [language]);

  return useMemo(
    () => ({
      language,
      t: (key: string, options?: Record<string, unknown>) => {
        const defaultValue =
          typeof options?.defaultValue === 'string'
            ? options.defaultValue
            : getReadableTranslationFallback(key);
        const value = i18nT(key, { ...options, defaultValue });
        return typeof value === 'string'
          ? translateLiteral(language, value)
          : value;
      },
    }),
    [language, i18nT],
  );
}
