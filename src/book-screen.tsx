import { useEffect, useState } from 'react';
import { Button, SafeAreaView, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import { useLibrary } from '@/hooks/useLibrary';
import type { OPF } from '@/types/epub.types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from './navigation.types';

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

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: params.title,
      headerRight: () => {
        if (!opf) {
          return (
            <>
              <Button title="Spine" disabled />
              <Button title="ToC" disabled />
            </>
          );
        }

        const {
          package: {
            manifest: { items },
            spine: { itemrefs },
          },
        } = opf;

        // To be expanded to: `${backParams.opsUri}/${href}`
        const hrefs = new Array<string>();
        const labels = new Array<string>();

        if (params.nav) {
          hrefs.push(params.nav);
          labels.push('Nav');
        }

        let i = 0;
        for (const { idref } of itemrefs) {
          const item = items.find(item => item.id === idref);
          if (!item || item.href === params.nav) {
            continue;
          }
          hrefs.push(item.href);
          labels.push(`Part ${i}`);
          i++;
        }

        return (
          <>
            <Button
              title="Spine"
              onPress={() =>
                navigation.navigate('ToC', {
                  ...params,
                  hrefs: hrefs.join(','),
                  labels: labels.join(','),
                })
              }
            />
            <Button title="ToC" disabled />
          </>
        );
      },
    });
  }, [navigation, params.nav, params.title]);

  if (library.type !== 'loaded') {
    return null;
  }

  if (!params.opsUri) {
    return null;
  }

  console.log('HERE!', route.params.href);

  return (
    <SafeAreaView style={style.container}>
      <WebView
        webviewDebuggingEnabled={true}
        javaScriptEnabled={true}
        onMessage={({ nativeEvent: { data } }) => {
          let parsedData: any;
          try {
            parsedData = JSON.parse(data);
          } catch (error) {
            return;
          }

          switch (parsedData.type) {
            case 'opf': {
              setOPF(parsedData.message);
              return;
            }
          }
        }}
        injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded(
          {
            opsUri: params.opsUri,
            relativePathToOpfFromOps: params.relativePathToOpfFromOps,
          },
        )}
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

const injectedJavaScriptBeforeContentLoaded = ({
  opsUri,
  relativePathToOpfFromOps,
}: {
  opsUri: string;
  relativePathToOpfFromOps: string;
}) =>
  `
const __opsUri = "${opsUri}";
const __relativePathToOpfFromOps = "${relativePathToOpfFromOps}";
`.trim();

const injectedJavaScript = `
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
body {
  box-sizing: border-box !important;
  padding: 24pt !important;
  margin: 0 !important;
  inline-size: 100% !important;
  font-size: 20pt !important;
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

async function parseOPF(href){
  const result = await fetch(href);
  const text = await result.text();
  console.log(text);
  const doc = new DOMParser().parseFromString(text, "application/xml");

  const metadata = doc.querySelector("metadata");
  const manifest = doc.querySelector("manifest");
  const spine = doc.querySelector("spine");
  const guide = doc.querySelector("guide");
  // Only guide is optional, to my understanding.
  if(!metadata || !manifest || !spine){
    return;
  }
  const dc = "http://purl.org/dc/elements/1.1/";
  const opf = "http://www.idpf.org/2007/opf";

  // Parse <package>
  const uniqueIdentifier = doc.documentElement.getAttribute("unique-identifier");
  const version = doc.documentElement.getAttribute("version");

  // Parse <metadata> section
  const languages = [...metadata.getElementsByTagNameNS(dc, "language")]
    .map(element => ({ textContent: element.textContent }));
  const titles = [...metadata.getElementsByTagNameNS(dc, "title")]
    .map(element => ({ textContent: element.textContent }));
  const creators = [...metadata.getElementsByTagNameNS(dc, "creator")]
    .map(element => ({
      textContent: element.textContent,
      opfFileAs: element.getAttributeNS(opf, "file-as"),
      opfRole: element.getAttributeNS(opf, "role"),
    }));
  const contributors = [...metadata.getElementsByTagNameNS(dc, "contributor")]
    .map(element => ({ textContent: element.textContent }));
  const publishers = [...metadata.getElementsByTagNameNS(dc, "publisher")]
    .map(element => ({ textContent: element.textContent }));
  const identifiers = [...metadata.getElementsByTagNameNS(dc, "identifier")]
    .map(element => ({
      id: element.id,
      textContent: element.textContent,
      opfScheme: element.getAttributeNS(opf, "scheme"),
    }));
  const dates = [...metadata.getElementsByTagNameNS(dc, "date")]
    .map(element => ({ textContent: element.textContent }));
  const metas = [...metadata.querySelectorAll("meta")]
    .map(element => ({
      name: element.getAttribute("name"),
      content: element.getAttribute("content"),
    }));

  // Parse <manifest> section
  const items = [...manifest.querySelectorAll("item")]
    .map(element => ({
      id: element.id,
      href: element.getAttribute("href"),
      mediaType: element.getAttribute("media-type"),
    }));

  // Parse <spine> section
  const toc = spine.getAttribute("toc");
  const pageProgressionDirection = spine.getAttribute("page-progression-direction");
  const itemrefs = [...spine.querySelectorAll("itemref")]
    .map(element => ({ idref: element.getAttribute("idref") }));

  const message = {
    package: {
      version,
      uniqueIdentifier,
      metadata: {
        languages,
        titles,
        creators,
        contributors,
        publishers,
        identifiers,
        dates,
        metas,
      },
      manifest: { items },
      spine: {
        toc,
        pageProgressionDirection,
        itemrefs,
      },
    },
  };

  // Parse optional <guide> section
  if(guide){
    const references = [...guide.querySelectorAll("reference")]
      .map(element => ({
        type: element.getAttribute("type"),
        href: element.getAttribute("href"),
        title: element.getAttribute("title"),
      }));
    message.package.guide = { references };
  }

  window.ReactNativeWebView.postMessage(JSON.stringify({ type: "opf", message }));

  return message;
}

// document.body.prepend(buildHUD());

parseOPF(\`\${__opsUri}/\${__relativePathToOpfFromOps}\`)
.catch(console.error);
`.trim();

const style = StyleSheet.create({
  container: { flex: 1 },
});
