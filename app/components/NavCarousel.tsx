"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/app/components/ui/carousel";

interface NavItem {
  href: string;
  label: string;
}

export default function NavCarousel({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const activeIndex = items.findIndex((item) => item.href === pathname);

  // On mount / API ready: scroll so active item is visible with context
  const onApiReady = useCallback(
    (api: CarouselApi) => {
      if (!api || activeIndex <= 0) return;
      // Scroll to one before active so user sees where they came from
      const scrollTo = Math.max(0, activeIndex - 1);
      api.scrollTo(scrollTo, true); // true = instant, no animation
    },
    [activeIndex],
  );

  return (
    <Carousel
      opts={{
        align: "start",
        dragFree: true,
        containScroll: "trimSnaps",
        dragThreshold: 3,
        duration: 20,
        skipSnaps: true,
        startIndex: Math.max(0, activeIndex - 1),
      }}
      setApi={onApiReady}
      className="w-full"
    >
      <CarouselContent className="-ml-2">
        {items.map((item) => {
          const isActive = pathname === item.href;
          return (
            <CarouselItem key={item.href} className="basis-auto pl-2">
              <a
                href={item.href}
                style={{
                  display: "block",
                  fontSize: "13px",
                  color: isActive ? "#ffffff" : "var(--text-secondary)",
                  textDecoration: "none",
                  padding: "6px 14px",
                  borderRadius: "4px",
                  whiteSpace: "nowrap",
                  fontWeight: isActive ? 700 : 400,
                  backgroundColor: isActive ? "rgba(245, 158, 11, 0.12)" : "transparent",
                  border: isActive ? "1px solid rgba(245, 158, 11, 0.25)" : "1px solid transparent",
                  transition: "color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {item.label}
              </a>
            </CarouselItem>
          );
        })}
      </CarouselContent>
    </Carousel>
  );
}
