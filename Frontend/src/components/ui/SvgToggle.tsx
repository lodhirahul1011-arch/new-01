import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { SvgProps } from 'react-native-svg';

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  activeIcon: React.ComponentType<SvgProps>;
  inactiveIcon: React.ComponentType<SvgProps>;
  disabled?: boolean;
  style?: ViewStyle;
};

export default function SvgToggle({
  value,
  onValueChange,
  activeIcon: ActiveIcon,
  inactiveIcon: InactiveIcon,
  disabled = false,
  style,
}: Props) {
  const Icon = value ? ActiveIcon : InactiveIcon;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onValueChange(!value)}
      style={[styles.button, style]}
    >
      <Icon width={44} height={24} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
