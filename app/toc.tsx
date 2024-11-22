import { PopLink } from '@/components/PopLink';
import { Book } from '@/types/book.types';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View, Text, Button, StyleSheet, ScrollView } from 'react-native';

export default function TableOfContents() {
  const params = useLocalSearchParams<
    Book & {
      hrefs: string;
      labels: string;
    }
  >();

  const Screen = () => (
    <Stack.Screen options={{ headerTitle: 'Table of Contents' }} />
  );

  const { hrefs, labels, ...backParams } = params;

  if (!hrefs || !labels) {
    return (
      <>
        <Screen />
        <View>
          <Text>Missing 'href' and/or 'label' params.</Text>
        </View>
      </>
    );
  }

  const hrefsSplit = useMemo(() => hrefs.split(','), [hrefs]);
  const labelsSplit = useMemo(() => labels.split(','), [labels]);

  return (
    <>
      <Screen />
      <ScrollView>
        <View style={style.list}>
          {hrefsSplit.map((href, i) => {
            const label = labelsSplit[i];
            return (
              <PopLink
                key={href}
                popTo
                href={{
                  pathname: '/book',
                  params: {
                    ...backParams,
                    href: `${backParams.opsUri}/${href}`,
                    navigationTimestamp: `${Date.now()}`,
                  },
                }}
                asChild>
                <Button title={label} />
              </PopLink>
            );
          })}
        </View>
      </ScrollView>
    </>
  );
}

const style = StyleSheet.create({
  list: {},
});
