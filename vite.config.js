import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

// `npm run dev:https` serves over self-signed HTTPS so phones on the LAN get
// a secure context (needed for the share sheet).
export default defineConfig(({ mode }) => ({
  server: { host: true },
  preview: { host: true },
  plugins: [
    react(),
    mode === 'https' && basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,mp3}'],
        navigateFallback: '/index.html',
        // Receives photos shared in from other apps on Android, and shows
        // notifications when someone adds photos.
        importScripts: ['share-target.js', 'push.js'],
      },
      manifest: {
        name: 'Hugpix',
        short_name: 'Hugpix',
        description: 'Photo albums, shared with family and friends.',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        background_color: '#0E0E10',
        theme_color: '#0E0E10',
        // Makes the installed app a destination in Android's share sheet.
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'photos', accept: ['image/*', 'video/*'] }] },
        },
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
}))
