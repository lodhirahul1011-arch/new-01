import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BackCircleIcon from '../../assets/icons/members-v2/back-circle.svg';
import SearchIcon from '../../assets/icons/home-v2/search.svg';
import {
  countries,
  getFlagEmoji,
  type Country,
} from '../../features/auth/data/countries';
import { useCanvasScreen, useUiScale } from '../../theme/responsive';

type Props = {
  onSelect: (country: Country) => void;
  onBack: () => void;
};

// The one country picker for the whole app, so the invite form, the edit form
// and the auth phone screens cannot drift apart. Layout is the Figma "Country
// Code" frame (fileKey 0ZAjL8CnVgprbKaBMIjUqJ, node 850:3551) on a 360x812
// canvas: a #F2F2F2 page, a 26pt back disc at (18,72), a #D9D9D9 search field
// at (18,123) 323x29 r4, the "Select your Country" caption, a full-bleed rule
// at y=188, and a full-bleed #E4E4E4 list panel from y=199 with an 11pt top
// radius. Rows run on a 36pt pitch: 24x16 flag at x=18, name at x=47, dial
// code right-aligned to x=342.
//
// DELIBERATE DEVIATION: the frame sets 11-12px type. As on the other screens
// that is lifted into the app's readable band and the row pitch and flag chip
// grow with it, so the proportions hold. Structure, colours and copy are the
// frame's.
const CANVAS_W = 360;
const PAGE_BG = '#F2F2F2';
const LIST_BG = '#E4E4E4';
const SEARCH_BG = '#D9D9D9';
const INK = '#333333';

export default function CountryPicker({ onSelect, onBack }: Props) {
  const scale = useUiScale(CANVAS_W);
  const s = (n: number) => n * scale;
  const styles = useMemo(() => createStyles(scale), [scale]);
  const { contentBottomGap } = useCanvasScreen(false);

  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    // Matches the frame's placeholder ("Search by country name...") but still
    // accepts a dial code, which is how people usually look one up.
    const bare = q.replace(/^\+/, '');
    return countries.filter(
      item =>
        item.name.toLowerCase().includes(q) ||
        item.dialCode.replace('+', '').includes(bare),
    );
  }, [query]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          onPress={onBack}
        >
          <BackCircleIcon width={s(26)} height={s(26)} />
        </Pressable>

        <View style={styles.search}>
          <SearchIcon width={s(16)} height={s(16)} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by country name..."
            placeholderTextColor="rgba(51,51,51,0.7)"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>

        <Text style={styles.caption}>Select your Country</Text>
      </View>

      {/* Line 6 — runs the full width of the frame, not the padded content. */}
      <View style={styles.rule} />

      <View style={styles.listPanel}>
        <FlatList
          data={filtered}
          keyExtractor={item => item.iso2}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: contentBottomGap },
          ]}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name} ${item.dialCode}`}
              style={styles.row}
              onPress={() => onSelect(item)}
            >
              {/* The frame uses a 24x16 flag bitmap per country. There is no
                  bitmap for the full list, so this keeps the emoji the app
                  already uses, in a chip of the frame's proportions. */}
              <View style={styles.flagChip}>
                <Text style={styles.flag}>{getFlagEmoji(item.iso2)}</Text>
              </View>

              <Text numberOfLines={1} style={styles.name}>
                {item.name}
              </Text>

              <Text style={styles.dial}>{item.dialCode}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No matching country</Text>
          }
        />
      </View>
    </SafeAreaView>
  );
}

function createStyles(scale: number) {
  const s = (n: number) => n * scale;

  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: PAGE_BG },

    // Back disc at canvas y=72; the safe-area top inset already covers the
    // frame's 44pt status bar, leaving 28.
    header: {
      paddingTop: s(28),
      paddingHorizontal: s(18),
    },

    search: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: s(25),
      minHeight: s(40),
      paddingHorizontal: s(10),
      borderRadius: s(6),
      backgroundColor: SEARCH_BG,
    },

    searchInput: {
      flex: 1,
      padding: 0,
      marginLeft: s(12),
      fontFamily: 'Satoshi-Regular',
      fontSize: s(14),
      color: INK,
    },

    caption: {
      marginTop: s(14),
      marginBottom: s(9),
      fontFamily: 'Satoshi-Regular',
      fontSize: s(13),
      color: INK,
    },

    rule: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: 'rgba(0,0,0,0.18)',
    },

    // Bleeds past both edges in the frame (390 wide on a 360 canvas), so it
    // simply fills the width here and keeps the 11pt top radius.
    listPanel: {
      flex: 1,
      marginTop: s(11),
      backgroundColor: LIST_BG,
      borderTopLeftRadius: s(11),
      borderTopRightRadius: s(11),
      overflow: 'hidden',
    },

    listContent: { paddingTop: s(6) },

    // 36pt pitch in the frame, grown for the readable type.
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: s(46),
      paddingHorizontal: s(18),
    },

    // The frame's 24x16 r2.5 flag chip, scaled with the type.
    flagChip: {
      width: s(30),
      height: s(20),
      borderRadius: s(3),
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },

    flag: { fontSize: s(17) },

    // Canvas: flag ends at 42, name starts at 47.
    name: {
      flex: 1,
      marginLeft: s(11),
      fontFamily: 'Satoshi-Regular',
      fontSize: s(15),
      color: '#000000',
    },

    dial: {
      marginLeft: s(10),
      fontFamily: 'Satoshi-Regular',
      fontSize: s(15),
      color: '#000000',
    },

    empty: {
      paddingVertical: s(28),
      textAlign: 'center',
      fontFamily: 'Satoshi-Regular',
      fontSize: s(14),
      color: 'rgba(51,51,51,0.6)',
    },
  });
}
