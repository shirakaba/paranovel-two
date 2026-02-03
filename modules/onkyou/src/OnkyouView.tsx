import { requireNativeView } from 'expo';
import * as React from 'react';
import { StyleSheet, ViewProps } from 'react-native';

import { OnkyouViewInterface, OnkyouViewProps } from './Onkyou.types';
import OnkyouModule from './OnkyouModule';

const NativeView: React.ComponentType<OnkyouViewProps & ViewProps> =
  requireNativeView('Onkyou');

const OnkyouView = React.forwardRef<
  OnkyouViewInterface,
  Omit<OnkyouViewProps, 'instanceId'>
>((props, ref) => {
  const id = React.useId();

  React.useImperativeHandle(
    ref,
    () => ({
      play: () => OnkyouModule.play(id),
      pause: () => OnkyouModule.pause(id),
      setCurrentTime: (currentTime: number) =>
        OnkyouModule.setCurrentTime(id, currentTime),
      getCurrentTime: () => OnkyouModule.getCurrentTime(id),
      getDuration: () => OnkyouModule.getDuration(id),
      getBuffered: () => OnkyouModule.getBuffered(id),
      isPaused: () => OnkyouModule.isPaused(id),
    }),
    [id],
  );

  return <NativeView {...props} instanceId={id} style={styles.hidden} />;
});
export default OnkyouView;

const styles = StyleSheet.create({
  hidden: {
    display: 'none',
  },
});
