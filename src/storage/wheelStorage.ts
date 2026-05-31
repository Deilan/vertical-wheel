import { openDB } from 'idb'
import type { DBSchema } from 'idb'
import type { WheelConfig } from '../domain/types'

const DATABASE_NAME = 'vertical-wheel'
const DATABASE_VERSION = 1
const CURRENT_WHEEL_KEY = 'current'

type WheelStorageRecord = {
  key: string
  config: WheelConfig
  updatedAt: string
}

interface WheelDatabase extends DBSchema {
  wheels: {
    key: string
    value: WheelStorageRecord
  }
}

async function getDatabase() {
  return openDB<WheelDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('wheels')) {
        database.createObjectStore('wheels', { keyPath: 'key' })
      }
    },
  })
}

export async function saveWheelConfig(config: WheelConfig): Promise<void> {
  const database = await getDatabase()
  await database.put('wheels', {
    key: CURRENT_WHEEL_KEY,
    config,
    updatedAt: new Date().toISOString(),
  })
}

export async function loadWheelConfig(): Promise<WheelConfig | undefined> {
  const database = await getDatabase()
  const record = await database.get('wheels', CURRENT_WHEEL_KEY)

  return record?.config
}

export async function deleteWheelConfig(): Promise<void> {
  const database = await getDatabase()
  await database.delete('wheels', CURRENT_WHEEL_KEY)
}
