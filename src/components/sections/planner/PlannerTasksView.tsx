import {
  CheckCircle2,
  Circle,
  ExternalLink,
  LockKeyhole,
  Plus,
  Trash2,
} from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import type { IntegrationSource } from '../../../lib/integrations'
import {
  filterPlannerTodos,
  type PlannerTaskFilter,
} from '../../../lib/planner'
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  sortTodos,
  type Todo,
} from '../../../lib/todos'
import {
  PROVIDER_FALLBACK,
  TASK_FILTERS,
  isPlannerItemReadOnly,
  shortDate,
  sourceLabel,
  type PlannerItemSelection,
} from './workstationShared'

export interface PlannerTasksViewProps {
  todos: Todo[]
  sources: IntegrationSource[]
  readOnlySourceKeys: Set<string>
  pendingTodoIds: Set<string>
  onToggleTodo: (todo: Todo) => void
  onAddTodo: () => void
  onSelectItem?: (selection: PlannerItemSelection) => void
  onDeleteTodo?: (id: string) => void
  deletingTodoIds?: Set<string>
}

export function PlannerTasksView({
  todos,
  sources,
  readOnlySourceKeys,
  pendingTodoIds,
  onToggleTodo,
  onAddTodo,
  onSelectItem,
  onDeleteTodo,
  deletingTodoIds = new Set<string>(),
}: PlannerTasksViewProps) {
  const [taskFilter, setTaskFilter] = useState<PlannerTaskFilter>('all')
  const [taskSourceId, setTaskSourceId] = useState('all')

  const taskSources = useMemo(
    () => sources.filter(
      (source) => source.selected && source.resource_type === 'task_list',
    ),
    [sources],
  )
  const selectedSource = taskSources.find(
    (source) => source.id === taskSourceId,
  )
  const filteredTodos = useMemo(
    () => sortTodos(filterPlannerTodos(todos, taskFilter))
      .filter((todo) => taskSourceId === 'all'
        || (
          selectedSource
          && todo.source_provider === selectedSource.provider
          && todo.external_source_id === selectedSource.external_id
        )),
    [
      selectedSource,
      taskFilter,
      taskSourceId,
      todos,
    ],
  )

  return (
    <section className="planner-task-workspace" aria-label="할 일 워크스페이스">
      <aside className="planner-task-sidebar">
        <div>
          <p className="planner-kicker">Smart lists</p>
          <nav aria-label="할 일 스마트 목록" className="planner-task-filters">
            {TASK_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={
                  taskFilter === filter.id && taskSourceId === 'all'
                }
                onClick={() => {
                  setTaskFilter(filter.id)
                  setTaskSourceId('all')
                }}
                className={
                  taskFilter === filter.id && taskSourceId === 'all'
                    ? 'is-active'
                    : ''
                }
              >
                {filter.label}
                <span className="planner-task-count">
                  {filterPlannerTodos(todos, filter.id).length}
                </span>
              </button>
            ))}
          </nav>
        </div>

        {taskSources.length > 0 && (
          <div>
            <p className="planner-kicker">Connected lists</p>
            <nav aria-label="외부 할 일 목록" className="planner-task-filters">
              {taskSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  aria-pressed={taskSourceId === source.id}
                  onClick={() => setTaskSourceId(source.id)}
                  className={taskSourceId === source.id ? 'is-active' : ''}
                  style={{
                    '--source-color': source.color
                      ?? PROVIDER_FALLBACK[source.provider],
                  } as CSSProperties}
                >
                  <Circle
                    aria-hidden
                    size={9}
                    className="planner-source-dot"
                  />
                  {source.name}
                </button>
              ))}
            </nav>
          </div>
        )}

        <button
          type="button"
          onClick={onAddTodo}
          className="resq-primary-button"
        >
          <Plus aria-hidden size={15} />
          할 일 추가
        </button>
      </aside>

      <div className="planner-task-list">
        <header className="planner-task-list__header">
          <div>
            <p className="planner-kicker">Tasks</p>
            <h3>
              {taskSourceId === 'all'
                ? TASK_FILTERS.find(
                  (filter) => filter.id === taskFilter,
                )?.label
                : selectedSource?.name}
            </h3>
          </div>
          <span className="plan-count">{filteredTodos.length}개</span>
        </header>

        <ul>
          {filteredTodos.map((todo) => {
            const readOnly = isPlannerItemReadOnly(todo, readOnlySourceKeys)
            const pending = pendingTodoIds.has(todo.id)
              || deletingTodoIds.has(todo.id)

            return (
            <li
              key={todo.id}
              className={`${todo.done ? 'is-done' : ''} ${
                readOnly ? 'is-read-only' : ''
              }`}
            >
              <div className="planner-task-row__main">
                <input
                  type="checkbox"
                  aria-label={todo.title}
                  checked={todo.done}
                  onChange={() => onToggleTodo(todo)}
                  disabled={pending || readOnly}
                />
                <button
                  type="button"
                  aria-label={`${todo.title} 할 일 상세 보기`}
                  onClick={() => onSelectItem?.({ type: 'todo', todo })}
                  className="planner-task-row__detail"
                >
                  <strong>{todo.title}</strong>
                  <small>
                    {todo.due_date
                      ? `${shortDate(todo.due_date)} ${
                        todo.due_time ?? ''
                      }`.trim()
                      : '날짜 없음'}
                    {' · '}
                    {sourceLabel(todo, sources)}
                  </small>
                </button>
              </div>
              <span
                className="planner-priority-mark"
                style={{
                  '--item-color': PRIORITY_COLOR[todo.priority],
                } as CSSProperties}
              >
                {PRIORITY_LABEL[todo.priority]}
              </span>
              {readOnly && (
                <span
                  className="planner-read-only-mark"
                  title="읽기 전용 연결입니다. 원본 앱에서 수정하세요."
                >
                  <LockKeyhole aria-hidden size={13} />
                  읽기 전용
                </span>
              )}
              {todo.external_url && (
                <a
                  href={todo.external_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${todo.title} 원본 앱에서 열기`}
                  className="resq-icon-control planner-task-external"
                >
                  <ExternalLink aria-hidden size={14} />
                </a>
              )}
              {onDeleteTodo && (
                <button
                  type="button"
                  aria-label={`${todo.title} 삭제`}
                  title={readOnly
                    ? '읽기 전용 연결에서는 원본 앱에서 삭제하세요.'
                    : '할 일 삭제'}
                  onClick={() => onDeleteTodo(todo.id)}
                  disabled={pending || readOnly}
                  className="resq-icon-control planner-delete-control"
                >
                  <Trash2 aria-hidden size={14} />
                </button>
              )}
            </li>
            )
          })}
        </ul>

        {filteredTodos.length === 0 && (
          <div className="planner-view-empty">
            <CheckCircle2 aria-hidden size={24} />
            <strong>이 목록은 비어 있습니다</strong>
            <span>새 할 일을 추가하거나 다른 목록을 선택해 보세요.</span>
          </div>
        )}
      </div>
    </section>
  )
}
