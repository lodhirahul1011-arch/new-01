import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import LogoIcon from '../../../assets/icons/common/logo-icon.svg';
import { PRIMARY_BUTTON } from '../../../theme/metrics';
import { useCanvasScreen, useUiScale } from '../../../theme/responsive';

type Props = NativeStackScreenProps<RootStackParamList, 'AskDvaariBox'>;

// Every number below is copied 1:1 from the Figma frame (fileKey
// 0ZAjL8CnVgprbKaBMIjUqJ, "Asking Dvaari Box" node 607:2568), a 360x812
// canvas. Reached right after a Dvaari device links successfully — the
// automatic jump straight into box-linking used to skip asking whether the
// user even has one. The card's own position is close enough to screen
// center that it's centered with flex instead of an absolute canvas
// coordinate, same tradeoff as the app's other overlay/dialog screens.
const CANVAS_W = 360;
// This screen is always dark (bg #040509), same as QrScannerScreen right
// before it — it's a continuation of that always-dark camera-scanning
// moment, not a themed app screen.
const BACKGROUND = '#040509';

export default function AskDvaariBox({ navigation }: Props) {
  const styles = useStyles();
  const scale = useUiScale(CANVAS_W);
  const s = (n: number) => n * scale;
  const { canvasMinHeight } = useCanvasScreen();

  const onYes = () => {
    // Connect Your DvaariBox (Figma node 414:5379) — the box's own intro and
    // instructions — then its scanner (414:5427) and success state (414:5755).
    navigation.reset({
      index: 0,
      routes: [{ name: 'DeviceSetup', params: { type: 'box', from: 'setup' } }],
    });
  };

  const onNo = () => {
    // Permissions are already requested upfront (RequestPermissions, before
    // DeviceSetup even started) — nothing left to gate on, straight to Home.
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <ScrollView
        contentContainerStyle={[styles.container, { minHeight: canvasMinHeight }]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            {
              width: s(253),
              borderRadius: s(17),
              paddingTop: s(20),
              paddingBottom: s(20),
              paddingHorizontal: s(17),
            },
          ]}
        >
          <View
            style={[
              styles.iconRing,
              { width: s(32), height: s(32), borderRadius: s(16), borderWidth: s(0.23) },
            ]}
          >
            <LogoIcon width={s(17.5469)} height={s(21)} />
          </View>

          <Text style={[styles.question, { fontSize: s(15), marginTop: s(10) }]}>
            Do You Have a <Text style={styles.questionBold}>Dvaari Box</Text>?
          </Text>

          <Pressable
            onPress={onYes}
            style={[
              styles.optionBtn,
              {
                width: s(219),
                maxWidth: '100%',
                minHeight: s(PRIMARY_BUTTON.minHeight),
                borderRadius: s(5.5),
                marginTop: s(15),
              },
            ]}
          >
            <Text style={[styles.optionText, { fontSize: s(13) }]}>Yes, I have</Text>
          </Pressable>

          <Pressable
            onPress={onNo}
            style={[
              styles.optionBtn,
              {
                width: s(219),
                maxWidth: '100%',
                minHeight: s(PRIMARY_BUTTON.minHeight),
                borderRadius: s(5.5),
                marginTop: s(9),
              },
            ]}
          >
            <Text style={[styles.optionText, { fontSize: s(13) }]}>No</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function useStyles() {
  const scale = useUiScale();
  return useMemo(() => createStyles(scale), [scale]);
}

function createStyles(_scale: number) {
  // Nothing in this sheet is dimensional — every size on this screen is
  // applied inline through the component's own scaled s() helper.
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: BACKGROUND,
    },

    // flexGrow, not flex — as a ScrollView contentContainer it has to be able
    // to exceed the viewport (and scroll) rather than being clamped to it.
    container: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    card: {
      backgroundColor: '#FFF9F9',
      alignItems: 'center',
    },

    iconRing: {
      alignItems: 'center',
      justifyContent: 'center',
      borderColor: 'rgba(34, 34, 34, 0.85)',
    },

    question: {
      textAlign: 'center',
      color: 'rgba(34, 34, 34, 0.9)',
      fontFamily: 'Satoshi-Regular',
    },

    questionBold: {
      fontFamily: 'Satoshi-Medium',
    },

    optionBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(35, 98, 235, 0.2)',
    },

    optionText: {
      color: '#000000',
      fontFamily: 'Satoshi-Regular',
    },
  });
}
