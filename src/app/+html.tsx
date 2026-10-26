import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Web-only: configures the root HTML shell for static rendering.
// Runs in Node.js only — no browser APIs or global CSS imports here.
// The #1a1a1a / #fff shell colors are intentionally not theme tokens: they
// only paint before React hydrates and the themed root View takes over.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="theme-color" content="#1a1a1a" />

        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: `
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background: #1a1a1a;
            overflow: hidden;
          }
          @media (prefers-color-scheme: light) {
            html, body { background: #fff; }
          }
          #root {
            width: 100%;
            max-width: 430px;
            height: 100%;
            margin: 0 auto;
            overflow: hidden;
          }
        `}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
