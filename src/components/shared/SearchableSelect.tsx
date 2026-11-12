"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import styles from "./SearchableSelect.module.css";

export const searchableSelectThreshold = 20;

type Option = readonly [value: string, label: string, keywords?: string];

type FieldProps = {
  label: string;
  options: readonly Option[];
  emptyLabel?: string;
  searchPlaceholder?: string;
  fieldClassName?: string;
  className?: string;
  hideLabel?: boolean;
};

type SelectProps = FieldProps & {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
};

function searchableText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export default function SearchableSelect({
  name,
  value,
  defaultValue,
  onChange,
  ...field
}: SelectProps) {
  const id = useId();
  const [uncontrolledValue, setValue] = useState(
    defaultValue ?? (field.emptyLabel ? "" : (field.options[0]?.[0] ?? "")),
  );
  const selected = value ?? uncontrolledValue;

  function change(next: string) {
    if (value === undefined) setValue(next);
    onChange?.(next);
  }

  if (field.options.length < searchableSelectThreshold) {
    return (
      <div className={`${styles.field} ${field.fieldClassName ?? ""}`}>
        <label htmlFor={id} className={field.hideLabel ? "sr-only" : undefined}>
          {field.label}
        </label>
        <select
          id={id}
          name={name}
          value={selected}
          className={`${styles.control} ${field.className ?? ""}`}
          onChange={(event) => change(event.target.value)}
        >
          {field.emptyLabel && <option value="">{field.emptyLabel}</option>}
          {field.options.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={selected} />}
      <SearchablePicker
        {...field}
        selected={selected ? [selected] : []}
        onSelect={change}
      />
    </>
  );
}

export function SearchableMultiSelect({
  value,
  onChange,
  ...field
}: FieldProps & {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <SearchablePicker
      {...field}
      selected={value}
      multiple
      onSelect={(next) =>
        onChange(
          !next
            ? []
            : value.includes(next)
              ? value.filter((item) => item !== next)
              : [...value, next],
        )
      }
    />
  );
}

function SearchablePicker({
  label,
  options,
  emptyLabel,
  searchPlaceholder = "Search options",
  fieldClassName,
  className,
  hideLabel,
  selected,
  multiple = false,
  onSelect,
}: FieldProps & {
  selected: readonly string[];
  multiple?: boolean;
  onSelect: (value: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const terms = searchableText(query).split(" ").filter(Boolean);
  const visible: readonly Option[] = !open
    ? []
    : terms.length
      ? options.filter(([key, text, keywords = ""]) => {
          const haystack = searchableText(`${text} ${key} ${keywords}`);
          return terms.every((term) => haystack.includes(term));
        })
      : emptyLabel
        ? [["", emptyLabel], ...options]
        : options;
  const selectedKeys = new Set(selected);
  const isSelected = (key: string) =>
    key ? selectedKeys.has(key) : !selected.length;
  const activeIndex = visible.findIndex(([key]) => key === activeKey);
  const tabStop =
    activeIndex >= 0
      ? activeIndex
      : Math.max(
          0,
          terms.length ? -1 : visible.findIndex(([key]) => isSelected(key)),
        );
  const summary =
    selected.length > 1
      ? `${selected.length} selected`
      : (options.find(([key]) => selectedKeys.has(key))?.[1] ??
        emptyLabel ??
        "Select an option");

  function choose(key: string) {
    if (!multiple) dialog.current?.close();
    onSelect(key);
  }

  function focusOption(index: number) {
    const row = list.current?.children[index];
    row?.querySelector("button")?.focus();
  }

  function searchKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.current?.close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(event.key === "ArrowDown" ? 0 : visible.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (visible.length) choose(visible[tabStop][0]);
    }
  }

  function optionKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusOption(Math.min(index + 1, visible.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (index === 0) search.current?.focus();
        else focusOption(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusOption(0);
        break;
      case "End":
        event.preventDefault();
        focusOption(visible.length - 1);
        break;
    }
  }

  return (
    <div className={`${styles.field} ${fieldClassName ?? ""}`}>
      <label
        id={`${id}-label`}
        htmlFor={id}
        className={hideLabel ? "sr-only" : undefined}
      >
        {label}
      </label>
      <button
        ref={trigger}
        id={id}
        type="button"
        className={`${styles.control} ${styles.trigger} ${className ?? ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-dialog`}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-value`}
        onClick={() => {
          setQuery("");
          setActiveKey(null);
          dialog.current?.showModal();
          setOpen(true);
          search.current?.focus();
        }}
      >
        <span id={`${id}-value`}>{summary}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <dialog
        ref={dialog}
        id={`${id}-dialog`}
        className={styles.dialog}
        aria-labelledby={`${id}-title`}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const { top, right, bottom, left } =
            event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < left ||
            event.clientX > right ||
            event.clientY < top ||
            event.clientY > bottom
          ) {
            dialog.current?.close();
          }
        }}
      >
        <div className={styles.header}>
          <h2 id={`${id}-title`}>{label}</h2>
          <button
            type="button"
            className={styles.close}
            aria-label={`Close ${label} picker`}
            onClick={() => dialog.current?.close()}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.search}>
          <Search size={17} aria-hidden="true" />
          <input
            ref={search}
            type="search"
            aria-label={searchPlaceholder}
            aria-controls={`${id}-options`}
            placeholder={`${searchPlaceholder}…`}
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveKey(null);
              if (list.current) list.current.scrollTop = 0;
            }}
            onKeyDown={searchKeys}
          />
        </div>
        <p className={visible.length ? "sr-only" : styles.empty} role="status">
          {open &&
            (visible.length
              ? `${visible.length} ${visible.length === 1 ? "option" : "options"}`
              : "No matching options.")}
        </p>
        <ul
          ref={list}
          id={`${id}-options`}
          className={styles.options}
          role="listbox"
          aria-label={label}
          aria-multiselectable={multiple || undefined}
        >
          {visible.map(([key, text], index) => (
            <li key={key} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={isSelected(key)}
                tabIndex={index === tabStop ? 0 : -1}
                onFocus={() => setActiveKey(key)}
                onKeyDown={(event) => optionKeys(event, index)}
                onClick={() => choose(key)}
              >
                <span>{text}</span>
                {isSelected(key) && <Check size={17} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
        {multiple && (
          <div className={styles.footer}>
            <button type="button" onClick={() => dialog.current?.close()}>
              Done
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}
