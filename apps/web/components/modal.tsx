'use client';

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type RefObject,
	type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useExperience } from './experience-provider';
import { useUnsavedChanges } from './unsaved-changes-provider';
import { draftControlValue } from './unsaved-changes';

const dialogStack: HTMLElement[] = [];
const inertLocks = new Map<HTMLElement, { count: number; original: boolean }>();
let originalBodyOverflow = '';
const focusableSelector =
	'button:not(:disabled),a[href],input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

/** Used by forms and the mobile drawer; business logic stays with their owners. */
export function useDialogFocus(
	ref: RefObject<HTMLElement | null>,
	open: boolean,
	onClose: () => void,
) {
	const closeRef = useRef(onClose);
	closeRef.current = onClose;

	useEffect(() => {
		const dialog = ref.current;
		if (!open || !dialog) return;
		const opener =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		if (!dialogStack.length)
			originalBodyOverflow = document.body.style.overflow;
		const isolatedElements = new Set<HTMLElement>();
		// Isolate only siblings of this dialog's ancestry, including portalled dialogs.
		let branch: HTMLElement = dialog;
		while (branch.parentElement) {
			for (const sibling of branch.parentElement.children) {
				if (
					sibling !== branch &&
					sibling instanceof HTMLElement &&
					sibling.dataset.dialogBackdrop !== 'true'
				) {
					const lock = inertLocks.get(sibling);
					if (lock) lock.count += 1;
					else inertLocks.set(sibling, { count: 1, original: sibling.inert });
					isolatedElements.add(sibling);
					sibling.inert = true;
				}
			}
			if (branch.parentElement === document.body) break;
			branch = branch.parentElement;
		}
		dialogStack.push(dialog);
		document.body.style.overflow = 'hidden';
		dialog.focus({ preventScroll: true });

		const isTop = () => dialogStack.at(-1) === dialog;
		const controls = () =>
			[...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
				(element) =>
					element.tabIndex >= 0 &&
					element.getClientRects().length > 0 &&
					!element.closest('[inert]'),
			);
		const onKeyDown = (event: KeyboardEvent) => {
			if (!isTop()) return;
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				closeRef.current();
			} else if (event.key === 'Tab') {
				const items = controls();
				const first = items[0];
				const last = items.at(-1);
				if (!first || !last) {
					event.preventDefault();
					dialog.focus();
					return;
				}
				const active = document.activeElement;
				if (!dialog.contains(active) || active === dialog) {
					event.preventDefault();
					(event.shiftKey ? last : first).focus();
				} else if (event.shiftKey && active === first) {
					event.preventDefault();
					last.focus();
				} else if (!event.shiftKey && active === last) {
					event.preventDefault();
					first.focus();
				}
			}
		};
		const onFocus = (event: FocusEvent) => {
			if (
				isTop() &&
				event.target instanceof Node &&
				!dialog.contains(event.target)
			)
				dialog.focus({ preventScroll: true });
		};
		document.addEventListener('keydown', onKeyDown, true);
		document.addEventListener('focusin', onFocus);
		return () => {
			document.removeEventListener('keydown', onKeyDown, true);
			document.removeEventListener('focusin', onFocus);
			const index = dialogStack.indexOf(dialog);
			if (index >= 0) dialogStack.splice(index, 1);
			for (const element of isolatedElements) {
				const lock = inertLocks.get(element);
				if (!lock) continue;
				lock.count -= 1;
				if (!lock.count) {
					element.inert = lock.original;
					inertLocks.delete(element);
				}
			}
			if (!dialogStack.length)
				document.body.style.overflow = originalBodyOverflow;
			if (opener?.isConnected && !opener.closest('[inert]'))
				opener.focus({ preventScroll: true });
			else dialogStack.at(-1)?.focus({ preventScroll: true });
		};
	}, [open, ref]);
}

export function Modal({
	children,
	onClose,
	label,
	className = 'modal-backdrop',
	protectChanges = true,
	busy = false,
	dirty: externalDirty = false,
}: {
	children: ReactNode;
	onClose: () => void;
	label: string;
	className?: string;
	protectChanges?: boolean;
	busy?: boolean;
	dirty?: boolean;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [mounted, setMounted] = useState(false);
	const [dirty, setDirty] = useState(false);
	const baseline = useRef(new Map<Element, string>());
	const { tr } = useExperience();
	const { confirmDiscard } = useUnsavedChanges(
		protectChanges && (dirty || externalDirty),
	);
	const controls = useCallback(
		() => [
			...(ref.current?.querySelectorAll<
				HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
			>('input,textarea,select') ?? []),
		],
		[],
	);
	useEffect(() => {
		if (!mounted) return;
		baseline.current = new Map(
			controls().map((control) => [control, draftControlValue(control)]),
		);
	}, [controls, mounted]);
	useEffect(() => setMounted(true), []);
	const mayClose = () => {
		if (busy) {
			window.alert(
				tr(
					'Espera a que termine la operación. Salir no cancela una solicitud ya enviada.',
				),
			);
			return false;
		}
		return !protectChanges || confirmDiscard();
	};
	useDialogFocus(ref, mounted, () => {
		if (mayClose()) onClose();
	});
	if (!mounted) return null;
	return createPortal(
		<div
			ref={ref}
			className={className}
			role="dialog"
			aria-modal="true"
			aria-label={label}
			tabIndex={-1}
			onInputCapture={() => {
				if (protectChanges)
					setDirty(
						controls().some(
							(control) =>
								baseline.current.get(control) !== draftControlValue(control),
						),
					);
			}}
			onChangeCapture={() => {
				if (protectChanges)
					setDirty(
						controls().some(
							(control) =>
								baseline.current.get(control) !== draftControlValue(control),
						),
					);
			}}
			onClickCapture={(event) => {
				if (
					event.target instanceof Element &&
					event.target.closest('[data-dialog-close]') &&
					!mayClose()
				) {
					event.preventDefault();
					event.stopPropagation();
				}
			}}
		>
			{children}
		</div>,
		document.body,
	);
}
