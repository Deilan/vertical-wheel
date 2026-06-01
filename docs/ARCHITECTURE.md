# Архитектура приложения

## Общая схема

Приложение построено как client-only static SPA на React, TypeScript и Vite. Вся пользовательская логика выполняется в браузере. Данные сохраняются локально: полный конфиг барабана хранится в IndexedDB, история результатов хранится в `localStorage`.

Основной экран имеет два режима:

- Spin mode: вертикальный барабан, жесты, результат и история.
- Edit mode: редактор с WYSIWYG-превью, настройками, JSON import/export, share link и картинками.

Компоненты находятся в `src/App.tsx`, а доменная логика вынесена в чистые TypeScript-модули в `src/domain`.

## Реализованные этапы

- Stage 1: domain types, demo wheel, validation, share serialization, fingerprint, history utilities, storage wrappers, base64url, image compression module and tests.
- Stage 2: Spin mode, vertical cyclic wheel UI, pointer gestures, spin physics, snap-to-center, result history UI.
- Stage 3: Edit mode, WYSIWYG preview, option editing, visual settings, validation, history reconciliation on semantic changes.
- Stage 4: image upload/compression, image URL, JSON import/export, share link generation/opening.
- Stage C: option exclusion rules, local session state, Spin mode integration, editor controls and QA documentation.

## Domain layer

`src/domain/types.ts` содержит основные типы:

- `WheelConfig` version 1;
- `WheelSettings`;
- `WheelOption`;
- `WheelHistory`;
- `HistoryEntry`;
- validation limits.

`src/domain/demoWheel.ts` содержит нейтральный demo wheel.

`src/domain/validation.ts` валидирует JSON import и runtime-конфиги. Ошибки возвращаются в виде `ValidationResult`.

`src/domain/fingerprint.ts` строит fingerprint смысловой части барабана для истории. Fingerprint зависит от id/title/subtitle/order/count опций и не зависит от визуальных настроек.

`src/domain/history.ts` создает и обновляет историю, ограничивает ее 10 последними записями и сбрасывает при изменении fingerprint.

`src/domain/spinPhysics.ts` содержит чистую логику жестов и вращения: пороги слабого/валидного жеста, ограничение скорости и дистанции, jitter, длительность и финальный snap к карточке.

`src/domain/winningOption.ts` определяет выигравшую опцию по смещению и шагу карточки.

`src/domain/shareConfig.ts` сериализует share config: удаляет картинки, кодирует Unicode-safe JSON, сжимает через `lz-string`, кодирует в base64url и читает `#wheel=...`.

`src/domain/optionExclusion.ts` содержит чистую логику временного исключения опций из будущих вращений:

- effective behavior после результата: `keep`, `exclude`, `ask`;
- per-option override: `inherit`, `keep`, `exclude`, `ask`;
- допустимые решения ask: `keep`, `exclude-hide`, `exclude-show-disabled`;
- active/visible options с режимами `hide` и `show-disabled`;
- применение решений после результата;
- восстановление одной или всех исключенных опций;
- согласование session state с новым конфигом;
- сдвиг финальной цели, если сырой кандидат указывает на visible-disabled excluded option.

Исключение из вращения не удаляет опцию из `WheelConfig`. Удаление — это отдельное действие редактора, которое убирает опцию из конфига.

## Storage layer

`src/storage/wheelStorage.ts` использует IndexedDB через `idb`.

- `saveWheelConfig` сохраняет текущий полный `WheelConfig`, включая картинки.
- `loadWheelConfig` загружает текущий локальный барабан.
- `deleteWheelConfig` удаляет локальный барабан.

`src/storage/historyStorage.ts` использует `localStorage`.

- История хранится отдельно от конфига.
- Ключ истории привязан к `wheel.id`.
- Согласование истории с текущим конфигом происходит через fingerprint.

`src/storage/wheelSessionStorage.ts` хранит локальное состояние исключенных опций:

- состояние привязано к fingerprint смысловой части барабана;
- для каждой исключенной опции хранится `optionId` и display mode;
- визуальные изменения не должны сбрасывать исключения;
- share link и JSON import/export не включают текущее session state.

## Share link flow

1. В Edit mode пользователь нажимает «Скопировать ссылку».
2. `createShareHash` вызывает `encodeShareConfig`.
3. `stripImagesFromConfig` удаляет все `image` поля, включая data images и URL images.
4. JSON кодируется через UTF-8, сжимается `lz-string`, превращается в base64url.
5. В URL кладется hash вида `#wheel=...`.
6. История не участвует в сериализации.
7. Правила исключения после результата входят в сериализуемый config.
8. Текущее состояние исключенных опций не сериализуется.
9. При открытии страницы `readShareConfigFromHash` декодирует и валидирует конфиг.
10. Валидный share config сохраняется в IndexedDB как локальный текущий барабан.
11. Состояние исключенных опций очищается, потому что share link переносит правила, но не текущую сессию.
12. Приложение открывает Spin mode.
13. Если hash невалидный, показывается русская ошибка и используется локальный или demo wheel.

