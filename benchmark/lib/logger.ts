// Contest inputs, outputs, prompts and model errors must never enter logs.
export function safeLog(..._args: unknown[]) {}
export function safeError(..._args: unknown[]) {}
