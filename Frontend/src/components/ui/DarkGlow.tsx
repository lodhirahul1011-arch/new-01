import React from 'react';
import { Image, StyleSheet } from 'react-native';

// Rendered export of Figma's dark-mode "Ellipse 19" glow (node 204:2734),
// reused as a shared ambient-background motif across the dark theme (same
// component instance in Figma across every Onboarding frame). Natural size
// at scale 1 is the full 360-wide canvas by 227.67 tall — react-native-svg
// can't reliably reproduce Figma's feGaussianBlur filter on Android, which
// is why this is a raster asset, not a recreated SVG gradient.
const ONBOARDING_GLOW_DARK = require('../../assets/images/onboarding-glow-dark.png');
const GLOW_NATURAL_W = 360;
const GLOW_NATURAL_H = 227.67;

type Props = {
  // The screen's own width-based scale factor (width / 360).
  scale: number;
};

export default function DarkGlow({ scale }: Props) {
  return (
    <Image
      source={ONBOARDING_GLOW_DARK}
      style={[styles.glow, { width: GLOW_NATURAL_W * scale, height: GLOW_NATURAL_H * scale }]}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: -1,
  },
});
