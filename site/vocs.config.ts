import { defineConfig } from 'vocs/config'

import { sidebar } from './sidebar.js'

export default defineConfig({
  accentColor: 'light-dark(#3b82f6, #60a5fa)',
  baseUrl:
    process.env.VERCEL_ENV === 'production'
      ? 'https://rpckit.dev'
      : process.env.VERCEL_URL,
  cacheDir: '.cache',
  title: 'rpckit',
  titleTemplate: '%s - rpckit',
  description:
    'A modular TypeScript library for JSON-RPC communication with type-safe transports and utilities.',
  editLink: {
    link: 'https://github.com/mainnet-pat/rpckit/edit/master/site/pages/:path',
    text: 'Suggest changes to this page',
  },
  iconUrl: '/favicon.svg',
  logoUrl: '/logo.svg',
  renderStrategy: 'partial-static',
  rootDir: '.',
  srcDir: '.',
  sidebar,
  socials: [
    {
      icon: 'github',
      link: 'https://github.com/mainnet-pat/rpckit',
    },
    {
      icon: 'x',
      link: 'https://x.com/mainnet_pat',
    },
    {
      icon: 'telegram',
      link: 'https://t.me/mainnet_pat',
    },
  ],
  topNav: [
    { text: 'Docs', link: '/docs/getting-started', match: '/docs' },
    { text: 'Changelog', link: '/docs/changelog' },
    { text: '1.0.2', link: '/docs/changelog' },
  ],
})
