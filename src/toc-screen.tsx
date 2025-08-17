import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { View, Button, StyleSheet, ScrollView } from 'react-native';
import { RootStackParamList } from './navigation.types';

export default function TableOfContents({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'ToC'>) {
  const params = route.params;
  const { items, backParams } = params;

  useEffect(() => {
    navigation.setOptions({
      headerTitle: params.pageType === 'spine' ? 'Spine' : 'Table of Contents',
    });
  }, [params.pageType]);

  return (
    <ScrollView>
      <View style={style.list}>
        {items.map(({ href, label }) => {
          return (
            <Button
              title={label}
              key={href}
              onPress={() => {
                navigation.popTo('Book', {
                  ...backParams,
                  pageDetails: {
                    pageType: params.pageType,
                    href,
                    label,
                  },
                });
              }}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

const style = StyleSheet.create({
  list: {},
});
