import type { ValidationResult, WheelConfig, WheelImage, WheelOption, WheelSettings } from './types'
import { WHEEL_LIMITS, WHEEL_SETTING_LIMITS } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function hasLength(value: string, maxLength: number): boolean {
  return Array.from(value).length <= maxLength
}

function isColorLike(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validateNumberRange(
  value: unknown,
  field: keyof typeof WHEEL_SETTING_LIMITS,
): value is number {
  const limit = WHEEL_SETTING_LIMITS[field]
  return typeof value === 'number' && Number.isFinite(value) && value >= limit.min && value <= limit.max
}

function validateImage(value: unknown): ValidationResult<WheelImage | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined }
  }

  if (!isRecord(value)) {
    return { ok: false, error: 'Картинка должна быть объектом.' }
  }

  if (value.kind !== 'url' && value.kind !== 'data') {
    return { ok: false, error: 'Тип картинки должен быть url или data.' }
  }

  if (typeof value.value !== 'string' || value.value.trim().length === 0) {
    return { ok: false, error: 'Значение картинки не должно быть пустым.' }
  }

  return { ok: true, value: { kind: value.kind, value: value.value } }
}

function validateSettings(value: unknown): ValidationResult<WheelSettings> {
  if (!isRecord(value)) {
    return { ok: false, error: 'Настройки барабана должны быть объектом.' }
  }

  if (value.theme !== 'dark' && value.theme !== 'light') {
    return { ok: false, error: 'Тема должна быть dark или light.' }
  }

  if (!isColorLike(value.appBackgroundColor) || !isColorLike(value.pointerColor)) {
    return { ok: false, error: 'Цвета настроек должны быть непустыми строками.' }
  }

  const cardHeightPx = value.cardHeightPx
  const cardGapPx = value.cardGapPx
  const imageSizePx = value.imageSizePx
  const titleFontSizePx = value.titleFontSizePx
  const subtitleFontSizePx = value.subtitleFontSizePx
  const cardBorderRadiusPx = value.cardBorderRadiusPx

  for (const field of Object.keys(WHEEL_SETTING_LIMITS) as Array<keyof typeof WHEEL_SETTING_LIMITS>) {
    if (!validateNumberRange(value[field], field)) {
      const limit = WHEEL_SETTING_LIMITS[field]
      return { ok: false, error: `Поле ${field} должно быть числом от ${limit.min} до ${limit.max}.` }
    }
  }

  return {
    ok: true,
    value: {
      theme: value.theme,
      appBackgroundColor: value.appBackgroundColor,
      pointerColor: value.pointerColor,
      cardHeightPx: cardHeightPx as number,
      cardGapPx: cardGapPx as number,
      imageSizePx: imageSizePx as number,
      titleFontSizePx: titleFontSizePx as number,
      subtitleFontSizePx: subtitleFontSizePx as number,
      cardBorderRadiusPx: cardBorderRadiusPx as number,
    },
  }
}

function validateOption(value: unknown): ValidationResult<WheelOption> {
  if (!isRecord(value)) {
    return { ok: false, error: 'Опция должна быть объектом.' }
  }

  if (typeof value.id !== 'string' || value.id.trim().length === 0) {
    return { ok: false, error: 'У каждой опции должен быть id.' }
  }

  if (
    typeof value.title !== 'string' ||
    value.title.trim().length === 0 ||
    !hasLength(value.title, WHEEL_LIMITS.titleMaxLength)
  ) {
    return { ok: false, error: `Название опции обязательно и должно быть до ${WHEEL_LIMITS.titleMaxLength} символов.` }
  }

  if (!isOptionalString(value.subtitle) || (value.subtitle !== undefined && !hasLength(value.subtitle, WHEEL_LIMITS.subtitleMaxLength))) {
    return { ok: false, error: `Подзаголовок должен быть строкой до ${WHEEL_LIMITS.subtitleMaxLength} символов.` }
  }

  if (!isOptionalString(value.emoji)) {
    return { ok: false, error: 'Emoji должен быть строкой.' }
  }

  if (!isColorLike(value.backgroundColor) || !isColorLike(value.textColor)) {
    return { ok: false, error: 'Цвета опции должны быть непустыми строками.' }
  }

  const image = validateImage(value.image)
  if (!image.ok) {
    return image
  }

  return {
    ok: true,
    value: {
      id: value.id,
      title: value.title,
      subtitle: value.subtitle,
      emoji: value.emoji,
      image: image.value,
      backgroundColor: value.backgroundColor,
      textColor: value.textColor,
    },
  }
}

export function validateWheelConfig(value: unknown): ValidationResult<WheelConfig> {
  if (!isRecord(value)) {
    return { ok: false, error: 'JSON должен содержать объект конфигурации.' }
  }

  if (value.version !== 1) {
    return { ok: false, error: 'Поддерживается только версия конфигурации 1.' }
  }

  if (!isRecord(value.wheel)) {
    return { ok: false, error: 'Поле wheel должно быть объектом.' }
  }

  const { wheel } = value

  if (typeof wheel.id !== 'string' || wheel.id.trim().length === 0) {
    return { ok: false, error: 'У барабана должен быть id.' }
  }

  if (!isOptionalString(wheel.title) || !isOptionalString(wheel.description)) {
    return { ok: false, error: 'Название и описание барабана должны быть строками.' }
  }

  const settings = validateSettings(wheel.settings)
  if (!settings.ok) {
    return settings
  }

  if (!Array.isArray(wheel.options)) {
    return { ok: false, error: 'Опции барабана должны быть массивом.' }
  }

  if (wheel.options.length < WHEEL_LIMITS.minOptions || wheel.options.length > WHEEL_LIMITS.maxOptions) {
    return {
      ok: false,
      error: `Количество опций должно быть от ${WHEEL_LIMITS.minOptions} до ${WHEEL_LIMITS.maxOptions}.`,
    }
  }

  const options: WheelOption[] = []
  const optionIds = new Set<string>()

  for (const rawOption of wheel.options) {
    const option = validateOption(rawOption)
    if (!option.ok) {
      return option
    }

    if (optionIds.has(option.value.id)) {
      return { ok: false, error: 'Id опций не должны повторяться.' }
    }

    optionIds.add(option.value.id)
    options.push(option.value)
  }

  return {
    ok: true,
    value: {
      version: 1,
      wheel: {
        id: wheel.id,
        title: wheel.title,
        description: wheel.description,
        settings: settings.value,
        options,
      },
    },
  }
}

export function parseWheelConfigJson(json: string): ValidationResult<WheelConfig> {
  try {
    return validateWheelConfig(JSON.parse(json) as unknown)
  } catch {
    return { ok: false, error: 'Не удалось прочитать JSON.' }
  }
}
