import type { ToolPart } from './types'

const TOOL_LABELS: Record<string, string> = {
  read: 'Читает файл',
  write: 'Записывает файл',
  edit: 'Правит файл',
  multi_edit: 'Правит файлы',
  bash: 'Выполняет команду',
  webfetch: 'Открывает страницу',
  websearch: 'Ищет в интернете',
  batch_websearch: 'Ищет в интернете',
  glob: 'Ищет файлы',
  grep: 'Ищет в файлах',
  list: 'Смотрит файлы',
  ls: 'Смотрит файлы',
  task: 'Запускает подзадачу',
  question: 'Задаёт вопрос',
  stop: 'Останавливает',
  todoWrite: 'Обновляет план',
  todo_write: 'Обновляет план',
  skill: 'Подключает навык',
  env: 'Читает окружение'
}

export function toolTitle(part: ToolPart): { label: string; detail?: string } {
  const stateTitle = part.state.title
  const label = TOOL_LABELS[part.tool]
  if (!label) return { label: stateTitle || part.tool }
  if (stateTitle && stateTitle !== part.tool) return { label, detail: stateTitle }
  return { label }
}