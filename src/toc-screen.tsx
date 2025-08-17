import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef } from 'react';
import { View, Button, StyleSheet, ScrollView } from 'react-native';
import { updateBookState } from '@/utils/update-book-state';
import type { RootStackParamList } from './navigation.types';
import type { PageDetails } from './book-screen.types';

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

  const navigationLockCounterRef = useRef(0);
  const navigationLockIdRef = useRef<number>();

  return (
    <ScrollView>
      <View style={style.list}>
        {items.map(({ href, label }) => {
          return (
            <Button
              title={label}
              key={href}
              onPress={() => {
                if (typeof navigationLockIdRef.current === 'number') {
                  console.log('[toc-navigate] Navigation lock active.');
                  return;
                }

                const navigationLockId = navigationLockCounterRef.current++;
                navigationLockIdRef.current = navigationLockId;

                const pageDetails = {
                  pageType: params.pageType,
                  href,
                  label,
                } as const satisfies PageDetails;

                updateBookState({
                  loggingContext: '[toc-navigate]',
                  uniqueIdentifier: params.backParams.uniqueIdentifier,
                  pageDetails,
                })
                  .catch(error => {
                    console.error(
                      '[toc-navigate] Failed to update persisted book state, but will proceed to navigate.',
                      error,
                    );
                  })
                  .finally(() => {
                    navigationLockIdRef.current = undefined;
                    navigation.popTo('Book', {
                      ...backParams,
                      pageDetails: {
                        pageType: params.pageType,
                        href,
                        label,
                      },
                    });
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
