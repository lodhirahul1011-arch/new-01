import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';

type Props = {
  title: string;
  subtitle: string;
  icon: any;
  connected: boolean;
  onPress: () => void;
};

export default function EcommerceConnectCard({
  title,
  subtitle,
  icon,
  connected,
  onPress,
}: Props) {
  const IconComponent = typeof icon === 'function' ? icon : null;

  return (
    <View style={styles.appCard}>
      <View style={styles.appLeft}>
        <View style={styles.appIconBox}>
          {IconComponent ? (
            <IconComponent width={30} height={30} />
          ) : (
            <Image source={icon} style={styles.appIcon} resizeMode="contain" />
          )}
        </View>

        <View style={styles.appInfo}>
          <Text style={styles.appTitle}>{title}</Text>
          <Text style={styles.appSub}>{subtitle}</Text>
        </View>
      </View>

      <Pressable
        style={[
          styles.connectBtn,
          connected && styles.connectBtnConnected,
        ]}
        onPress={onPress}
      >
        <Text style={styles.connectBtnText}>
          {connected ? 'Connected' : 'Connect'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  appCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  appLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 14,
  },

  appIconBox: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  appIcon: {
    width: 30,
    height: 30,
  },

  appInfo: {
    flex: 1,
  },

  appTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },

  appSub: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },

  connectBtn: {
    minWidth: 100,
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#2362EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  connectBtnConnected: {
    backgroundColor: '#16A34A',
  },

  connectBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});