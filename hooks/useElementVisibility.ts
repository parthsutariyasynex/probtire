"use client";

import { useState, useEffect, RefObject } from "react";

interface UseElementVisibilityOptions {
  root?: Element | Document | null;
  rootMargin?: string;
  threshold?: number | number[];
}

/**
 * Reusable hook to monitor whether a DOM element is visible within the viewport.
 * Supports both CSS selector strings (e.g. "footer") and React RefObjects.
 * 
 * @param target - A CSS selector string or a React RefObject pointing to the target element.
 * @param options - IntersectionObserver configuration options.
 * @returns boolean - True if the element is visible in the viewport, otherwise false.
 */
export function useElementVisibility(
  target: string | RefObject<Element | null>,
  options: UseElementVisibilityOptions = {}
): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return;
    }

    let intersectionObserver: IntersectionObserver | null = null;

    const setupObserver = (element: Element) => {
      intersectionObserver = new IntersectionObserver(
        ([entry]) => {
          setIsVisible(entry.isIntersecting);
        },
        {
          root: options.root,
          rootMargin: options.rootMargin,
          threshold: options.threshold,
        }
      );
      intersectionObserver.observe(element);
    };

    const getTargetElement = (): Element | null => {
      if (typeof target === "string") {
        return document.querySelector(target);
      }
      return target.current;
    };

    const element = getTargetElement();
    if (element) {
      setupObserver(element);
    } else {
      // If the target element is not in the DOM yet, observe the body for changes
      // and set up the observer as soon as it appears.
      const mutationObserver = new MutationObserver(() => {
        const targetEl = getTargetElement();
        if (targetEl) {
          setupObserver(targetEl);
          mutationObserver.disconnect();
        }
      });
      mutationObserver.observe(document.body, { childList: true, subtree: true });
      
      return () => {
        mutationObserver.disconnect();
        if (intersectionObserver) {
          intersectionObserver.disconnect();
        }
      };
    }

    return () => {
      if (intersectionObserver) {
        intersectionObserver.disconnect();
      }
    };
  }, [target, options.root, options.rootMargin, JSON.stringify(options.threshold)]);

  return isVisible;
}
