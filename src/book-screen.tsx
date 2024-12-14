import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { readAsStringAsync } from 'expo-file-system';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Button,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { IconSymbol } from '@/components/ui/IconSymbol';
import { useLibrary } from '@/hooks/useLibrary';
import { tokenize } from '@/modules/mecab';
import type { OPF, NCX } from '@/types/epub.types';
import {
  getSpineFromOpf,
  getTocFromNCX,
  parseNCX,
  parseOPF,
} from '@/utils/epub-parsing';
import type { RootStackParamList } from './navigation.types';
import injectedCss from './source-assets/injected-css.wvcss';
import mainScript from './source-assets/injected-javascript.wvjs';

export default function BookScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Book'>) {
  const params = route.params;

  const [webViewUri, setWebViewUri] = useState(params.href);
  const webViewRef = useRef<WebView>(null);

  // This hook, and the navigationTimestamp, are a crude workaround for the
  // webViewUri not updating when a sub-screen (e.g. ToC) unwinds back to this
  // screen, passing the same params.href as it the screen began with.
  useEffect(() => {
    setWebViewUri(params.href);
  }, [params.href, params.navigationTimestamp]);

  const library = useLibrary();

  const [opf, setOPF] = useState<OPF>();
  const absoluteUriToOpf = `${params.opsUri}/${params.relativePathToOpfFromOps}`;
  const absoluteUriToOpfRef = useRef(absoluteUriToOpf);
  useEffect(() => {
    // Track whether the absoluteUri gets updated while we're mid-read so that
    // we can avoid updating if so.
    const initialAbsoluteUriToOpf = absoluteUriToOpf;
    absoluteUriToOpfRef.current = absoluteUriToOpf;

    // Stop rendering the OPF from a previous book.
    setOPF(undefined);

    readAsStringAsync(initialAbsoluteUriToOpf)
      .then(opfText => {
        const opf = parseOPF(opfText);
        if (opf && initialAbsoluteUriToOpf === absoluteUriToOpfRef.current) {
          setOPF(opf);
        }
      })
      .catch(error => {
        console.error(
          `Failed to read OPF at ${initialAbsoluteUriToOpf}`,
          error,
        );
      });
  }, [absoluteUriToOpf]);

  const [ncx, setNCX] = useState<NCX>();
  const absoluteUriToNcx = params.ncxFileHref
    ? `${params.opsUri}/${params.ncxFileHref}`
    : '';
  const absoluteUriToNcxRef = useRef(absoluteUriToNcx);
  useEffect(() => {
    // Track whether the absoluteUri gets updated while we're mid-read so that
    // we can avoid updating if so.
    const initialAbsoluteUriToNcx = absoluteUriToNcx;
    absoluteUriToNcxRef.current = absoluteUriToNcx;

    // Stop rendering the NCX from a previous book.
    setNCX(undefined);

    if (!initialAbsoluteUriToNcx) {
      return;
    }

    readAsStringAsync(initialAbsoluteUriToNcx)
      .then(ncxText => {
        const ncx = parseNCX(ncxText);
        if (ncx && initialAbsoluteUriToNcx === absoluteUriToNcxRef.current) {
          setNCX(ncx);
        }
      })
      .catch(error => {
        console.error(
          `Failed to read NCX at ${initialAbsoluteUriToNcx}`,
          error,
        );
      });
  }, [absoluteUriToNcx]);

  const spine = useMemo(
    () => (opf ? getSpineFromOpf({ opf, nav: params.nav }) : undefined),
    [opf, params.nav],
  );

  const toc = useMemo(
    () =>
      params.ncxFileHref && ncx
        ? getTocFromNCX({ ncx, ncxFileHref: params.ncxFileHref })
        : undefined,
    [ncx, params.ncxFileHref],
  );

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: params.title,
      headerRight: () => {
        return (
          <>
            {/*
              Hot updates (e.g. of the `injectedJavaScript` prop) don't refresh
              the WebView, so it's handy during development to just be able to
              force a refresh on demand.
            */}
            {__DEV__ && (
              <TouchableOpacity
                onPress={() => {
                  webViewRef.current?.reload();
                }}>
                <IconSymbol
                  name="arrow.clockwise"
                  size={22}
                  weight="medium"
                  color={'#3677F9'}
                />
              </TouchableOpacity>
            )}
            <Button
              title="Spine"
              {...(spine
                ? {
                    onPress: () =>
                      navigation.navigate('ToC', {
                        backParams: params,
                        headerTitle: 'Spine',
                        items: spine,
                      }),
                  }
                : { disabled: true })}
            />
            <Button
              title="ToC"
              {...(toc
                ? {
                    onPress: () =>
                      navigation.navigate('ToC', {
                        backParams: params,
                        headerTitle: 'Table of Contents',
                        items: toc,
                      }),
                  }
                : { disabled: true })}
            />
          </>
        );
      },
    });
  }, [navigation, params, spine, toc]);

  const onMessage = useCallback(
    ({ nativeEvent: { data } }: WebViewMessageEvent) => {
      interface LogPayload {
        type: 'log';
        message: string;
      }
      interface LookUpPayload {
        type: 'lookUpTerm';
        message: string;
      }
      interface TokenizePayload {
        type: 'tokenize';
        id: number;
        blockBaseText: string;
        offset: number;
      }
      interface NavigationRequestPayload {
        type: 'navigation-request';
        value: string;
        currentHref: string;
      }
      type Payload =
        | LogPayload
        | LookUpPayload
        | TokenizePayload
        | NavigationRequestPayload;

      let parsed: Payload;
      try {
        parsed = JSON.parse(data);
      } catch (error) {
        console.error('[WebView] error parsing message', error);
        return;
      }

      // TODO: validate

      switch (parsed.type) {
        case 'log': {
          const { message } = parsed;
          console.log(`[WebView] log: ${message}`);
          break;
        }
        case 'navigation-request': {
          if (!spine) {
            return;
          }
          const { value, currentHref } = parsed;

          // Strip off any URL params and URI fragments by converting to path.
          const currentPathname = decodeURI(new URL(currentHref).pathname);
          const currentItemIndex = spine.findIndex(({ href }) =>
            currentPathname.endsWith(href),
          );

          if (currentItemIndex === -1) {
            // This can happen when the browser transforms the URL so as to make
            // it different from the href written into the spine.
            console.log('Unable to find current page in spine');
            return;
          }
          const newIndex = currentItemIndex + (value === 'next' ? 1 : -1);
          const newPage = spine[newIndex];
          if (!newPage) {
            return;
          }

          const newUri = `${params.opsUri}/${newPage.href}`;
          console.log(`[onMessage] Setting URI to "${newUri}"`);
          setWebViewUri(`${newUri}`);
          break;
        }
        case 'tokenize': {
          const webView = webViewRef.current;
          if (!webView) {
            return;
          }

          // Gross, but just working with what react-native-webview gives me.
          const settle = (
            type: 'resolve' | 'reject',
            value: string,
            id?: number,
          ) =>
            webView.injectJavaScript(
              typeof id === 'string'
                ? `__paranovelState.tokenizationPromiseHandlers[${id}].${type}(${value});`
                : `Object.keys(__paranovelState.tokenizationPromiseHandlers).forEach(id => __paranovelState.tokenizationPromiseHandlers[id].${type}(${value}));`,
            );
          const resolve = (value: string, id?: number) =>
            settle('resolve', value, id);
          const reject = (value: string, id?: number) =>
            settle('reject', `new Error(${value})`, id);

          if (typeof parsed !== 'object') {
            return reject('"Expected message to be object"');
          }

          const { id, blockBaseText, offset: targetOffset } = parsed;
          if (typeof id !== 'number') {
            return reject('"Expected body to have id"');
          }
          if (typeof blockBaseText !== 'string') {
            return reject('"Expected body to contain blockBaseText"', id);
          }
          if (typeof targetOffset !== 'number') {
            return reject('"Expected body to contain targetOffset"', id);
          }

          const tokens = tokenize(blockBaseText);
          if (!tokens.length) {
            return reject('"Expected to produce more than 0 tokens."', id);
          }

          // MeCab always trims leading whitespace.
          const leadingWhiteSpace = /^\\s+/.exec(blockBaseText)?.[0] ?? '';
          // The user may have clicked into the middle of a token, so we want to
          // return the start offset of the token containing the clicked
          // character.
          let offsetOfTargetTokenIntoBlockBaseText = leadingWhiteSpace.length;

          for (const token of tokens) {
            const length =
              token.surface.length + (token.trailingWhitespace?.length ?? 0);

            if (offsetOfTargetTokenIntoBlockBaseText + length > targetOffset) {
              // Although 'フェルディナンド' does give a non-null lemma, it's '*'.
              const dictionaryForm =
                token.lemma && token.lemma !== '*'
                  ? token.lemma
                  : token.surface;

              return resolve(
                JSON.stringify({
                  offsetOfTargetTokenIntoBlockBaseText,
                  offsetOfTargetCharacterIntoBlockBaseText: targetOffset,
                  tokenLength: length,
                  dictionaryForm,
                }),
                id,
              );
            }

            offsetOfTargetTokenIntoBlockBaseText += length;
          }

          return reject('"Didn\'t find token"', id);
        }
      }
    },
    [spine, params.opsUri],
  );

  if (library.type !== 'loaded') {
    return null;
  }

  if (!params.opsUri) {
    return null;
  }

  return (
    <SafeAreaView style={style.container}>
      <WebView
        ref={webViewRef}
        webviewDebuggingEnabled={true}
        javaScriptEnabled={true}
        onMessage={onMessage}
        onLoadStart={({ nativeEvent: { url, loading, title } }) => {
          console.log('onLoadStart', url, loading, title);
        }}
        onLoadEnd={({ nativeEvent: { url, loading, title } }) => {
          console.log('onLoadEnd', url, loading, title);
        }}
        injectedJavaScript={injectedJavaScript}
        allowFileAccessFromFileURLs={true}
        allowingReadAccessToURL={params.opsUri}
        // Specifying 'file://*' in here is necessary to stop the WebView from
        // treating file URLs as being blocklisted. Blocklisted URLs get opened
        // via Linking (to be passed on to Safari) instead.
        originWhitelist={['file://*']}
        source={{ uri: webViewUri }}
        onNavigationStateChange={({ url }) => {
          // The first navigation upon load will be "about:blank".
          if (!url.startsWith('file://')) {
            return;
          }
          setWebViewUri(url);
        }}
      />
    </SafeAreaView>
  );
}

const injectedJavaScript = `
{
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(injectedCss)};
  document.head.appendChild(style);
}

${mainScript}
`.trim();

const style = StyleSheet.create({
  container: { flex: 1 },
});
