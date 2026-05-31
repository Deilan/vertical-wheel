import type { WheelConfig, WheelSettings } from './types'

export const defaultWheelSettings: WheelSettings = {
  theme: 'dark',
  appBackgroundColor: '#111827',
  pointerColor: '#f97316',
  cardHeightPx: 112,
  cardGapPx: 12,
  imageSizePx: 56,
  titleFontSizePx: 22,
  subtitleFontSizePx: 15,
  cardBorderRadiusPx: 18,
}

export const demoWheelConfig: WheelConfig = {
  version: 1,
  wheel: {
    id: 'demo-wheel',
    title: 'Что выбрать?',
    description: 'Нейтральный демо-барабан для первого запуска.',
    settings: defaultWheelSettings,
    options: [
      {
        id: 'pizza',
        title: 'Пицца',
        subtitle: 'заказать что-то вкусное',
        emoji: '🍕',
        backgroundColor: '#fff7ed',
        textColor: '#1f2937',
      },
      {
        id: 'movie',
        title: 'Кино',
        subtitle: 'посмотреть фильм',
        emoji: '🎬',
        backgroundColor: '#eef2ff',
        textColor: '#1f2937',
      },
      {
        id: 'walk',
        title: 'Прогулка',
        subtitle: 'выйти на улицу',
        emoji: '🚶',
        backgroundColor: '#ecfdf5',
        textColor: '#1f2937',
      },
      {
        id: 'book',
        title: 'Книга',
        subtitle: 'почитать 20 минут',
        emoji: '📚',
        backgroundColor: '#fdf2f8',
        textColor: '#1f2937',
      },
      {
        id: 'surprise',
        title: 'Сюрприз',
        subtitle: 'придумать на месте',
        emoji: '🎲',
        backgroundColor: '#fefce8',
        textColor: '#1f2937',
      },
    ],
  },
}
