import React, { forwardRef, useEffect, useRef } from 'react';

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

// Generic React wrapper for ICPay custom elements.
// - Assigns all non-React props as properties on the underlying element
// - Leaves events to be handled via config callbacks (recommended)
export function createWebComponent<TElement extends HTMLElement, TProps extends AnyProps>(
  tagName: string
) {
  const Component = forwardRef<TElement, TProps>((props, ref) => {
    const innerRef = useRef<TElement | null>(null);

    useEffect(() => {
      const el = innerRef.current as any;
      if (!el) return;

      // Assign props as element properties (exclude standard React DOM props)
      const {
        children,
        className,
        style,
        id,
        role,
        tabIndex,
        title,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ref: _ignoredRef,
        ...rest
      } = props as any;

      for (const [key, value] of Object.entries(rest)) {
        try {
          (el as any)[key] = value;
        } catch {
          // no-op if property assignment fails
        }
      }
    }, [props]);

    // Merge forwarded ref
    const setRef = (node: TElement | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref && typeof ref === 'object') {
        (ref as React.MutableRefObject<TElement | null>).current = node;
      }
    };

    const { children, ...rest } = props as any;
    return React.createElement(tagName, { ref: setRef, ...rest }, children);
  });

  Component.displayName = `ICPay(${tagName})`;
  return Component;
}


