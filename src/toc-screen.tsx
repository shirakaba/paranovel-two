import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
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

  // TODO: check whether navigation.setOptions should be set in render or effect
  navigation.setOptions({ headerTitle: params.headerTitle });

  const { hrefs, labels, ...backParams } = params;

  if (!hrefs || !labels) {
    return (
      <View>
        <Text>Missing 'href' and/or 'label' params.</Text>
      </View>
    );
  }

  const hrefsSplit = useMemo(() => hrefs.split(','), [hrefs]);
  const labelsSplit = useMemo(() => labels.split(','), [labels]);

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
