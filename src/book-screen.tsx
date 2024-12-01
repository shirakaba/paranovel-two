import { useEffect, useRef, useState } from 'react';
import { Button, SafeAreaView, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import { useLibrary } from '@/hooks/useLibrary';
import type { OPF, NCX } from '@/types/epub.types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from './navigation.types';
import { readAsStringAsync } from 'expo-file-system';
import {
  getSpineFromOpf,
  getTocFromNCX,
  parseNCX,
  parseOPF,
} from '@/utils/epub-parsing';

export default function BookScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Book'>) {
  const params = route.params;

  const [webViewUri, setWebViewUri] = useState(params.href);

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

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: params.title,
      headerRight: () => {
        const spine = opf
          ? getSpineFromOpf({ opf, nav: params.nav })
          : undefined;
        const toc =
          params.ncxFileHref && ncx
            ? getTocFromNCX({ ncx, ncxFileHref: params.ncxFileHref })
            : undefined;

        return (
          <>
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
  }, [navigation, params.nav, params.title, opf, ncx]);

  if (library.type !== 'loaded') {
    return null;
  }

  if (!params.opsUri) {
    return null;
  }

  return (
    <SafeAreaView style={style.container}>
      <WebView
        webviewDebuggingEnabled={true}
        javaScriptEnabled={true}
        // No-op onMessage() handler needed to enable injectedJavaScript.
        onMessage={() => {}}
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

// Many of these things (like scroll restoration) would belong better in
// injectedJavaScriptBeforeContentLoaded, but I'm finding it to be an incredibly
// unreliable prop
const injectedJavaScript = `
// Prevent restoring the last-scrolled position from a previous session.
history.scrollRestoration = "manual";

{
  // Insert a viewport meta tag
  const meta = document.createElement("meta");
  meta.name = "viewport";
  meta.content = "width=device-width, initial-scale=1";
  document.head.appendChild(meta);

  // Insert our custom styles. This approach reliably presents the styles in the
  // WebKit web inspector's styles menu, unlike the adoptedStyleSheets approach,
  // where I've noticed that body styles simply don't show up even if they take
  // effect.
  const style = document.createElement('style');
  style.textContent = \`
:root {
  /*
   * - In vertical-rl text: 'block' = 'horizontal' and 'inline' = 'vertical'.
   * - In horizontal-lr text: 'block' = 'vertical' and 'inline' = 'horizontal'.
   */
  --paranovel-block-padding: 24px;
  --paranovel-inline-padding: 24px;
  --paranovel-font-size: 24px;
}

html {
  margin: 0 !important;
  max-inline-size: none !important;
}

body {
  box-sizing: border-box !important;
  padding-block: var(--paranovel-block-padding) !important;
  padding-inline: var(--paranovel-inline-padding) !important;
  margin: 0 !important;
  inline-size: 100% !important;
  font-size: var(--paranovel-font-size) !important;
}

img, svg {
  /* Prevent images from dictating the height of the whole page. */
  max-inline-size: 100% !important;
}
  \`.trim();
  document.head.appendChild(style);
}

function buildHUD(){
  const html = \`
<div id="hud" style="position: fixed; display: flex; justify-content: center; width: 100%; top: 0; left: 0; right: 0; background-color: rgb(55,65,81); min-height: 40px; padding: 8px; writing-mode: horizontal-tb; color: white; font-family: sans-serif; font-size: 16px;">
</div>
  \`.trim();

  const template = document.createElement("template");
  template.innerHTML = html;
  const dom = template.content.firstChild;
  return dom;
}

// document.body.prepend(buildHUD());
`.trim();

const style = StyleSheet.create({
  container: { flex: 1 },
});
