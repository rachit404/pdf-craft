"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { inputClass } from "./blocks";

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  autoComplete?: string;
  onChange: (value: string) => void;
}

/** Password field with a show/hide toggle. Never persisted or logged. */
export default function PasswordInput({
  id,
  label,
  value,
  disabled,
  placeholder,
  autoComplete = "new-password",
  onChange,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-medium text-gray-700"
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          maxLength={128}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={autoComplete}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} pr-12`}
        />

        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-gray-400 hover:text-gray-700"
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </div>
  );
}
