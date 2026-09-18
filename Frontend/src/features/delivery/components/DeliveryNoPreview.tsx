import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {DimensionValue} from 'react-native';

import PackageIconSvg from '../../../assets/icons/home/delivery-box-01.svg';

type Props = {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  compact?: boolean;
  hero?: boolean;
};

export default function DeliveryNoPreview({
  width = '100%',
  height = '100%',
  borderRadius = 14,
  compact = false,
  hero = false,
}: Props) {
  const iconSize = hero ? 34 : compact ? 18 : 24;
  const badgeSize = hero ? 78 : compact ? 30 : 48;
  const titleSize = hero ? 18 : compact ? 8 : 12;

  return (
    <View
      style={[
        styles.container,
        {
          width,
          height,
          borderRadius,
          padding: hero ? 18 : compact ? 5 : 10,
        },
      ]}>
      <View style={styles.glowLarge} />
      <View style={styles.glowSmall} />
      <View style={styles.cornerChip} />

      <View
        style={[
          styles.badge,
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
          },
        ]}>
        <PackageIconSvg width={iconSize} height={iconSize} />
      </View>

      <Text style={[styles.title, {fontSize: titleSize}]}>No Preview</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#F4EFE7',
    borderWidth: 1,
    borderColor: '#E3D6C3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowLarge: {
    position: 'absolute',
    top: -16,
    right: -12,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E8D8C0',
  },
  glowSmall: {
    position: 'absolute',
    bottom: -18,
    left: -10,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#D9E6F3',
  },
  cornerChip: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 26,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    opacity: 0.72,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#B5966F',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  title: {
    marginTop: 8,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: '#7B6750',
    textAlign: 'center',
  },
});
