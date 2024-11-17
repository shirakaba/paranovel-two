import { Stack } from 'expo-router';
import { View, Text } from 'react-native';

export default function TableOfContents() {
  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: 'Table of Contents',
        }}
      />
      <View>
        <Text>TODO</Text>
      </View>
    </>
  );
}
