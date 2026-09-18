import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ArrowSvg from '../../assets/icons/blue-header/arrow-left.svg';
import { logs } from '../../services/logs';

type Props = {
  title: string;
  subtitle?: string;
  onBackPress?: () => void;
  right?: React.ReactNode;
  leftAligned?: boolean;
  titleSize?: number;

  // existing behavior
  large?: boolean;

  // new: use for detail screens like recordings/security
  compact?: boolean;
};

export default function BlueHeader({
  title,
  subtitle,
  onBackPress,
  right,
  leftAligned = false,
  titleSize,
  large = true,
  compact = false,
}: Props) {
  const useLarge = large && !compact;
  const insets = useSafeAreaInsets();
  const androidInset =
    Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;
  const rawTopInset = insets.top || androidInset;
  const maxTopInset = Platform.OS === 'ios' ? 54 : 32;
  const topInset = Math.min(Math.max(rawTopInset, 0), maxTopInset);

  const paddingTop = topInset + (useLarge ?5 : 12);
  const paddingBottom = useLarge ? 10 : 14;

  useEffect(() => {
    logs.info('[BlueHeader] text-safe header layout applied', {
      compact,
      large: useLarge,
    });
  }, [compact, useLarge]);

  return (
    <View
      style={[
        styles.header,
        { paddingTop, paddingBottom },
      ]}
    >
      <StatusBar barStyle="light-content" backgroundColor="#2563EB" />

      <View style={styles.row}>
        {onBackPress ? (
          <Pressable onPress={onBackPress} hitSlop={10} style={styles.backBtn}>
            <ArrowSvg width={22} height={22} />
          </Pressable>
        ) : leftAligned ? (
          <View style={styles.leftAlignedSpacer} />
        ) : (
          <View style={styles.backSpacer} />
        )}

        <View style={[styles.center, leftAligned && styles.centerLeftAligned]}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            style={[
              styles.title,
              compact ? styles.titleCompact : styles.titleLarge,
              leftAligned && styles.titleLeftAligned,
              typeof titleSize === 'number' ? { fontSize: titleSize } : null,
            ]}
          >
            {title}
          </Text>

          {!!subtitle && (
            <Text
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.86}
              style={[styles.subtitle, compact && styles.subtitleCompact]}
            >
              {subtitle}
            </Text>
          )}
        </View>

        <View style={styles.right}>
          {right ?? <View style={styles.backSpacer} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    minHeight: 104,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backTextCompact: {
    fontSize: 26,
    lineHeight: 26,
  },

  backSpacer: {
    width: 45,
    height: 45,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
  },

  centerLeftAligned: {
    alignItems: 'flex-start',
  },

  title: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  titleLeftAligned: {
    textAlign: 'left',
  },

  titleLarge: {
    fontSize: 26,
    lineHeight: 36,
  },

  titleCompact: {
    fontSize: 26,
    lineHeight: 36,
  },

  subtitle: {
    marginTop: 4,
    color: '#DBEAFE',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },

  subtitleCompact: {
    fontSize: 12,
    lineHeight: 19,
    fontWeight: '600',
  },

  right: {
    minWidth: 45,
    alignItems: 'flex-end',
    marginLeft: 10,
  },

  leftAlignedSpacer: {
    width: 0,
    height: 45,
  },
});
