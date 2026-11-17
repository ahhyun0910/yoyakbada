import DdayBadge from "./DdayBadge";

function DocumentCard({ document, isSelected, onSelect }) {
  return (
    <button
      className={isSelected ? "document-card active" : "document-card"}
      onClick={() => onSelect(document.id)}
    >
      <div className="card-top">
        <span className="file-type">{document.type}</span>
        <DdayBadge dday={document.dday} />
      </div>
      <strong>{document.title}</strong>
      <p>{document.summary}</p>
      <small>{document.source} · {document.createdAt}</small>
    </button>
  );
}

export default DocumentCard;