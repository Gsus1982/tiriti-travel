import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0e1013'
        }}
      >
        <svg width="110" height="110" viewBox="0 0 32 32" fill="#818cf8">
          <path d="M2 13 Q 9 5 16 12 Q 23 5 30 13 Q 23 10 16 15 Q 9 10 2 13 Z" />
          <path d="M14.5 14 L16 24 L17.5 14 Z" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
