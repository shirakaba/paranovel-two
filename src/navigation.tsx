import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BookScreen from './book-screen';
import LibraryScreen from './library-screen';
import ToCScreen from './toc-screen';
import type { RootStackParamList } from './navigation.types';

export const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootStack() {
  return (
    <Stack.Navigator initialRouteName="Library">
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
