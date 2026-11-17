function TaskItem({ task, onToggle, onDelete }) {
  return (
    <li className={task.isDone ? "task done" : "task"}>
      <label>
        <input
          type="checkbox"
          checked={task.isDone}
          onChange={() => onToggle(task.id)}
        />
        <span>{task.title}</span>
      </label>

      <div className="task-actions">
        {task.dueDate && <small>{task.dueDate}</small>}
        <button onClick={() => onDelete(task.id)}>삭제</button>
      </div>
    </li>
  );
}

export default TaskItem;