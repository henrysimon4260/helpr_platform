"use client";

import { type MouseEvent, type ReactNode } from "react";

type SlowScrollLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  durationMs?: number;
};

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export default function SlowScrollLink({
  href,
  className,
  children,
  durationMs = 1300,
}: SlowScrollLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!href.startsWith("#")) {
      return;
    }

    const target = document.querySelector(href);
    if (!(target instanceof HTMLElement)) {
      return;
    }

    event.preventDefault();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      target.scrollIntoView({ behavior: "auto" });
      window.history.replaceState(null, "", href);
      return;
    }

    const startY = window.scrollY;
    const targetY = target.getBoundingClientRect().top + window.scrollY;
    const distance = targetY - startY;
    const startTime = performance.now();

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const easedProgress = easeInOutCubic(progress);

      window.scrollTo(0, startY + distance * easedProgress);

      if (progress < 1) {
        window.requestAnimationFrame(step);
        return;
      }

      window.history.replaceState(null, "", href);
    };

    window.requestAnimationFrame(step);
  };

  return (
    <a href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
