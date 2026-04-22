"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type ScrollRevealStoreButtonsProps = {
  appStoreHref?: string;
  playStoreHref?: string;
  appStoreAriaLabel: string;
  playStoreAriaLabel: string;
  threshold?: number;
  className?: string;
  gapClassName?: string;
};

export default function ScrollRevealStoreButtons({
  appStoreHref = "#",
  playStoreHref = "#",
  appStoreAriaLabel,
  playStoreAriaLabel,
  threshold = 140,
  className = "",
  gapClassName = "gap-3",
}: ScrollRevealStoreButtonsProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const revealOnScroll = () => {
      setIsVisible(window.scrollY > threshold);
    };

    revealOnScroll();
    window.addEventListener("scroll", revealOnScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", revealOnScroll);
    };
  }, [threshold]);

  return (
    <div
      className={`flex flex-col items-center transition-all duration-700 ease-out sm:flex-row ${gapClassName} ${className} ${
        isVisible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <a href={appStoreHref} aria-label={appStoreAriaLabel}>
        <Image
          src="/images/download_on_the_app_store.svg"
          alt="Download on the App Store"
          width={205}
          height={62}
          className="h-[3.1rem] w-auto transition-transform duration-300 hover:-translate-y-0.5"
        />
      </a>
      <a href={playStoreHref} aria-label={playStoreAriaLabel}>
        <Image
          src="/images/google_play_store_badge.png"
          alt="Get it on Google Play"
          width={209}
          height={62}
          className="h-[3.1rem] w-auto transition-transform duration-300 hover:-translate-y-0.5"
        />
      </a>
    </div>
  );
}
