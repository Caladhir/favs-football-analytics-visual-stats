import React, { useMemo, useState } from "react";

function normalizeLogoUrl(url) {
  if (!url) return null;
  try {
    // Normalize Sofascore domains to a reliable image host
    return url.replace("api.sofascore.app/api", "img.sofascore.com/api");
  } catch {
    return url;
  }
}

export default function TeamLogo({
  src,
  alt = "Team logo",
  className = "w-8 h-8",
  rounded = true,
  fallbackText = "⚽",
}) {
  const [errored, setErrored] = useState(false);
  const finalSrc = useMemo(() => normalizeLogoUrl(src), [src]);

  if (!finalSrc || errored) {
    return (
      <div
        className={`${className} ${
          rounded ? "rounded-full" : "rounded"
        } bg-white/10 flex items-center justify-center text-xs`}
        title={alt}
      >
        <span>{fallbackText}</span>
      </div>
    );
  }

  return (
    <img
      src={finalSrc}
      alt={alt}
      className={`${className} ${
        rounded ? "rounded-full" : "rounded"
      } object-cover`}
      loading="lazy"
      onError={() => setErrored(true)}
    />
  );
}
