import { useEffect, useRef, useState } from "react";
import { FiCheck, FiChevronDown } from "react-icons/fi";

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  menuAlign?: "left" | "right";
  ariaLabel?: string;
}

const DEFAULT_TRIGGER_CLASS_NAME =
  "inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white outline-none transition-colors hover:border-white/20 focus:border-white/30 disabled:cursor-not-allowed disabled:opacity-50";

function getTriggerClassName(className?: string) {
  return `inline-flex items-center gap-1.5 ${className ?? DEFAULT_TRIGGER_CLASS_NAME}`;
}

export default function Select<T extends string>(
  props: SelectProps<T>,
): JSX.Element {
  const {
    value,
    options,
    onChange,
    disabled = false,
    className,
    menuAlign = "right",
    ariaLabel,
  } = props;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const currentOption = options.find((option) => option.value === value);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={disabled}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) {
            return;
          }
          setIsOpen((current) => !current);
        }}
        className={getTriggerClassName(className)}
      >
        <span>{currentOption?.label ?? value}</span>
        <FiChevronDown
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute top-full mt-2 z-50 min-w-[8rem] rounded-md border border-white/10 bg-neutral-800 py-1 shadow-xl ${
            menuAlign === "right" ? "right-0" : "left-0"
          }`}
        >
          <div role="listbox">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/10"
              >
                <span>{option.label}</span>
                {option.value === value && (
                  <FiCheck className="text-green-500" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
