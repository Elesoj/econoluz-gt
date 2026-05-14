"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AnimatedStatProps = {
  value: string;
  label: string;
};

const parseStatValue = (value: string) => {
  const prefix = value.startsWith("+") ? "+" : "";
  const numericValue = Number(value.replace(/[^\d]/g, ""));

  return {
    prefix,
    numericValue: Number.isFinite(numericValue) ? numericValue : 0,
  };
};

const formatStatValue = (value: number, prefix: string) =>
  `${prefix}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`;

export default function AnimatedStat({ value, label }: AnimatedStatProps) {
  const { prefix, numericValue } = useMemo(() => parseStatValue(value), [value]);
  const [displayValue, setDisplayValue] = useState(0);
  const statRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    let animationFrame = 0;
    let startTime = 0;
    const duration = 1800;

    const animate = (currentTime: number) => {
      if (!startTime) {
        startTime = currentTime;
      }

      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      setDisplayValue(Math.round(numericValue * easedProgress));

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasAnimatedRef.current) {
          return;
        }

        hasAnimatedRef.current = true;
        window.cancelAnimationFrame(animationFrame);
        startTime = 0;
        setDisplayValue(0);
        animationFrame = window.requestAnimationFrame(animate);
        observer.disconnect();
      },
      {
        threshold: 0.45,
      },
    );

    const currentStat = statRef.current;

    if (currentStat) {
      observer.observe(currentStat);
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [numericValue]);

  return (
    <div ref={statRef} className="px-6 py-7 text-center sm:px-8 lg:py-9">
      <p className="text-5xl font-semibold leading-none tracking-normal sm:text-6xl">
        {formatStatValue(displayValue, prefix)}
      </p>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-white/62">
        {label}
      </p>
    </div>
  );
}
