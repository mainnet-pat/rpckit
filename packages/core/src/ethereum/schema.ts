/**
 * Ethereum JSON-RPC Schema
 *
 * Based on EIP-1474 and common Ethereum node implementations.
 * Hex-encoded strings are used for numeric values as per JSON-RPC spec.
 */

export type EthereumSchema = {
  requests: [
    // Web3 methods
    { method: 'web3_clientVersion'; params: []; return: string },
    { method: 'web3_sha3'; params: [data: string]; return: string },
    // Net methods
    { method: 'net_version'; params: []; return: string },
    { method: 'net_listening'; params: []; return: boolean },
    { method: 'net_peerCount'; params: []; return: string },
    // Eth methods - Chain state
    { method: 'eth_chainId'; params: []; return: string },
    { method: 'eth_blockNumber'; params: []; return: string },
    {
      method: 'eth_syncing'
      params: []
      return:
        | false
        | { startingBlock: string; currentBlock: string; highestBlock: string }
    },
    { method: 'eth_coinbase'; params: []; return: string },
    { method: 'eth_mining'; params: []; return: boolean },
    { method: 'eth_hashrate'; params: []; return: string },
    // Eth methods - Gas
    { method: 'eth_gasPrice'; params: []; return: string },
    { method: 'eth_maxPriorityFeePerGas'; params: []; return: string },
    { method: 'eth_blobBaseFee'; params: []; return: string },
    {
      method: 'eth_feeHistory'
      params: [
        blockCount: string,
        newestBlock: string,
        rewardPercentiles?: number[],
      ]
      return: {
        oldestBlock: string
        baseFeePerGas: string[]
        gasUsedRatio: number[]
        reward?: string[][]
      }
    },
    // Eth methods - Account state
    {
      method: 'eth_getBalance'
      params: [address: string, block: string]
      return: string
    },
    {
      method: 'eth_getTransactionCount'
      params: [address: string, block: string]
      return: string
    },
    {
      method: 'eth_getCode'
      params: [address: string, block: string]
      return: string
    },
    {
      method: 'eth_getStorageAt'
      params: [address: string, position: string, block: string]
      return: string
    },
    // Eth methods - Block
    {
      method: 'eth_getBlockByHash'
      params: [hash: string, fullTransactions: boolean]
      return: {
        number: string | null
        hash: string | null
        parentHash: string
        nonce: string | null
        sha3Uncles: string
        logsBloom: string | null
        transactionsRoot: string
        stateRoot: string
        receiptsRoot: string
        miner: string
        difficulty: string
        totalDifficulty: string | null
        extraData: string
        size: string
        gasLimit: string
        gasUsed: string
        timestamp: string
        transactions: string[] | object[]
        uncles: string[]
        baseFeePerGas?: string
        withdrawalsRoot?: string
        blobGasUsed?: string
        excessBlobGas?: string
      } | null
    },
    {
      method: 'eth_getBlockByNumber'
      params: [block: string, fullTransactions: boolean]
      return: {
        number: string | null
        hash: string | null
        parentHash: string
        nonce: string | null
        sha3Uncles: string
        logsBloom: string | null
        transactionsRoot: string
        stateRoot: string
        receiptsRoot: string
        miner: string
        difficulty: string
        totalDifficulty: string | null
        extraData: string
        size: string
        gasLimit: string
        gasUsed: string
        timestamp: string
        transactions: string[] | object[]
        uncles: string[]
        baseFeePerGas?: string
        withdrawalsRoot?: string
        blobGasUsed?: string
        excessBlobGas?: string
      } | null
    },
    {
      method: 'eth_getBlockTransactionCountByHash'
      params: [hash: string]
      return: string
    },
    {
      method: 'eth_getBlockTransactionCountByNumber'
      params: [block: string]
      return: string
    },
    {
      method: 'eth_getUncleCountByBlockHash'
      params: [hash: string]
      return: string
    },
    {
      method: 'eth_getUncleCountByBlockNumber'
      params: [block: string]
      return: string
    },
    // Eth methods - Transaction
    {
      method: 'eth_getTransactionByHash'
      params: [hash: string]
      return: {
        blockHash: string | null
        blockNumber: string | null
        from: string
        gas: string
        gasPrice?: string
        maxFeePerGas?: string
        maxPriorityFeePerGas?: string
        hash: string
        input: string
        nonce: string
        to: string | null
        transactionIndex: string | null
        value: string
        type: string
        chainId?: string
        v: string
        r: string
        s: string
      } | null
    },
    {
      method: 'eth_getTransactionByBlockHashAndIndex'
      params: [hash: string, index: string]
      return: {
        blockHash: string | null
        blockNumber: string | null
        from: string
        gas: string
        gasPrice?: string
        maxFeePerGas?: string
        maxPriorityFeePerGas?: string
        hash: string
        input: string
        nonce: string
        to: string | null
        transactionIndex: string | null
        value: string
        type: string
        chainId?: string
        v: string
        r: string
        s: string
      } | null
    },
    {
      method: 'eth_getTransactionByBlockNumberAndIndex'
      params: [block: string, index: string]
      return: {
        blockHash: string | null
        blockNumber: string | null
        from: string
        gas: string
        gasPrice?: string
        maxFeePerGas?: string
        maxPriorityFeePerGas?: string
        hash: string
        input: string
        nonce: string
        to: string | null
        transactionIndex: string | null
        value: string
        type: string
        chainId?: string
        v: string
        r: string
        s: string
      } | null
    },
    {
      method: 'eth_getTransactionReceipt'
      params: [hash: string]
      return: {
        transactionHash: string
        transactionIndex: string
        blockHash: string
        blockNumber: string
        from: string
        to: string | null
        cumulativeGasUsed: string
        effectiveGasPrice: string
        gasUsed: string
        contractAddress: string | null
        logs: Array<{
          removed: boolean
          logIndex: string | null
          transactionIndex: string | null
          transactionHash: string | null
          blockHash: string | null
          blockNumber: string | null
          address: string
          data: string
          topics: string[]
        }>
        logsBloom: string
        type: string
        root?: string
        status?: string
      } | null
    },
    // Eth methods - Call & Estimate
    {
      method: 'eth_call'
      params: [
        transaction: {
          from?: string
          to?: string
          gas?: string
          gasPrice?: string
          value?: string
          data?: string
        },
        block: string,
      ]
      return: string
    },
    {
      method: 'eth_estimateGas'
      params: [
        transaction: {
          from?: string
          to?: string
          gas?: string
          gasPrice?: string
          value?: string
          data?: string
        },
        block?: string,
      ]
      return: string
    },
    // Eth methods - Send transaction
    {
      method: 'eth_sendRawTransaction'
      params: [signedTransaction: string]
      return: string
    },
    {
      method: 'eth_sendTransaction'
      params: [
        transaction: {
          from?: string
          to?: string
          gas?: string
          gasPrice?: string
          value?: string
          data?: string
          nonce?: string
        },
      ]
      return: string
    },
    // Eth methods - Logs
    {
      method: 'eth_getLogs'
      params: [
        filter: {
          fromBlock?: string
          toBlock?: string
          address?: string | string[]
          topics?: (string | string[] | null)[]
          blockHash?: string
        },
      ]
      return: Array<{
        removed: boolean
        logIndex: string | null
        transactionIndex: string | null
        transactionHash: string | null
        blockHash: string | null
        blockNumber: string | null
        address: string
        data: string
        topics: string[]
      }>
    },
    // Eth methods - Filters (polling-based)
    {
      method: 'eth_newFilter'
      params: [
        filter: {
          fromBlock?: string
          toBlock?: string
          address?: string | string[]
          topics?: (string | string[] | null)[]
        },
      ]
      return: string
    },
    { method: 'eth_newBlockFilter'; params: []; return: string },
    { method: 'eth_newPendingTransactionFilter'; params: []; return: string },
    {
      method: 'eth_getFilterChanges'
      params: [filterId: string]
      return:
        | Array<{
            removed: boolean
            logIndex: string | null
            transactionIndex: string | null
            transactionHash: string | null
            blockHash: string | null
            blockNumber: string | null
            address: string
            data: string
            topics: string[]
          }>
        | string[]
    },
    {
      method: 'eth_getFilterLogs'
      params: [filterId: string]
      return: Array<{
        removed: boolean
        logIndex: string | null
        transactionIndex: string | null
        transactionHash: string | null
        blockHash: string | null
        blockNumber: string | null
        address: string
        data: string
        topics: string[]
      }>
    },
    {
      method: 'eth_uninstallFilter'
      params: [filterId: string]
      return: boolean
    },
    // Eth methods - Sign (wallet)
    {
      method: 'eth_sign'
      params: [address: string, message: string]
      return: string
    },
    {
      method: 'eth_signTransaction'
      params: [
        transaction: {
          from?: string
          to?: string
          gas?: string
          gasPrice?: string
          value?: string
          data?: string
          nonce?: string
        },
      ]
      return: string
    },
    // Eth methods - Accounts (wallet)
    { method: 'eth_accounts'; params: []; return: string[] },
    { method: 'eth_requestAccounts'; params: []; return: string[] },
    // Subscription management
    {
      method: 'eth_unsubscribe'
      params: [subscriptionId: string]
      return: boolean
    },
  ]
  subscriptions: [
    // newHeads subscription
    {
      method: 'eth_subscribe'
      params: ['newHeads']
      return: [
        header: {
          number: string
          hash: string
          parentHash: string
          nonce: string
          sha3Uncles: string
          logsBloom: string
          transactionsRoot: string
          stateRoot: string
          receiptsRoot: string
          miner: string
          difficulty: string
          extraData: string
          gasLimit: string
          gasUsed: string
          timestamp: string
          baseFeePerGas?: string
        },
      ]
    },
    // logs subscription
    {
      method: 'eth_subscribe'
      params: [
        'logs',
        filter: {
          address?: string | string[]
          topics?: (string | string[] | null)[]
        },
      ]
      return: [
        log: {
          removed: boolean
          logIndex: string | null
          transactionIndex: string | null
          transactionHash: string | null
          blockHash: string | null
          blockNumber: string | null
          address: string
          data: string
          topics: string[]
        },
      ]
    },
    // newPendingTransactions subscription
    {
      method: 'eth_subscribe'
      params: ['newPendingTransactions']
      return: [txHash: string]
    },
    // syncing subscription
    {
      method: 'eth_subscribe'
      params: ['syncing']
      return: [
        status:
          | false
          | {
              startingBlock: string
              currentBlock: string
              highestBlock: string
            },
      ]
    },
  ]
}
