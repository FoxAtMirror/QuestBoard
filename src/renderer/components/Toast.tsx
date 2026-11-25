interface Props {
  data: { title: string; message: string };
}

/** Всплывающее уведомление в стиле игрового окна. */
export default function Toast({ data }: Props) {
  return (
    <div className="toast">
      <div className="toast-icon">!</div>
      <div className="toast-body">
        <div className="toast-title">{data.title}</div>
        <div className="toast-text">{data.message}</div>
      </div>
    </div>
  );
}
