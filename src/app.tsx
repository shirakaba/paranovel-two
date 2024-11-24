import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { RootStack } from './navigation';
import React, { useEffect } from 'react';
import { DatabaseProvider } from '../utils/DatabaseProvider';

import { useColorScheme } from '@/hooks/useColorScheme';
import { LibraryProvider } from '@/hooks/useLibrary';
import { NavigationContainer } from '@react-navigation/native';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function App() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <DatabaseProvider>
        <ThemeProvider
          value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <LibraryProvider>
            <NavigationContainer>
              <RootStack />
            </NavigationContainer>
          </LibraryProvider>
        </ThemeProvider>
      </DatabaseProvider>
    </QueryClientProvider>
  );
}
