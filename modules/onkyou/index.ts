import {
  NativeModulesProxy,
  EventEmitter,
  Subscription,
} from 'expo-modules-core';

// Import the native module. On web, it will be resolved to Onkyou.web.ts
// and on native platforms to Onkyou.ts
import { TimeupdateEventPayload, OnkyouViewProps } from './src/Onkyou.types';
import OnkyouModule from './src/OnkyouModule';
import OnkyouView from './src/OnkyouView';

// Get the native constant value.
export const PI = OnkyouModule.PI;

export async function setValueAsync(value: string) {
  return await OnkyouModule.setValueAsync(value);
}

const emitter = new EventEmitter(OnkyouModule ?? NativeModulesProxy.Onkyou);

export function addChangeListener(
  listener: (event: TimeupdateEventPayload) => void
): Subscription {
  return emitter.addListener<TimeupdateEventPayload>('onTimeupdate', listener);
}

export { OnkyouView, OnkyouViewProps, TimeupdateEventPayload };
