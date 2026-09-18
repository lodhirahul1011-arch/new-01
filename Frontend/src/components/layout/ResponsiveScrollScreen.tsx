import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  children: React.ReactNode;
  backgroundColor?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardAware?: boolean;
  showsVerticalScrollIndicator?: boolean;
};

export default function ResponsiveScrollScreen({
  children,
  backgroundColor = '#FFFFFF',
  contentContainerStyle,
  keyboardAware = false,
  showsVerticalScrollIndicator = false,
}: Props) {
  const { height } = useWindowDimensions();

  const content = (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { minHeight: height },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
    >
      {children}
    </ScrollView>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor }]}>
      {keyboardAware ? (
        <KeyboardAvoidingView
          style={styles.safe}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
});
