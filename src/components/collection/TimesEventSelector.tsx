import s from "./TimesDatabase.module.css";

import { strokeColumns, eventColumn, compareEvents } from "./event-layout";

export default function TimesEventSelector({
  value,
  options,
  onChange,
  all,
  course,
  onCourseChange,
}: {
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
  all?: string;
  course?: string;
  onCourseChange?: (course: string) => void;
}) {
  return (
    <div className={s.strokeSelector}>
      {all && (
        <button
          className={s.button}
          aria-pressed={!value}
          onClick={() => onChange("")}
        >
          {all}
        </button>
      )}
      {all && onCourseChange && (
        <button
          className={s.button}
          aria-pressed={course === ""}
          onClick={() => onCourseChange("")}
        >
          All courses
        </button>
      )}
      <div className={s.strokeColumns}>
        {strokeColumns.map(([stroke, heading, title]) => (
          <section key={stroke} aria-label={title}>
            <h3 title={title}>{heading}</h3>
            {options
              .filter(([key]) => eventColumn(key) === stroke)
              .sort(([a], [b]) => compareEvents(a, b))
              .map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={value === key}
                  onClick={() => onChange(key)}
                >
                  {key.split("_")[0]}
                  {key.includes("-R") ? "R" : ""}
                  {key.split("_")[2] && <small>{key.split("_")[2]}</small>}
                </button>
              ))}
            {onCourseChange &&
              (stroke === "FL" || stroke === "BK" || stroke === "BR") && (
                <button
                  type="button"
                  className={s.selectorCourse}
                  aria-pressed={
                    course === { FL: "LCM", BK: "SCY", BR: "SCM" }[stroke]
                  }
                  onClick={() =>
                    onCourseChange({ FL: "LCM", BK: "SCY", BR: "SCM" }[stroke])
                  }
                >
                  {{ FL: "LCM", BK: "SCY", BR: "SCM" }[stroke]}
                </button>
              )}
          </section>
        ))}
      </div>
    </div>
  );
}
