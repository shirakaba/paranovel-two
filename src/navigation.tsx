import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BookScreen from './book-screen';
import LibraryScreen from './library-screen';
import ToCScreen from './toc-screen';
import type { RootStackParamList } from './navigation.types';
import { useColorScheme } from 'react-native';

export const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootStack() {
  const scheme = useColorScheme();

  return (
    <Stack.Navigator
      initialRouteName="Library"
      screenOptions={{
        headerStyle: {
          backgroundColor: scheme === 'dark' ? '#2c2c2c' : 'white',
        },
        headerTintColor: scheme === 'dark' ? '#ababab' : 'black',
      }}>
      <Stack.Screen
        name="Library"
        component={LibraryScreen}
        options={{ headerShown: false, headerTitle: 'Library' }}
      />
      <Stack.Screen name="Book" component={BookScreen} />
      <Stack.Screen name="ToC" component={ToCScreen} />
    </Stack.Navigator>
  );
}