Если encoded config длиннее 6000 символов, пользователь получает ошибку:

```text
Ссылка слишком длинная. Уменьшите текст или используйте JSON export.
```

## JSON import/export flow

Export:

1. Пользователь нажимает «Экспорт JSON» в Edit mode.
2. Текущий `WheelConfig` сериализуется через `JSON.stringify(config, null, 2)`.
3. Создается файл `vertical-wheel-config.json`.
4. В экспорт входят все картинки, включая data URL и image URL.

Import:

1. Пользователь выбирает `.json` файл в Edit mode.
2. Файл читается как текст.
3. `parseWheelConfigJson` парсит и валидирует конфиг.
4. При ошибке показывается русское сообщение.
5. При успехе текущий барабан заменяется импортированным.
6. Импортированный конфиг сохраняется в IndexedDB.
7. Состояние исключенных опций очищается.
8. Открывается Spin mode.

## Image handling flow

Локальная загрузка:

1. Пользователь выбирает файл в option editor.
2. Разрешены PNG, JPG/JPEG и WebP.
3. `compressImageFile` читает файл через `FileReader`.
4. Изображение загружается в `Image`.
5. Размер уменьшается так, чтобы максимальная сторона была не больше 512px.
6. Canvas кодирует изображение в WebP с quality `0.82`.
7. Если WebP не поддержан, используется JPEG fallback.
8. Результат сохраняется в option image как `{ kind: "data", value: dataUrl }`.

Image URL:

1. Пользователь вводит URL картинки.
2. Значение сохраняется как `{ kind: "url", value }`.
3. Приложение не скачивает URL и не конвертирует его в base64.

Отображение карточки:

1. Если есть `image`, показывается image.
2. Если image нет, но есть `emoji`, показывается emoji.
3. Если нет ни image, ни emoji, показывается placeholder.

## Spin physics overview

Spin mode использует Pointer Events. Пока барабан вращается, новые жесты игнорируются.

Слабый жест:

- `dragDistance < 40px` или `releaseVelocity < 350px/s`;
- результат не создается;
- история не обновляется;
- лента snap-ится к ближайшей карточке.

Валидный жест:

- `dragDistance >= 40px` и `releaseVelocity >= 350px/s`;
- направление свайпа влияет на направление вращения;
- скорость и дистанция влияют на virtual travel;
- чрезмерные значения ограничиваются;
- добавляется jitter до ±0.5 карточки;
- финальная позиция округляется к центру карточки;
- после завершения spin результат попадает в историю.
- если выбранная опция имеет effective behavior `exclude`, она исключается из следующих вращений;
- если effective behavior `ask`, следующий spin блокируется до выбора решения.

Если исключенная опция видима как disabled и математический кандидат остановки попадает на нее, финальная цель до анимации сдвигается в направлении spin к ближайшей active option. Поэтому visible-disabled опции могут оставаться в ленте, но не становятся результатом.

## Editor и WYSIWYG

Edit mode работает с единым `WheelConfig` state. Все поля являются controlled inputs. Любое изменение сразу обновляет config, а WYSIWYG-превью рендерится через тот же `WheelView` и `WheelCard`, что и Spin mode.

Редактор поддерживает:

- title/description барабана;
- add/delete/reorder опций;
- title/subtitle/emoji/backgroundColor/textColor опций;
- theme, appBackgroundColor, pointerColor;
- числовые настройки карточек через slider и number input;
- upload image, image URL, remove image;
- global after-result behavior, display mode исключенных опций и ask decisions;
- per-option after-result override и optional custom ask decisions;
- JSON import/export;
- share link copy.

Визуальные изменения не очищают историю. Семантические изменения опций согласуются через fingerprint и могут очищать историю.

## Диагностика option exclusion

В debug mode (`?debug=1`) логируются структурированные события исключения без больших payload:

- `exclusion:option-excluded`;
- `exclusion:option-restored`;
- `exclusion:all-restored`;
- `exclusion:active-count-changed`;
- `after-result:ask-shown`;
- `after-result:decision-keep`;
- `after-result:decision-exclude-hide`;
- `after-result:decision-exclude-show-disabled`.

Debug logger не должен писать base64-картинки, полный JSON или длинные share-ссылки.

## Environment notes для WSL + Codex

Проект ожидает WSL/Linux окружение:

- `node`: `/usr/local/bin/node`;
- `npm`: `/usr/local/bin/npm`;
- `npx`: `/usr/local/bin/npx`;
- Node platform: `linux x64`;
- Node temp dir: `/tmp`.

Не использовать:

- PowerShell;
- `cmd.exe`;
- Windows node.exe;
- `/mnt/c/Program Files/nodejs`;
- bundled `node.exe`.

Перед завершением задач запускать:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

## Что не добавлять без явного решения

- Backend или серверные API.
- Routing.
- Redux.
- Zustand.
- Tailwind.
- UI kit/design system.
- Несогласованные изменения spin physics.
