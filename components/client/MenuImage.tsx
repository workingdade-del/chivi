"use client";

import { useState } from "react";
import Image from "next/image";

export function MenuImage({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className="font-mono text-[10px] tracking-[.14em] uppercase text-[#a9986f] bg-white/70 px-1.5 py-1 rounded-md">
        photo — {alt}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className={className ?? "object-cover"}
      sizes="430px"
      onError={() => setFailed(true)}
    />
  );
}
