import type { Config } from 'vocs/config'

export const sidebar = {
  '/docs/': [
    {
      text: 'Introduction',
      items: [
        { text: 'Why rpckit', link: '/docs/introduction' },
        { text: 'Installation', link: '/docs/installation' },
        { text: 'Getting Started', link: '/docs/getting-started' },
        { text: 'Interactive Demo', link: '/docs/demo' },
      ],
    },
    {
      text: 'Transports',
      items: [
        { text: 'Overview', link: '/docs/transports/overview' },
        { text: 'WebSocket', link: '/docs/transports/websocket' },
        { text: 'TCP', link: '/docs/transports/tcp' },
        { text: 'HTTP', link: '/docs/transports/http' },
        { text: 'Fallback', link: '/docs/transports/fallback' },
        { text: 'Cluster', link: '/docs/transports/cluster' },
      ],
    },
    {
      text: 'Protocols',
      items: [
        { text: 'Electrum Cash', link: '/docs/protocols/electrum-cash' },
        { text: 'Ethereum', link: '/docs/protocols/ethereum' },
      ],
    },
    {
      text: 'Utilities',
      items: [
        { text: 'parse()', link: '/docs/utilities/parse' },
        { text: 'BatchScheduler', link: '/docs/utilities/batch-scheduler' },
        { text: 'withRetry()', link: '/docs/utilities/with-retry' },
      ],
    },
    {
      text: 'Resources',
      items: [{ text: 'Changelog', link: '/docs/changelog' }],
    },
  ],
} as const satisfies Config['sidebar']
