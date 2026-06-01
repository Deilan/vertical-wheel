# Шаблон результатов ручного тестирования

Используйте этот файл как копируемый шаблон для одного полного прогона ручного QA.

## 1. Окружение

- Дата и время:
- Commit hash:
- OS:
- Браузер и версия:
- Устройство:
- Размер экрана / viewport:
- App URL:

## 2. Summary

- Passed:
- Failed:
- Blocked:
- Not tested:

Краткий вывод:

```text
Например: критичных дефектов не найдено, мобильные жесты требуют дополнительной проверки на iOS.
```

## 3. Таблица чеклиста

Статусы: `PASS`, `FAIL`, `WARN`, `BLOCKED`.

| Area | Test case | Status | Notes | Screenshot/video |
| --- | --- | --- | --- | --- |
| Startup | Открытие приложения без `#wheel` |  |  |  |
| Startup | Перезагрузка после локальных изменений |  |  |  |
| Spin | Слабый жест не создает результат |  |  |  |
| Spin | Валидный свайп создает результат |  |  |  |
| Spin | Свайп вверх и вниз работают |  |  |  |
| Spin | Итоговая карточка выровнена по указателю |  |  |  |
| History | История показывает дату/время |  |  |  |
| History | В истории максимум 10 записей |  |  |  |
| History | Очистка истории работает |  |  |  |
| Editor | Вход и выход из редактора |  |  |  |
| Editor | WYSIWYG-превью обновляется сразу |  |  |  |
| Editor | Добавление, удаление, reorder опций |  |  |  |
| Editor | Валидация обязательного title |  |  |  |
| Editor | Min 2 / max 30 опций |  |  |  |
| Settings | Slider и number input синхронизированы |  |  |  |
| Exclusion | Global keep/exclude/ask |  |  |  |
| Exclusion | Per-option inherit/keep/exclude/ask |  |  |  |
| Exclusion | Ask блокирует следующий spin до решения |  |  |  |
| Exclusion | Hidden excluded опции исчезают из барабана |  |  |  |
| Exclusion | Visible-disabled excluded опции не становятся результатом |  |  |  |
| Exclusion | Restore one / restore all |  |  |  |
| Exclusion | Active count меньше 2 блокирует spin |  |  |  |
| Exclusion | Share link сбрасывает текущее excluded state |  |  |  |
| Exclusion | JSON import сбрасывает текущее excluded state |  |  |  |
| Images | Upload PNG/JPG/JPEG/WebP |  |  |  |
| Images | Image URL отображается без конвертации |  |  |  |
| Images | Приоритет image > emoji > placeholder |  |  |  |
| JSON | Export включает полный конфиг и картинки |  |  |  |
| JSON | Import заменяет текущий барабан |  |  |  |
| Share | Share link копируется и открывается |  |  |  |
| Share | Картинки исключены из share link |  |  |  |
| Share | Кириллица и emoji сохраняются |  |  |  |
| Mobile | 360px portrait не ломается |  |  |  |
| Mobile | iOS Safari gestures |  |  |  |
| Mobile | Android Chrome gestures |  |  |  |
| Regression | `npm run lint` |  |  |  |
| Regression | `npm run typecheck` |  |  |  |
| Regression | `npm run test:run` |  |  |  |
| Regression | `npm run build` |  |  |  |

## 4. Шаблон дефекта

### Дефект #1

- Title:
- Severity: `Critical` / `High` / `Medium` / `Low`
- Device/browser:
- Viewport:
- Suspected area: `spin` / `editor` / `exclusion` / `images` / `json` / `share` / `history` / `mobile`
- Steps to reproduce:

```text
1.
2.
3.
```

- Expected result:

```text

```

- Actual result:

```text

```

- Console errors:

```text

```

- Screenshot/video:

```text

```

## 5. Final decision

Выберите один итог:

- [ ] Ready for tuning
- [ ] Needs fixes
- [ ] Ready for deployment experiment

Комментарий к решению:

```text

```
