import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Button, SafeAreaView, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import type { Book } from '@/types/book.types';
import { useLibrary } from '@/hooks/useLibrary';
import type { OPF } from '@/types/opf.types';

export default function BookScreen() {
  const params = useLocalSearchParams<Book & { href: string }>();
  const library = useLibrary();
  const [opf, setOPF] = useState<OPF>();

  const Screen = () => (
    <Stack.Screen
      options={{
        headerShown: true,
        headerTitle: params.title,
        headerRight: () => {
          if (!opf) {
            return (
              <Link disabled href="/toc" asChild>
                <Button title="ToC" />
              </Link>
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

          for (const [i, { idref }] of itemrefs.entries()) {
            const item = items.find(item => item.id === idref);
            if (!item) {
              continue;
            }
            hrefs.push(item.href);
            labels.push(`Part ${i}`);
          }

          return (
            <Link
              href={{
                pathname: '/toc',
                params: { ...params, hrefs, labels },
              }}
              asChild>
              <Button title="ToC" />
            </Link>
          );
        },
      }}
    />
  );

  if (library.type !== 'loaded') {
    return <Screen />;
  }

  if (!params.opsUri) {
    return <Screen />;
  }

  return (
    <>
      {/* https://docs.expo.dev/router/advanced/stack/#header-buttons */}
      <Screen />
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
          source={{ uri: params.href }}
        />
      </SafeAreaView>
    </>
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
// Insert a viewport meta tag
{
  const meta = document.createElement("meta");
  meta.name = "viewport";
  meta.content = "width=device-width, initial-scale=1";
  document.head.appendChild(meta);
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
