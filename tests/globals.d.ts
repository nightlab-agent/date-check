// What the tests use beyond the engine's declarations and es2023.
declare const console: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
interface String { isWellFormed(): boolean }
