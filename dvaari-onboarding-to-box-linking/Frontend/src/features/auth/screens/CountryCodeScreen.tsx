import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import CountryPicker from '../../../components/country/CountryPicker';
import type { Country } from '../data/countries';

type Props = NativeStackScreenProps<RootStackParamList, 'CountryCode'>;

// Thin wrapper: the screen itself is the shared CountryPicker (Figma 850:3551).
// The auth flow and the members flow used to carry two separate, differently
// styled country lists; they are now the same screen with different callers.
export default function CountryCodeScreen({ navigation, route }: Props) {
  const returnTo = route.params?.returnTo ?? 'Login';

  const onSelect = (country: Country) => {
    navigation.navigate({
      name: returnTo,
      params: { selectedCountryIso2: country.iso2 },
      merge: true,
    });
  };

  const onBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate(returnTo);
  };

  return <CountryPicker onSelect={onSelect} onBack={onBack} />;
}
