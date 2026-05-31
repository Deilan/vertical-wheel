import { demoWheelConfig } from './domain/demoWheel'
import styles from './App.module.css'

function App() {
  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="app-title">
        <p className={styles.kicker}>Этап 1</p>
        <h1 id="app-title">{demoWheelConfig.wheel.title}</h1>
        <p className={styles.description}>
          Базовая структура проекта готова. Полный интерфейс барабана появится на следующем этапе.
        </p>

        <ul className={styles.optionList} aria-label="Демо-опции">
          {demoWheelConfig.wheel.options.map((option) => (
            <li className={styles.option} key={option.id}>
              <span className={styles.emoji} aria-hidden="true">
                {option.emoji}
              </span>
              <span>
                <strong>{option.title}</strong>
                <small>{option.subtitle}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default App
