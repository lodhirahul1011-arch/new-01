import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
} from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { SvgProps } from 'react-native-svg';

import HomeStack from './stacks/HomeStack';
import MembersStack from './stacks/MembersStack';
import DeliveryStack from './stacks/DeliveryStack';
import AnalyticsStack from './stacks/AnalyticsStack';
import SettingsStack from './stacks/SettingsStack';
import HomeActiveSvg from '../../assets/icons/tabs/Home.svg';
import HomeOutlineSvg from '../../assets/icons/tabs/Home-outline.svg';
import MembersActiveSvg from '../../assets/icons/tabs/Members.svg';
import MembersOutlineSvg from '../../assets/icons/tabs/Members-outline.svg';
import DeliveryActiveSvg from '../../assets/icons/tabs/Delivery.svg';
import DeliveryOutlineSvg from '../../assets/icons/tabs/Delivery-outline.svg';
import AnalyticsActiveSvg from '../../assets/icons/tabs/analytics.svg';
import AnalyticsOutlineSvg from '../../assets/icons/tabs/analytics-outiline.svg';
import SettingsActiveSvg from '../../assets/icons/tabs/settings.svg';
import SettingsOutlineSvg from '../../assets/icons/tabs/settings-outline.svg';
import {
  getNotificationInboxItems,
  markNotificationInboxItemsReadByTypes,
  subscribeToNotificationInbox,
} from '../../services/notifications/notificationInbox';
import { useAppTranslation } from '../../services/i18n';
import { logs } from '../../services/logs';

export type MainTabsParamList = {
  HomeStack: undefined;
  MembersStack: undefined;
  DeliveryStack: undefined;
  AnalyticsStack: undefined;
  SettingsStack: undefined;
};

const ACTIVE_COLOR = '#2362EB';
const INACTIVE_COLOR = '#111111';
const TAB_PRESS_COLOR = '#EAF1FF';

const Tab = createBottomTabNavigator<MainTabsParamList>();
const TabPressContext = React.createContext(false);

type TabIconConfig = {
  active: React.ComponentType<SvgProps>;
  inactive: React.ComponentType<SvgProps>;
  labelKey: string;
  width: number;
  height: number;
};

const TAB_ICONS: Record<keyof MainTabsParamList, TabIconConfig> = {
  HomeStack: {
    active: HomeActiveSvg,
    inactive: HomeOutlineSvg,
    labelKey: 'tab_home',
    width: 78,
    height: 59,
  },
  MembersStack: {
    active: MembersActiveSvg,
    inactive: MembersOutlineSvg,
    labelKey: 'tab_members',
    width: 78,
    height: 59,
  },
  DeliveryStack: {
    active: DeliveryActiveSvg,
    inactive: DeliveryOutlineSvg,
    labelKey: 'tab_delivery',
    width: 78,
    height: 59,
  },
  AnalyticsStack: {
    active: AnalyticsActiveSvg,
    inactive: AnalyticsOutlineSvg,
    labelKey: 'tab_analytics',
    width: 78,
    height: 59,
  },
  SettingsStack: {
    active: SettingsActiveSvg,
    inactive: SettingsOutlineSvg,
    labelKey: 'tab_settings',
    width: 78,
    height: 59,
  },
};

const SETTINGS_SCREENS_WITH_HIDDEN_TAB = new Set(['EditProfile', 'LinkedDevices']);
const DELIVERY_SCREENS_WITH_HIDDEN_TAB = new Set(['DeliveryDetails']);
const HOME_SCREENS_WITH_HIDDEN_TAB = new Set(['NotificationsInbox']);
const DELIVERY_BADGE_TYPES = new Set([
  'upcoming_delivery_scheduled',
  'delivery_boy_at_door',
]);

function TabBarButton(props: BottomTabBarButtonProps) {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <PlatformPressable
      {...props}
      android_ripple={{ color: 'transparent', borderless: false }}
      pressColor="transparent"
      pressOpacity={1}
      onPressIn={event => {
        setIsPressed(true);
        props.onPressIn?.(event);
      }}
      onPressOut={event => {
        setIsPressed(false);
        props.onPressOut?.(event);
      }}
      style={[props.style, styles.tabButton]}
    >
      <TabPressContext.Provider value={isPressed}>
        {props.children}
      </TabPressContext.Provider>
    </PlatformPressable>
  );
}

function renderTabBarButton(props: BottomTabBarButtonProps) {
  return <TabBarButton {...props} />;
}

