// Isolated visual-review entry. This module is never imported by the release entry.
import React from 'react';
import { registerRootComponent } from 'expo';
import { useFonts } from 'expo-font';
import { ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DesignProvider } from '../src/ui';
import { Shell } from '../App';
import type { Route } from '../src/types';

function ReviewApp() {
  const [loaded] = useFonts({
    CompanionInter400: require('../assets/fonts/CompanionInter400.ttf'),
    CompanionInter650: require('../assets/fonts/CompanionInter650.ttf'),
    CompanionInter800: require('../assets/fonts/CompanionInter800.ttf'),
  });
  let initialRoute: Route = { name: 'games' };
  try {
    const query = new URLSearchParams((globalThis as any).location?.search || '');
    initialRoute = { name: query.get('screen') || 'games', params: JSON.parse(query.get('params') || '{}') };
  } catch { /* Malformed review URL returns to the main tab. */ }
  if (!loaded) return <ActivityIndicator />;
  return <SafeAreaProvider><DesignProvider><Shell initialRoute={initialRoute} /></DesignProvider></SafeAreaProvider>;
}
registerRootComponent(ReviewApp);
