import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      // Electrum Cash variants
      '@rpckit/core/electrum-cash': resolve(__dirname, 'packages/core/src/electrum-cash'),
      '@rpckit/websocket/electrum-cash': resolve(__dirname, 'packages/websocket/src/electrum-cash'),
      '@rpckit/tcp/electrum-cash': resolve(__dirname, 'packages/tcp/src/electrum-cash'),
      '@rpckit/http/electrum-cash': resolve(__dirname, 'packages/http/src/electrum-cash'),
      '@rpckit/fallback/electrum-cash': resolve(__dirname, 'packages/fallback/src/electrum-cash'),
      // Ethereum variants
      '@rpckit/core/ethereum': resolve(__dirname, 'packages/core/src/ethereum'),
      '@rpckit/websocket/ethereum': resolve(__dirname, 'packages/websocket/src/ethereum'),
      '@rpckit/http/ethereum': resolve(__dirname, 'packages/http/src/ethereum'),
      // Base packages
      '@rpckit/core': resolve(__dirname, 'packages/core/src'),
      '@rpckit/websocket': resolve(__dirname, 'packages/websocket/src'),
      '@rpckit/tcp': resolve(__dirname, 'packages/tcp/src'),
      '@rpckit/http': resolve(__dirname, 'packages/http/src'),
      '@rpckit/fallback': resolve(__dirname, 'packages/fallback/src'),
      '@rpckit/cluster': resolve(__dirname, 'packages/cluster/src'),
    },
  },
})
