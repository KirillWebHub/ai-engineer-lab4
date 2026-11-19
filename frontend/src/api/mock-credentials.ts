import { ApiError } from './errors'

const iterations = 210_000

export interface MockVerifier {
  algorithm: 'PBKDF2-SHA256'
  iterations: number
  salt: string
  hash: string
}

// Seed accounts and v1 profiles have no password. A dummy derivation keeps the
// failed-login path the same for absent users and accounts without a verifier.
export const dummyVerifier: MockVerifier = {
  algorithm: 'PBKDF2-SHA256', iterations,
  salt: '0'.repeat(32), hash: '0'.repeat(64),
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Запрос отменён.', 'AbortError')
}

export function isMockVerifier(value: unknown): value is MockVerifier {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return entry.algorithm === 'PBKDF2-SHA256' && entry.iterations === iterations &&
    typeof entry.salt === 'string' && /^[a-f0-9]{32}$/.test(entry.salt) &&
    typeof entry.hash === 'string' && /^[a-f0-9]{64}$/.test(entry.hash)
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function derive(password: string, salt: string, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal)
  if (!globalThis.crypto?.subtle) {
    throw new ApiError(500, {
      code: 'CRYPTO_UNAVAILABLE',
      message: 'Браузер не поддерживает локальный вход. Откройте приложение через localhost или HTTPS.',
    })
  }
  const bytes = Uint8Array.from(salt.match(/../g) ?? [], pair => Number.parseInt(pair, 16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  throwIfAborted(signal)
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytes, iterations, hash: 'SHA-256' }, key, 256)
  // WebCrypto does not cancel an in-flight derivation; cancellation still blocks
  // every storage/session mutation once the result arrives.
  throwIfAborted(signal)
  return hex(new Uint8Array(bits))
}

export async function createMockVerifier(password: string, signal?: AbortSignal): Promise<MockVerifier> {
  throwIfAborted(signal)
  if (!globalThis.crypto?.getRandomValues) {
    throw new ApiError(500, { code: 'CRYPTO_UNAVAILABLE', message: 'Браузер не поддерживает локальный вход.' })
  }
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
  return { algorithm: 'PBKDF2-SHA256', iterations, salt, hash: await derive(password, salt, signal) }
}

export async function matchesMockVerifier(password: string, verifier: MockVerifier, signal?: AbortSignal): Promise<boolean> {
  const hash = await derive(password, verifier.salt, signal)
  let difference = 0
  for (let i = 0; i < hash.length; i += 1) difference |= hash.charCodeAt(i) ^ verifier.hash.charCodeAt(i)
  return difference === 0
}
