import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { View, Button, StyleSheet, ScrollView, Pressable } from 'react-native';
import { RootStackParamList } from './navigation.types';

export default function TableOfContents({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'ToC'>) {
  const params = route.params;
  const { items, backParams } = params;

  useEffect(() => {
    navigation.setOptions({ headerTitle: params.headerTitle });
  }, [params.headerTitle]);

  return (
    <ScrollView>
      <View style={style.list}>
        {items.map(({ href, label }) => {
          return (
            <Pressable
              key={href}
              onPress={() => {
                navigation.popTo('Book', {
                  ...backParams,
                  href: `${backParams.opsUri}/${href}`,
                  navigationTimestamp: `${Date.now()}`,
                });
              }}>
              <Button title={label} />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const style = StyleSheet.create({
  list: {},
});
