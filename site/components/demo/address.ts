/**
 * Bitcoin Cash address utilities
 * Converts CashAddr addresses to Electrum scripthashes
 */

const CASHADDR_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

function polymod(values: number[]): bigint {
  const GEN = [
    0x98f2bc8e61n,
    0x79b76d99e2n,
    0xf33e5fb3c4n,
    0xae2eabe2a8n,
    0x1e4f43e470n,
  ]
  let c = 1n
  for (const d of values) {
    const c0 = c >> 35n
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d)
    for (let i = 0; i < 5; i++) {
      if ((c0 >> BigInt(i)) & 1n) {
        c ^= GEN[i]
      }
    }
  }
  return c ^ 1n
}

function prefixExpand(prefix: string): number[] {
  const result: number[] = []
  for (const char of prefix) {
    result.push(char.charCodeAt(0) & 0x1f)
  }
  result.push(0)
  return result
}

function decodeCashAddr(address: string): { prefix: string; hash: Uint8Array; type: number } | null {
  // Remove prefix if present
  let addr = address.toLowerCase()
  let prefix = 'bitcoincash'

  if (addr.includes(':')) {
    const parts = addr.split(':')
    prefix = parts[0]
    addr = parts[1]
  }

  // Decode base32
  const data: number[] = []
  for (const char of addr) {
    const idx = CASHADDR_CHARSET.indexOf(char)
    if (idx === -1) return null
    data.push(idx)
  }

  // Verify checksum
  const payload = prefixExpand(prefix).concat(data)
  if (polymod(payload) !== 0n) {
    return null
  }

  // Remove checksum (last 8 characters = 40 bits)
  const values = data.slice(0, -8)

  // Convert from 5-bit to 8-bit
  let acc = 0
  let bits = 0
  const result: number[] = []

  for (const value of values) {
    acc = (acc << 5) | value
    bits += 5
    while (bits >= 8) {
      bits -= 8
      result.push((acc >> bits) & 0xff)
    }
  }

  if (result.length === 0) return null

  // First byte is version
  const version = result[0]
  const hash = new Uint8Array(result.slice(1))

  // Version byte format: type (4 bits) + size (4 bits)
  const type = version >> 3

  return { prefix, hash, type }
}

function createP2PKHScript(hash: Uint8Array): Uint8Array {
  // OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
  const script = new Uint8Array(25)
  script[0] = 0x76 // OP_DUP
  script[1] = 0xa9 // OP_HASH160
  script[2] = 0x14 // Push 20 bytes
  script.set(hash, 3)
  script[23] = 0x88 // OP_EQUALVERIFY
  script[24] = 0xac // OP_CHECKSIG
  return script
}

function createP2SHScript(hash: Uint8Array): Uint8Array {
  // OP_HASH160 <20 bytes> OP_EQUAL
  const script = new Uint8Array(23)
  script[0] = 0xa9 // OP_HASH160
  script[1] = 0x14 // Push 20 bytes
  script.set(hash, 2)
  script[22] = 0x87 // OP_EQUAL
  return script
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(hashBuffer)
}

function reverseBytes(bytes: Uint8Array): Uint8Array {
  const reversed = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    reversed[i] = bytes[bytes.length - 1 - i]
  }
  return reversed
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Convert a Bitcoin Cash address to an Electrum scripthash
 * Supports CashAddr format (with or without bitcoincash: prefix)
 */
export async function addressToScripthash(address: string): Promise<string> {
  const decoded = decodeCashAddr(address)
  if (!decoded) {
    throw new Error('Invalid address format')
  }

  let script: Uint8Array
  if (decoded.type === 0) {
    // P2PKH
    script = createP2PKHScript(decoded.hash)
  } else if (decoded.type === 1) {
    // P2SH
    script = createP2SHScript(decoded.hash)
  } else {
    throw new Error(`Unsupported address type: ${decoded.type}`)
  }

  const hash = await sha256(script)
  const reversed = reverseBytes(hash)
  return toHex(reversed)
}

/**
 * Check if a string looks like a scripthash (64 hex characters)
 */
export function isScripthash(value: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(value)
}

/**
 * Convert address to scripthash, or return as-is if already a scripthash
 */
export async function toScripthash(value: string): Promise<string> {
  const trimmed = value.trim()
  if (isScripthash(trimmed)) {
    return trimmed.toLowerCase()
  }
  return addressToScripthash(trimmed)
}
