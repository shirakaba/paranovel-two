/// <reference types="@welldone-software/why-did-you-render" />

import React from 'react';

if (__DEV__) {
  /** @type {import('@welldone-software/why-did-you-render').default} */
  const whyDidYouRender = require('@welldone-software/why-did-you-render');
  const defaultNotifier = whyDidYouRender.defaultNotifier;
  whyDidYouRender(React, {
    logOnDifferentValues: true,
    notifier: updateInfo => {
      // if you want to see more details, please use the defaultNotifier
      defaultNotifier(updateInfo);
      console.log('!!', updateInfo);
    },
  });
}
