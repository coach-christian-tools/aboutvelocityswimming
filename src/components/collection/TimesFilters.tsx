import { useId, useRef } from "react";
import { ChevronDown, X } from "lucide-react";
import SearchableSelect, {
  searchableSelectThreshold,
} from "@/components/shared/SearchableSelect";
import TimesEventSelector from "./TimesEventSelector";
import s from "./TimesDatabase.module.css";

export function FilterSummary({
  label,
  items,
  compact = false,
}: {
  label: string;
  items: [string, string | undefined][];
  compact?: boolean;
}) {
  return (
    <dl className={s.filterSummary} aria-label={label}>
      {items.map(([term, value]) =>
        value ? (
          <div key={term}>
            <dt className={compact ? "sr-only" : undefined}>{term}</dt>
            <dd>{value}</dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}

export function PopupPicker({
  label,
  value,
  onChange,
  options,
  all,
  course,
  onCourseChange,
  hideLabel = false,
  showChevron = true,
  searchPlaceholder,
}: {
  label: string;
  hideLabel?: boolean;
  showChevron?: boolean;
  searchPlaceholder?: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  all?: string;
  course?: string;
  onCourseChange?: (course: string) => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const isEvent = label.toLowerCase().includes("event");
  if (searchPlaceholder && options.length >= searchableSelectThreshold) {
    return (
      <SearchableSelect
        label={label}
        hideLabel={hideLabel}
        value={value}
        onChange={onChange}
        options={options}
        emptyLabel={all}
        searchPlaceholder={searchPlaceholder}
        fieldClassName={s.field}
        className={s.eventTrigger}
      />
    );
  }
  return (
    <div className={`${s.field} ${isEvent ? s.eventField : ""}`}>
      <label
        id={`${id}-label`}
        htmlFor={id}
        className={isEvent || hideLabel ? "sr-only" : undefined}
      >
        {label}
      </label>
      {isEvent && (
        <div
          className={s.inlineEventSelector}
          role="group"
          aria-labelledby={`${id}-label`}
        >
          <TimesEventSelector
            value={value}
            options={options}
            onChange={onChange}
            all={all}
            course={course}
            onCourseChange={onCourseChange}
          />
        </div>
      )}
      <button
        id={id}
        type="button"
        className={s.eventTrigger}
        aria-haspopup="dialog"
        aria-describedby={`${id}-value`}
        onClick={() => {
          dialog.current?.showModal();
          dialog.current
            ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
            ?.focus();
        }}
      >
        <span id={`${id}-value`}>
          {options.find(([key]) => key === value)?.[1] ??
            all ??
            `Select ${label.toLowerCase()}`}
        </span>
        {showChevron && <ChevronDown size={16} />}
      </button>
      <dialog
        ref={dialog}
        className={s.eventDialog}
        aria-labelledby={`${id}-title`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const bounds = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < bounds.left ||
              e.clientX > bounds.right ||
              e.clientY < bounds.top ||
              e.clientY > bounds.bottom
            )
              dialog.current?.close();
          }
        }}
      >
        <div className={s.popupHead}>
          <h2 id={`${id}-title`}>{label}</h2>
          <button
            type="button"
            className={s.button}
            aria-label={`Close ${label.toLowerCase()} picker`}
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        {isEvent ? (
          <TimesEventSelector
            value={value}
            options={options}
            all={all}
            course={course}
            onCourseChange={onCourseChange}
            onChange={(next) => {
              onChange(next);
              dialog.current?.close();
            }}
          />
        ) : (
          <div className={s.eventGrid}>
            {[...(all ? [["", all]] : []), ...options].map(([key, text]) => (
              <button
                key={key}
                type="button"
                aria-pressed={value === key}
                onClick={() => {
                  onChange(key);
                  dialog.current?.close();
                }}
              >
                {text}
              </button>
            ))}
          </div>
        )}
      </dialog>
    </div>
  );
}
export function FilterChips({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <fieldset className={s.courseField}>
      <legend>{label}</legend>
      <div className={s.chips}>
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            onClick={() => onChange(key)}
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
