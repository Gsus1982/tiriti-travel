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
        <svg width="36" height="36" viewBox="0 0 24 24" fill="#818cf8">
          <path d="M12 1.5c.7 0 1.3.5 1.3 1.2v6.1l7.7 4.6v2.1l-7.7-2.5v4.6l2.3 1.7v1.9l-3.6-1.1-3.6 1.1v-1.9l2.3-1.7v-4.6L3 15.5v-2.1l7.7-4.6V2.7c0-.7.6-1.2 1.3-1.2Z" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
