import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { RootStackParamList } from './navigation.types';

export default function TableOfContents({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'ToC'>) {
  const params = route.params;
  const { hrefs, labels, ...backParams } = params;

  const hrefsSplit = useMemo(() => hrefs.split(','), [hrefs]);
  const labelsSplit = useMemo(() => labels.split(','), [labels]);

  useEffect(() => {
    navigation.setOptions({ headerTitle: params.headerTitle });
  }, [params.headerTitle]);

  return (
    <ScrollView>
      <View style={style.list}>
        {hrefsSplit.map((href, i) => {
          const label = labelsSplit[i];
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
