import { EventSubscription } from 'expo-modules-core';

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

// Migrated from expo-modules-core v1 to v2 based on:
// https://github.com/expo/expo/pull/28946/files#diff-15c704681d08785c321494455c6823db3df41693cc15c46f176910b9c04d077c
export function addChangeListener(
  listener: (event: TimeupdateEventPayload) => void,
): EventSubscription {
  return OnkyouModule.addListener('onTimeupdate', listener);
}

export { OnkyouView, OnkyouViewProps, TimeupdateEventPayload };