function TabIcon({
  routeName,
  focused,
  showDeliveryDot,
}: {
  routeName: keyof MainTabsParamList;
  focused: boolean;
  showDeliveryDot?: boolean;
}) {
  const isPressed = React.useContext(TabPressContext);
  const { t } = useAppTranslation();
  const icon = TAB_ICONS[routeName];
  const SvgIcon = focused ? icon.active : icon.inactive;
  const shouldShowDot = routeName === 'DeliveryStack' && showDeliveryDot;

  return (
    <View style={styles.tabContent}>
      <View style={[styles.iconClip, isPressed && styles.iconClipPressed]}>
        <SvgIcon
          width={icon.width}
          height={icon.height}
          color={focused ? ACTIVE_COLOR : INACTIVE_COLOR}
          style={styles.clippedSvg}
        />
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.76}
        style={[styles.tabLabel, focused && styles.tabLabelActive]}
      >
        {t(icon.labelKey)}
      </Text>
      {shouldShowDot ? <View style={styles.deliveryBadgeDot} /> : null}
    </View>
  );
}

export default function MainTabs() {
  const { t } = useAppTranslation();
  const [showDeliveryDot, setShowDeliveryDot] = useState(false);

  useEffect(() => {
    const syncDeliveryBadgeDot = async () => {
      const items = await getNotificationInboxItems();
      const hasUnreadDeliveryNotification = items.some(
        item => !item.read && DELIVERY_BADGE_TYPES.has(String(item.type || '')),
      );
      setShowDeliveryDot(hasUnreadDeliveryNotification);
    };

    syncDeliveryBadgeDot().catch(error => {
      logs.error('[MainTabs] failed to sync initial delivery badge', { error });
    });
    const unsubscribe = subscribeToNotificationInbox(() => {
      syncDeliveryBadgeDot().catch(error => {
        logs.error('[MainTabs] failed to sync delivery badge', { error });
      });
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    logs.info('[MainTabs] centered navigation icon touch highlight enabled');
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabBarItem,
        tabBarButton: renderTabBarButton,
        tabBarIcon: ({ focused }) => (
          <TabIcon
            routeName={route.name as keyof MainTabsParamList}
            focused={focused}
            showDeliveryDot={showDeliveryDot}
          />
        ),
      })}
    >
      <Tab.Screen
        name="HomeStack"
        component={HomeStack}
        options={({ route }) => {
          const focusedRouteName = getFocusedRouteNameFromRoute(route) ?? 'Home';
          const shouldHideTab = HOME_SCREENS_WITH_HIDDEN_TAB.has(focusedRouteName);

          return {
            title: t('tab_home'),
            tabBarStyle: shouldHideTab
              ? { ...styles.tabBar, display: 'none' }
              : styles.tabBar,
          };
        }}
      />
      <Tab.Screen
        name="MembersStack"
        component={MembersStack}
        options={{ title: t('tab_members') }}
      />
      <Tab.Screen
        name="DeliveryStack"
        component={DeliveryStack}
        options={({ route }) => {
          const focusedRouteName =
            getFocusedRouteNameFromRoute(route) ?? 'DeliveryHome';
          const shouldHideTab = DELIVERY_SCREENS_WITH_HIDDEN_TAB.has(
            focusedRouteName,
          );

          return {
            title: t('tab_delivery'),
            tabBarStyle: shouldHideTab
              ? { ...styles.tabBar, display: 'none' }
              : styles.tabBar,
          };
        }}
        listeners={{
          focus: () => {
            setShowDeliveryDot(false);
            markNotificationInboxItemsReadByTypes(
              Array.from(DELIVERY_BADGE_TYPES),
            ).catch(() => undefined);
          },
        }}
      />
      <Tab.Screen
        name="AnalyticsStack"
        component={AnalyticsStack}
        options={{ title: t('tab_analytics') }}
      />
      <Tab.Screen
        name="SettingsStack"
        component={SettingsStack}
        options={({ route }) => {
          const focusedRouteName =
            getFocusedRouteNameFromRoute(route) ?? 'SettingsHome';
          const shouldHideTab = SETTINGS_SCREENS_WITH_HIDDEN_TAB.has(
            focusedRouteName,
          );

          return {
            title: t('tab_settings'),
            tabBarStyle: shouldHideTab
              ? { ...styles.tabBar, display: 'none' }
              : styles.tabBar,
          };
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 80,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  tabBarItem: {
    paddingTop: 0,
    transform: [{ translateY: 10 }],
  },
  tabButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  tabContent: {
    width: 78,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconClip: {
    width: 36,
    height: 36,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconClipPressed: {
    borderRadius: 12,
    backgroundColor: TAB_PRESS_COLOR,
  },
  clippedSvg: {
    position: 'absolute',
    left: -21,
    top: -7,
    transform: [{ scale: 1.12 }],
  },
  tabLabel: {
    marginTop: 1,
    width: 76,
    color: INACTIVE_COLOR,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  tabLabelActive: {
    color: ACTIVE_COLOR,
    fontWeight: '700',
  },
  deliveryBadgeDot: {
    position: 'absolute',
    top: 12,
    right: 18,
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});
