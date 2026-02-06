import type { RpcMethod, TransportConfig } from './types.js'

export const DEFAULT_SERVERS: { label: string; config: TransportConfig }[] = [
  {
    label: 'WebSocket (secure)',
    config: {
      id: 'wss-fulcrum',
      type: 'websocket',
      url: 'wss://fulcrum.pat.mn',
    },
  },
  {
    label: 'WebSocket (insecure)',
    config: {
      id: 'ws-fulcrum',
      type: 'websocket',
      url: 'ws://fulcrum.pat.mn:50003',
    },
  },
  {
    label: 'HTTP',
    config: {
      id: 'http-fulcrum',
      type: 'http',
      url: 'https://fulcrum.pat.mn',
    },
  },
]

export const BCHN_SERVERS: { label: string; config: TransportConfig }[] = [
  {
    label: 'BCHN HTTP',
    config: {
      id: 'http-bchn',
      type: 'http',
      url: 'https://bchn.pat.mn',
    },
  },
]

export const ETHEREUM_SERVERS: { label: string; config: TransportConfig }[] = [
  {
    label: 'WebSocket (publicnode)',
    config: {
      id: 'wss-ethereum',
      type: 'websocket',
      url: 'wss://ethereum-rpc.publicnode.com',
    },
  },
  {
    label: 'HTTP (publicnode)',
    config: {
      id: 'http-ethereum',
      type: 'http',
      url: 'https://ethereum-rpc.publicnode.com',
    },
  },
]

export const ELECTRUM_METHODS: RpcMethod[] = [
  {
    name: 'server.ping',
    label: 'server.ping',
    params: [],
  },
  {
    name: 'blockchain.headers.get_tip',
    label: 'blockchain.headers.get_tip',
    params: [],
  },
  {
    name: 'blockchain.transaction.get',
    label: 'blockchain.transaction.get',
    params: [
      {
        name: 'tx_hash',
        label: 'Transaction Hash',
        placeholder: 'Enter transaction hash...',
        defaultValue: '',
      },
      {
        name: 'verbose',
        label: 'Verbose',
        placeholder: 'true or false',
        defaultValue: 'false',
      },
    ],
  },
  {
    name: 'blockchain.address.get_balance',
    label: 'blockchain.address.get_balance',
    params: [
      {
        name: 'address',
        label: 'Address',
        placeholder: 'bitcoincash:qp...',
        defaultValue: '',
      },
    ],
  },
  {
    name: 'blockchain.address.get_history',
    label: 'blockchain.address.get_history',
    params: [
      {
        name: 'address',
        label: 'Address',
        placeholder: 'bitcoincash:qp...',
        defaultValue: '',
      },
    ],
  },
]

export const BCHN_METHODS: RpcMethod[] = [
  {
    name: 'getblockcount',
    label: 'getblockcount',
    params: [],
  },
  {
    name: 'getbestblockhash',
    label: 'getbestblockhash',
    params: [],
  },
  {
    name: 'getblockchaininfo',
    label: 'getblockchaininfo',
    params: [],
  },
  {
    name: 'getmempoolinfo',
    label: 'getmempoolinfo',
    params: [],
  },
  {
    name: 'getblock',
    label: 'getblock',
    params: [
      {
        name: 'blockhash',
        label: 'Block Hash',
        placeholder: 'Enter block hash...',
        defaultValue: '',
      },
      {
        name: 'verbosity',
        label: 'Verbosity',
        placeholder: '0, 1, or 2',
        defaultValue: '1',
      },
    ],
  },
  {
    name: 'getrawtransaction',
    label: 'getrawtransaction',
    params: [
      {
        name: 'txid',
        label: 'Transaction ID',
        placeholder: 'Enter transaction hash...',
        defaultValue: '',
      },
      {
        name: 'verbose',
        label: 'Verbose',
        placeholder: 'true or false',
        defaultValue: 'false',
      },
    ],
  },
]

export const ETHEREUM_METHODS: RpcMethod[] = [
  {
    name: 'eth_chainId',
    label: 'eth_chainId',
    params: [],
  },
  {
    name: 'eth_blockNumber',
    label: 'eth_blockNumber',
    params: [],
  },
  {
    name: 'eth_gasPrice',
    label: 'eth_gasPrice',
    params: [],
  },
  {
    name: 'eth_getBalance',
    label: 'eth_getBalance',
    params: [
      {
        name: 'address',
        label: 'Address',
        placeholder: '0x...',
        defaultValue: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      },
      {
        name: 'block',
        label: 'Block',
        placeholder: 'latest, earliest, or block number',
        defaultValue: 'latest',
      },
    ],
  },
  {
    name: 'eth_getBlockByNumber',
    label: 'eth_getBlockByNumber',
    params: [
      {
        name: 'block',
        label: 'Block',
        placeholder: 'latest or 0x...',
        defaultValue: 'latest',
      },
      {
        name: 'fullTransactions',
        label: 'Full Transactions',
        placeholder: 'true or false',
        defaultValue: 'false',
      },
    ],
  },
  {
    name: 'eth_getTransactionCount',
    label: 'eth_getTransactionCount',
    params: [
      {
        name: 'address',
        label: 'Address',
        placeholder: '0x...',
        defaultValue: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      },
      {
        name: 'block',
        label: 'Block',
        placeholder: 'latest, earliest, or block number',
        defaultValue: 'latest',
      },
    ],
  },
  {
    name: 'eth_getCode',
    label: 'eth_getCode',
    params: [
      {
        name: 'address',
        label: 'Contract Address',
        placeholder: '0x...',
        defaultValue: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      },
      {
        name: 'block',
        label: 'Block',
        placeholder: 'latest, earliest, or block number',
        defaultValue: 'latest',
      },
    ],
  },
]

// Keep RPC_METHODS as alias for backwards compat
export const RPC_METHODS = ELECTRUM_METHODS

export const SUBSCRIPTION_METHODS: RpcMethod[] = [
  {
    name: 'blockchain.headers.subscribe',
    label: 'Block Headers',
    params: [],
    isSubscription: true,
  },
  {
    name: 'blockchain.address.subscribe',
    label: 'Address Activity',
    params: [
      {
        name: 'address',
        label: 'Address',
        placeholder: 'bitcoincash:qp...',
        defaultValue: '',
      },
    ],
    isSubscription: true,
  },
]

export const ETHEREUM_SUBSCRIPTION_METHODS: RpcMethod[] = [
  {
    name: 'eth_subscribe:newHeads',
    label: 'New Blocks',
    params: [],
    isSubscription: true,
  },
  {
    name: 'eth_subscribe:logs',
    label: 'Logs (USDC Transfers)',
    params: [],
    isSubscription: true,
  },
]

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}
