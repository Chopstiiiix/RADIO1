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
      if (!api || activeIndex < 0) return;
      // At the start — no need to offset
      if (activeIndex <= 1) {
        api.scrollTo(0, true);
        return;
      }
      // At the end — just scroll to the last possible position
      if (activeIndex >= items.length - 2) {
        api.scrollTo(items.length - 1, true);
        return;
      }
      // Middle items — show one before for context
      api.scrollTo(activeIndex - 1, true);
    },
    [activeIndex, items.length],
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
        startIndex: activeIndex <= 1 ? 0 : activeIndex >= items.length - 2 ? items.length - 1 : activeIndex - 1,
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
