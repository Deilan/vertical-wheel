import type { WheelOption } from './types'

export function getWinningOptionIndex(
  scrollOffsetPx: number,
  cardStepPx: number,
  optionCount: number,
): number {
  if (optionCount <= 0) {
    throw new Error('Для расчета результата нужна хотя бы одна опция.')
  }

  if (cardStepPx <= 0) {
    throw new Error('Шаг карточки должен быть положительным.')
  }

  const virtualIndex = Math.round(scrollOffsetPx / cardStepPx)
  return ((virtualIndex % optionCount) + optionCount) % optionCount
}

export function getWinningOption(
  options: WheelOption[],
  scrollOffsetPx: number,
  cardStepPx: number,
): WheelOption {
  return options[getWinningOptionIndex(scrollOffsetPx, cardStepPx, options.length)]
}
