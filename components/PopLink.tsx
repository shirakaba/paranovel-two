'use client';
// Fork of @react-navigation/native Link.tsx with `href` and `replace` support added and
// `to` / `action` support removed.
import useLinkToPathProps from 'expo-router/build/link/useLinkToPathProps';
import { resolveHref } from 'expo-router/build/link/href';
import {
  useHrefAttrs,
  useInteropClassName,
  type LinkProps,
} from 'expo-router/build/link/useLinkHooks';
import { Slot } from 'expo-router/build/link/LinkSlot';
import type { Href } from 'expo-router/build/types';
import {
  type ForwardedRef,
  forwardRef,
  PropsWithChildren,
  useMemo,
} from 'react';
import { Platform, Text } from 'react-native';

interface PopLinkProps<T extends string | object = string | object>
  extends LinkProps<T> {
  popTo?: boolean;
}

export interface PopLinkComponent {
  (props: PropsWithChildren<PopLinkProps>): JSX.Element;
  /** Helper method to resolve a Href object into a string. */
  resolveHref: (href: Href) => string;
}

export const PopLink = forwardRef(PopLinkImpl) as unknown as PopLinkComponent;

PopLink.resolveHref = resolveHref;

/**
 * A copy of the <Link> component, but with support for the PopTo StackAction.
 *
 * @see https://github.com/expo/expo/blob/sdk-52/packages/expo-router/src/link/Link.tsx#L86
 * @see expo-router/build/link/Link.js
 * @see https://reactnavigation.org/docs/upgrading-from-6.x/#the-navigate-method-no-longer-goes-back-use-popto-instead
 */
function PopLinkImpl(
  {
    href,
    replace,
    push,
    popTo,
    // TODO: This does not prevent default on the anchor tag.
    relativeToDirectory,
    asChild,
    rel,
    target,
    download,
    withAnchor,
    ...rest
  }: PopLinkProps,
  ref: ForwardedRef<Text>,
) {
  // Mutate the style prop to add the className on web.
  const style = useInteropClassName(rest);

  // If not passing asChild, we need to forward the props to the anchor tag using React Native Web's `hrefAttrs`.
  const hrefAttrs = useHrefAttrs({ asChild, rel, target, download });

  const resolvedHref = useMemo(() => {
    if (href == null) {
      throw new Error('Link: href is required');
    }
    return resolveHref(href);
  }, [href]);

  let event;
  if (push) event = 'PUSH';
  if (replace) event = 'REPLACE';
  // https://github.com/react-navigation/react-navigation/blob/9edabaea87ad0b7f2c189b690b1a02661995ca84/packages/routers/src/StackRouter.tsx#L39C14-L39C20
  if (popTo) event = 'POP_TO';

  const props = useLinkToPathProps({
    href: resolvedHref,
    event,
    relativeToDirectory,
    withAnchor,
  });

  const onPress = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if ('onPress' in rest) {
      rest.onPress?.(e);
    }
    props.onPress(e);
  };

  const Element = asChild ? Slot : Text;

  // Avoid using createElement directly, favoring JSX, to allow tools like NativeWind to perform custom JSX handling on native.
  return (
    <Element
      ref={ref}
      {...props}
      {...hrefAttrs}
      {...rest}
      style={style}
      {...Platform.select({
        web: {
          onClick: onPress,
        } as any,
        default: { onPress },
      })}
    />
  );
}
