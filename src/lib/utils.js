export { cn } from 'cn';

// Prop helper types used by the shadcn-svelte components.
/**
 * @template T
 * @typedef {T extends { child?: any } ? Omit<T, 'child'> : T} WithoutChild
 */
/**
 * @template T
 * @typedef {T extends { children?: any } ? Omit<T, 'children'> : T} WithoutChildren
 */
/**
 * @template T
 * @typedef {WithoutChildren<WithoutChild<T>>} WithoutChildrenOrChild
 */
/**
 * @template T
 * @template {HTMLElement} [U=HTMLElement]
 * @typedef {T & { ref?: U | null }} WithElementRef
 */
