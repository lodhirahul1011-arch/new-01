import { StyleSheet } from 'react-native';
import { Colors, Radius, FontSize } from './index';

export const CommonStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  authHeader: {
    height: 190,
    backgroundColor: Colors.primaryBlueDark,
    paddingHorizontal: 18,
    paddingTop: 26,
    justifyContent: 'flex-start',
  },

  authHeaderTitle: {
    color: Colors.white,
    fontSize: FontSize.xxl,
    fontWeight: '800',
    marginBottom: 6,
  },

  authHeaderSubtitle: {
    color: '#E5E7EB',
    fontSize: FontSize.sm,
    lineHeight: 18,
  },

  authCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    marginTop: -40,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    overflow: 'hidden',
  },

  authCardContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
  },

  sectionTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 14,
  },

  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: '600',
  },

  input: {
    height: 42,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },

  errorText: {
    marginTop: 10,
    color: Colors.danger,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  primaryButton: {
    marginTop: 14,
    height: 42,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryButtonDisabled: {
    backgroundColor: '#9BB7F0',
  },

  primaryButtonText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
  },

  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
