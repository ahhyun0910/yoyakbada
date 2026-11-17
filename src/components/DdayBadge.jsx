function DdayBadge({ dday }) {
  let className = "badge normal";
  let label = `D-${dday}`;

  if (dday <= 1) {
    className = "badge danger";
    label = `D-${dday} 긴급`;
  } else if (dday <= 3) {
    className = "badge warning";
  }

  return <span className={className}>{label}</span>;
}

export default DdayBadge;