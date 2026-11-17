// The interactive prompts the creation wizard uses. The wizard depends only
// on the Prompter interface, so tests can drive it with scripted answers;
// the real implementation uses @clack/prompts.

import * as clack from "@clack/prompts";

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export interface Prompter {
  intro(title: string): void;
  outro(message: string): void;
  note(message: string, title?: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
  text(options: {
    message: string;
    initialValue?: string;
    placeholder?: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string>;
  confirm(options: { message: string; initialValue?: boolean }): Promise<boolean>;
  select<T extends string>(options: { message: string; options: Choice<T>[]; initialValue?: T }): Promise<T>;
  multiselect<T extends string>(options: {
    message: string;
    options: Choice<T>[];
    initialValues?: T[];
  }): Promise<T[]>;
  spinner(): { start(message: string): void; stop(message: string): void };
}

/** The person cancelled (Ctrl+C or Escape). */
export class Cancelled extends Error {
  constructor() {
    super("Cancelled — nothing was created.");
  }
}

function answer<T>(value: T): Exclude<T, symbol> {
  if (clack.isCancel(value)) throw new Cancelled();
  return value as Exclude<T, symbol>;
}

export const clackPrompter: Prompter = {
  intro: (title) => clack.intro(title),
  outro: (message) => clack.outro(message),
  note: (message, title) => clack.note(message, title),
  info: (message) => clack.log.info(message),
  warn: (message) => clack.log.warn(message),
  error: (message) => clack.log.error(message),
  success: (message) => clack.log.success(message),
  text: async ({ message, initialValue, placeholder, validate }) =>
    answer(
      await clack.text({
        message,
        initialValue,
        placeholder,
        validate: validate ? (value) => validate(value ?? "") : undefined,
      }),
    ),
  confirm: async ({ message, initialValue }) => answer(await clack.confirm({ message, initialValue })),
  select: async ({ message, options, initialValue }) =>
    answer(await clack.select({ message, options: options as clack.Option<typeof initialValue>[], initialValue })) as never,
  multiselect: async ({ message, options, initialValues }) =>
    answer(
      await clack.multiselect({
        message,
        options: options as clack.Option<(typeof options)[number]["value"]>[],
        initialValues,
        required: false,
      }),
    ) as never,
  spinner: () => {
    const spin = clack.spinner();
    return { start: (message) => spin.start(message), stop: (message) => spin.stop(message) };
  },
};
