import { ImageResponse } from 'next/og';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0e1013',
          borderRadius: 14
        }}
      >
        <svg width="40" height="40" viewBox="0 0 32 32" fill="#818cf8">
          <path d="M2 13 Q 9 5 16 12 Q 23 5 30 13 Q 23 10 16 15 Q 9 10 2 13 Z" />
          <path d="M14.5 14 L16 24 L17.5 14 Z" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
