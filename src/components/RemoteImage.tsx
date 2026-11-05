import { useState } from 'react';

const placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect width="100%25" height="100%25" fill="%23e7e8e9"/%3E%3Cpath d="M17 43l10-11 7 7 5-5 9 9" stroke="%23b8bbbd" stroke-width="2" fill="none"/%3E%3Ccircle cx="26" cy="24" r="4" fill="%23b8bbbd"/%3E%3C/svg%3E';

export function RemoteImage({ src, alt, crop }: { src: string; alt: string; crop?: { width: number; height: number; left: number; top: number } }) {
  const [imageSrc, setImageSrc] = useState(src || placeholder);
  const frame = crop ?? { width: 64, height: 64, left: 0, top: 0 };
  return <span className="remote-image"><img src={imageSrc} alt={alt} style={{ width: frame.width, height: frame.height, left: frame.left, top: frame.top }} onError={() => setImageSrc(placeholder)} /></span>;
}
