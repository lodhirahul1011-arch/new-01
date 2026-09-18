import React from 'react';
import { TextInput, StyleSheet, TextInputProps } from 'react-native';
import { Colors, Radius } from '../../theme';

export default function AppTextInput(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="#9CA3AF"
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    height: 42,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
});