import { readFile } from 'node:fs/promises'

interface EvaluationTask {
  readonly category: string
  readonly id: string
  readonly prompt: string
  readonly success: readonly string[]
}

const url = new URL('../evaluation/v1/tasks.json', import.meta.url)
const tasks = JSON.parse(
  await readFile(url, 'utf8'),
) as readonly EvaluationTask[]

if (tasks.length < 30 || tasks.length > 50) {
  throw new Error(`Expected 30-50 evaluation tasks, received ${tasks.length}`)
}
const ids = new Set<string>()
for (const task of tasks) {
  if (!task.id || !task.category || !task.prompt || task.success.length === 0) {
    throw new Error(`Invalid evaluation task: ${JSON.stringify(task)}`)
  }
  if (ids.has(task.id)) {
    throw new Error(`Duplicate evaluation task id: ${task.id}`)
  }
  ids.add(task.id)
}
console.log(`Validated ${tasks.length} Chat 2 evaluation tasks`)
