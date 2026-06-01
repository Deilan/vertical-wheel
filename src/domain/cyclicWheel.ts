export function normalizeCyclicWheelPosition(
  positionPx: number,
  cardStepPx: number,
  optionCount: number,
): number {
  if (optionCount <= 0) {
    throw new Error('Для циклического барабана нужна хотя бы одна опция.')
  }

  if (cardStepPx <= 0) {
    throw new Error('Шаг карточки должен быть положительным.')
  }

  const cyclePx = cardStepPx * optionCount

  return ((positionPx % cyclePx) + cyclePx) % cyclePx
}

export function getCyclicWheelRepeatCycles(
  optionCount: number,
  maxVirtualCardsToTravel: number,
  minRepeatCycles = 9,
): number {
  if (optionCount <= 0) {
    throw new Error('Для циклического барабана нужна хотя бы одна опция.')
  }

  if (maxVirtualCardsToTravel <= 0) {
    throw new Error('Дальность вращения должна быть положительной.')
  }

  const cyclesForTravel = Math.ceil((maxVirtualCardsToTravel + optionCount + 2) / optionCount)
  const repeatCycles = Math.max(minRepeatCycles, cyclesForTravel * 2 + 1)

  return repeatCycles % 2 === 0 ? repeatCycles + 1 : repeatCycles
}

export function getPointerAlignedRepeatedIndex(
  positionPx: number,
  cardStepPx: number,
  optionCount: number,
  baseOptionIndex: number,
): number {
  if (optionCount <= 0) {
    throw new Error('Для циклического барабана нужна хотя бы одна опция.')
  }

  if (cardStepPx <= 0) {
    throw new Error('Шаг карточки должен быть положительным.')
  }

  return baseOptionIndex + Math.round(positionPx / cardStepPx)
}
