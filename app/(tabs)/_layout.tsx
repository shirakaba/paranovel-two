import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import {
  LibraryProvider,
  useLibrary,
  useServeLibrary,
} from '@/hooks/useLibrary';

export default function TabLayout() {
  return (
    <LibraryProvider>
      <TabsWithServedLibrary />
    </LibraryProvider>
  );
}

function TabsWithServedLibrary() {
  const colorScheme = useColorScheme();

  const result = useLibrary();
  const libraryDir = result.type === 'loaded' ? result.libraryDir : '';

  useServeLibrary(decodeURI(libraryDir.replace(/^file:\/\//, '')));

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: 'absolute',
          },
          default: {},
        }),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Library',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="books.vertical.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: 'Book',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="book.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
