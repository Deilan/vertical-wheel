import { compressToUint8Array, decompressFromUint8Array } from 'lz-string'
import type { ValidationResult, WheelConfig, WheelOption } from './types'
import { WHEEL_LIMITS } from './types'
import { validateWheelConfig } from './validation'
import { base64UrlToBytes, bytesToBase64Url } from '../utils/base64url'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function bytesToBinaryString(bytes: Uint8Array): string {
  let result = ''

  for (const byte of bytes) {
    result += String.fromCharCode(byte)
  }

  return result
}

function binaryStringToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)

  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index)
  }

  return bytes
}

function stripLocalImageFromOption(option: WheelOption): WheelOption {
  if (option.image?.kind === 'url') {
    return { ...option, image: { ...option.image } }
  }

  return {
    id: option.id,
    title: option.title,
    subtitle: option.subtitle,
    emoji: option.emoji,
    backgroundColor: option.backgroundColor,
    textColor: option.textColor,
    afterResultBehavior: option.afterResultBehavior,
    askAllowedDecisions: option.askAllowedDecisions,
  }
}

export function stripLocalImagesFromShareConfig(config: WheelConfig): WheelConfig {
  return {
    ...config,
    wheel: {
      ...config.wheel,
      options: config.wheel.options.map(stripLocalImageFromOption),
    },
  }
}

export function encodeShareConfig(config: WheelConfig): ValidationResult<string> {
  const shareConfig = stripLocalImagesFromShareConfig(config)
  const json = JSON.stringify(shareConfig)
  const utf8Binary = bytesToBinaryString(textEncoder.encode(json))
  const compressed = compressToUint8Array(utf8Binary)
  const encoded = bytesToBase64Url(compressed)

  if (encoded.length > WHEEL_LIMITS.maxEncodedConfigLength) {
    return {
      ok: false,
      error: 'Ссылка слишком длинная. Уменьшите текст или используйте JSON export.',
    }
  }

  return { ok: true, value: encoded }
}

export function decodeShareConfig(encoded: string): ValidationResult<WheelConfig> {
  try {
    const compressed = base64UrlToBytes(encoded)
    const utf8Binary = decompressFromUint8Array(compressed)

    if (utf8Binary === null) {
      return { ok: false, error: 'Не удалось распаковать конфигурацию из ссылки.' }
    }

    const json = textDecoder.decode(binaryStringToBytes(utf8Binary))
    const parsed = JSON.parse(json) as unknown

    return validateWheelConfig(parsed)
  } catch {
    return { ok: false, error: 'Не удалось прочитать конфигурацию из ссылки.' }
  }
}

export function createShareHash(config: WheelConfig): ValidationResult<string> {
  const encoded = encodeShareConfig(config)

  if (!encoded.ok) {
    return encoded
  }

  return { ok: true, value: `#wheel=${encoded.value}` }
}

export function readShareConfigFromHash(hash: string): ValidationResult<WheelConfig | undefined> {
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(withoutHash)
  const encoded = params.get('wheel')

  if (!encoded) {
    return { ok: true, value: undefined }
  }

  return decodeShareConfig(encoded)
}
