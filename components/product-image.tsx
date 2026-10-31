"use client";
import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { ImageOff } from "lucide-react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  src?: string;
  alt: string;
};

/**
 * Product photo that keeps its box when the store image is missing or blocked.
 * Server-rendered images can fail before React hydrates, so onError alone misses them;
 * the mount check catches those.
 */
export function ProductImage({ src, alt, className, width, height, ...rest }: Props) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(!src || src === "/favicon.svg");
  useEffect(() => {
    const img = ref.current;
    // Reading the DOM after hydration is the only way to see a failure that happened earlier.
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);
  if (failed)
    return (
      <span
        className={"image-fallback " + (className || "")}
        role="img"
        aria-label={alt ? alt + " — şəkil yoxdur" : "Şəkil yoxdur"}
        style={{ aspectRatio: width && height ? `${width} / ${height}` : undefined }}
      >
        <ImageOff size={28} strokeWidth={1.5} aria-hidden="true" />
        <small>Şəkil yoxdur</small>
      </span>
    );
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={className}
      width={width}
      height={height}
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
